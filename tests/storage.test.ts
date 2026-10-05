import { describe, expect, it } from 'vitest';
import { MemoryBackend } from '../src/storage/memory';
import { Repository, RECENTS_LIMIT } from '../src/storage/repository';
import { migrateRecord } from '../src/storage/migrations';
import type { CalcRecord } from '../src/storage/types';

const draft = (n: number, extra = {}) => ({
  calcId: 'thread', signature: `sig${n}`, title: `T${n}`, subtitle: '', inputs: { n }, summary: [], engine: 'test', ...extra,
});
let clock = 1000;
const mk = () => new Repository(new MemoryBackend(), () => ++clock);

describe('repository', () => {
  it('dedupes identical calculations and keeps their note/favorite', async () => {
    const r = mk();
    const a = await r.recordCalculation(draft(1));
    await r.setNote(a.id, 'Job 4471 – Haas VF2');
    await r.setFavorite(a.id, true);
    const b = await r.recordCalculation(draft(1));
    expect(b.id).toBe(a.id);
    expect(b.note).toBe('Job 4471 – Haas VF2');
    expect(b.favorite).toBe(true);
    expect((await r.list('all')).length).toBe(1);
  });
  it('favorite and note imply saved; unsave clears favorite', async () => {
    const r = mk();
    const a = await r.recordCalculation(draft(1));
    expect(a.saved).toBe(false);
    expect((await r.setFavorite(a.id, true))!.saved).toBe(true);
    const c = await r.recordCalculation(draft(2));
    expect((await r.setNote(c.id, 'x'))!.saved).toBe(true);
    expect((await r.setSaved(a.id, false))!.favorite).toBe(false);
  });
  it('filters', async () => {
    const r = mk();
    const a = await r.recordCalculation(draft(1));
    const b = await r.recordCalculation(draft(2));
    await r.recordCalculation(draft(3));
    await r.setFavorite(a.id, true);
    await r.setNote(b.id, 'note');
    expect((await r.list('saved')).length).toBe(2);
    expect((await r.list('favorites')).map((x) => x.id)).toEqual([a.id]);
    expect((await r.list('notes')).map((x) => x.id)).toEqual([b.id]);
    expect((await r.list('recents'))[0]!.signature).toBe('sig2'); // most recently touched (note edit counts as activity)
  });
  it('clearRecents keeps saved, favorites and notes', async () => {
    const r = mk();
    const a = await r.recordCalculation(draft(1));
    await r.recordCalculation(draft(2));
    await r.setSaved(a.id, true);
    expect(await r.clearRecents()).toBe(1);
    expect((await r.list('all')).length).toBe(1);
  });
  it('prunes only disposable recents beyond the cap', async () => {
    const r = mk();
    const keep = await r.recordCalculation(draft(0));
    await r.setSaved(keep.id, true);
    for (let i = 1; i <= RECENTS_LIMIT + 5; i++) await r.recordCalculation(draft(i));
    const all = await r.list('all');
    expect(all.length).toBe(RECENTS_LIMIT + 1);
    expect(all.some((x) => x.id === keep.id)).toBe(true);
  });
  it('settings merge over defaults; clearAll wipes everything', async () => {
    const r = mk();
    expect((await r.getSettings()).wireMode).toBe('actual');
    await r.saveSettings({ ...(await r.getSettings()), defaultUnit: 'mm' });
    expect((await r.getSettings()).defaultUnit).toBe('mm');
    await r.recordCalculation(draft(1));
    await r.clearAll();
    expect((await r.list('all')).length).toBe(0);
    expect((await r.getSettings()).defaultUnit).toBe('in');
  });
  it('exports a structured bundle', async () => {
    const r = mk();
    await r.recordCalculation(draft(1));
    const b = await r.exportBundle();
    expect(b.format).toBe('thread-mav-export');
    expect(b.records.length).toBe(1);
  });
  it('migrates legacy records without losing data', () => {
    const legacy = { id: 'x', calcId: 'thread', signature: 's', title: 'old', inputs: {}, createdAt: 1, updatedAt: 1 } as unknown as CalcRecord;
    const m = migrateRecord(legacy);
    expect(m.v).toBe(1);
    expect(m.note).toBe('');
    expect(m.title).toBe('old');
    const future = { ...legacy, v: 99 } as CalcRecord;
    expect(migrateRecord(future)).toBe(future);
  });
});
