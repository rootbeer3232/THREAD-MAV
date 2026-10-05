import { DEFAULT_SETTINGS, type Settings } from '../core/settings-model';
import { IdbBackend } from './idb';
import { MemoryBackend } from './memory';
import { migrateRecord } from './migrations';
import { type CalcRecord, type ExportBundle, RECORD_VERSION, type StorageBackend, type SummaryLine } from './types';

/** How many un-saved "recent" calculations to retain before pruning the oldest. */
export const RECENTS_LIMIT = 100;

export interface CalcDraft {
  calcId: string;
  signature: string;
  title: string;
  subtitle: string;
  inputs: unknown;
  summary: SummaryLine[];
  engine: string;
}

export type RecordFilter = 'recents' | 'all' | 'saved' | 'favorites' | 'notes';

function newId(): string {
  const c = globalThis.crypto as Crypto | undefined;
  if (c?.randomUUID) return c.randomUUID();
  return `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

export class Repository {
  private listeners = new Set<() => void>();
  constructor(readonly backend: StorageBackend, private now: () => number = Date.now) {}

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  private emit() {
    this.listeners.forEach((f) => f());
  }

  /* ---------- calculation records ---------- */

  /** Record a calculation. Identical inputs reuse the existing record (keeping its note/favorite/saved). */
  async recordCalculation(d: CalcDraft): Promise<CalcRecord> {
    const all = await this.backend.allRecords();
    const existing = all.map(migrateRecord).find((r) => r.calcId === d.calcId && r.signature === d.signature);
    const t = this.now();
    let rec: CalcRecord;
    if (existing) {
      rec = { ...existing, ...pickDraft(d), updatedAt: t };
    } else {
      rec = { ...pickDraft(d), v: RECORD_VERSION, id: newId(), createdAt: t, updatedAt: t, saved: false, favorite: false, note: '' };
    }
    await this.backend.putRecord(rec);
    await this.prune();
    this.emit();
    return rec;
  }

  private async prune() {
    const all = (await this.backend.allRecords()).map(migrateRecord);
    const disposable = all.filter((r) => !r.saved && !r.favorite && !r.note).sort((a, b) => b.updatedAt - a.updatedAt);
    const extra = disposable.slice(RECENTS_LIMIT).map((r) => r.id);
    if (extra.length) await this.backend.deleteRecords(extra);
  }

  async findBySignature(calcId: string, signature: string): Promise<CalcRecord | undefined> {
    const all = (await this.backend.allRecords()).map(migrateRecord);
    return all.find((r) => r.calcId === calcId && r.signature === signature);
  }

  async getRecord(id: string): Promise<CalcRecord | undefined> {
    const r = await this.backend.getRecord(id);
    return r ? migrateRecord(r) : undefined;
  }

  private async mutate(id: string, fn: (r: CalcRecord) => void): Promise<CalcRecord | undefined> {
    const r = await this.getRecord(id);
    if (!r) return undefined;
    fn(r);
    r.updatedAt = this.now();
    await this.backend.putRecord(r);
    this.emit();
    return r;
  }

  setSaved(id: string, saved: boolean) {
    return this.mutate(id, (r) => {
      r.saved = saved;
      if (!saved) r.favorite = false;
    });
  }
  /** Favoriting also saves the calculation. */
  setFavorite(id: string, favorite: boolean) {
    return this.mutate(id, (r) => {
      r.favorite = favorite;
      if (favorite) r.saved = true;
    });
  }
  /** A note also saves the calculation. Empty note removes it. */
  setNote(id: string, note: string) {
    return this.mutate(id, (r) => {
      r.note = note.trim();
      if (r.note) r.saved = true;
    });
  }

  async deleteRecord(id: string) {
    await this.backend.deleteRecords([id]);
    this.emit();
  }

  async list(filter: RecordFilter): Promise<CalcRecord[]> {
    const all = (await this.backend.allRecords()).map(migrateRecord).sort((a, b) => b.updatedAt - a.updatedAt);
    switch (filter) {
      case 'recents':
        return all.slice(0, 25);
      case 'all':
        return all;
      case 'saved':
        return all.filter((r) => r.saved);
      case 'favorites':
        return all.filter((r) => r.favorite);
      case 'notes':
        return all.filter((r) => r.note.length > 0);
    }
  }

  /** Remove auto-recorded calculations that were never saved, favorited or annotated. */
  async clearRecents(): Promise<number> {
    const all = (await this.backend.allRecords()).map(migrateRecord);
    const ids = all.filter((r) => !r.saved && !r.favorite && !r.note).map((r) => r.id);
    await this.backend.deleteRecords(ids);
    this.emit();
    return ids.length;
  }

  async clearAll() {
    await this.backend.clearAll();
    this.emit();
  }

  /* ---------- settings & drafts ---------- */

  async getSettings(): Promise<Settings> {
    const stored = (await this.backend.getKV<Partial<Settings>>('settings')) ?? {};
    return { ...DEFAULT_SETTINGS, ...stored };
  }
  async saveSettings(s: Settings) {
    await this.backend.setKV('settings', s);
    this.emit();
  }
  getDraft<T>(calcId: string) {
    return this.backend.getKV<T>(`draft:${calcId}`);
  }
  setDraft<T>(calcId: string, v: T) {
    return this.backend.setKV(`draft:${calcId}`, v);
  }

  /* ---------- export ---------- */

  async exportBundle(filter: RecordFilter = 'all'): Promise<ExportBundle> {
    return {
      app: 'Thread Mav',
      format: 'thread-mav-export',
      formatVersion: 1,
      exportedAt: new Date(this.now()).toISOString(),
      schemaVersion: this.backend.schemaVersion,
      records: await this.list(filter),
      settings: await this.getSettings(),
    };
  }
}

function pickDraft(d: CalcDraft) {
  return {
    calcId: d.calcId,
    signature: d.signature,
    title: d.title,
    subtitle: d.subtitle,
    inputs: d.inputs,
    summary: d.summary,
    engine: d.engine,
  };
}

/** Open IndexedDB; fall back to memory (flagged) if the browser refuses storage. */
export async function openRepository(): Promise<{ repo: Repository; fallbackReason?: string }> {
  try {
    return { repo: new Repository(await IdbBackend.open()) };
  } catch (err) {
    return { repo: new Repository(new MemoryBackend()), fallbackReason: err instanceof Error ? err.message : String(err) };
  }
}
