import type { AppContext } from '../app/context';
import { shareText } from '../app/share';
import type { CalcRecord } from '../storage/types';
import { h, icon } from './dom';
import { noteDialog } from './dialogs';
import { favIndicator, noteIndicator } from './components';

/**
 * SAVE / FAVORITE / NOTES / SHARE + NEW CALC, shared by every calculator.
 * The calculator supplies the current record and the share text.
 */
export function createActionBar(opts: {
  ctx: AppContext;
  getShareText(note: string): string;
  shareTitle(): string;
  onNew(): void;
}) {
  const { ctx } = opts;
  let record: CalcRecord | null = null;
  const getRecord = () => record;
  const indicators = h('div', { class: 'indicators' });
  const saveBtn = h('button', { class: 'btn btn-primary btn-save', type: 'button' });
  const newBtn = h('button', { class: 'btn btn-secondary', type: 'button' }, 'NEW CALC');
  const favBtn = h('button', { class: 'btn btn-action act-fav', type: 'button' });
  const noteBtn = h('button', { class: 'btn btn-action act-note', type: 'button' });
  const shareBtn = h('button', { class: 'btn btn-action act-share', type: 'button' });
  const act = (ic: 'star' | 'note' | 'share', title: string, sub: string) => [icon(ic, 26), h('span', { class: 'act-t' }, title), h('small', { class: 'act-s' }, sub)];
  shareBtn.replaceChildren(...act('share', 'SHARE / EXPORT', 'SEND OR COPY'));
  const el = h('div', { class: 'action-bar' }, h('div', { class: 'btn-row' }, newBtn, saveBtn), h('div', { class: 'action-grid' }, favBtn, noteBtn, shareBtn), indicators);

  const refresh = () => {
    const rec = getRecord();
    saveBtn.replaceChildren(rec?.saved ? '✓ SAVED' : 'SAVE');
    saveBtn.classList.toggle('on-saved', !!rec?.saved);
    favBtn.replaceChildren(...act('star', 'FAVORITE', rec?.favorite ? 'SAVED ★' : 'PIN THIS ONE'));
    favBtn.classList.toggle('on-fav', !!rec?.favorite);
    favBtn.setAttribute('aria-pressed', String(!!rec?.favorite));
    noteBtn.replaceChildren(...act('note', rec?.note ? 'NOTES • SAVED' : 'NOTES', rec?.note ? 'TAP TO EDIT' : 'TAP TO ADD'));
    noteBtn.classList.toggle('on-note', !!rec?.note);
    indicators.replaceChildren(...(rec?.note ? [noteIndicator()] : []), ...(rec?.favorite ? [favIndicator()] : []));
    if (rec?.note) indicators.append(h('div', { class: 'note-preview' }, rec.note));
  };

  saveBtn.addEventListener('click', async () => {
    const rec = getRecord();
    if (!rec) return;
    await ctx.repo.setSaved(rec.id, true);
    ctx.toast('Saved');
  });
  favBtn.addEventListener('click', async () => {
    const rec = getRecord();
    if (!rec) return;
    const next = !rec.favorite;
    await ctx.repo.setFavorite(rec.id, next);
    ctx.toast(next ? 'Added to favorites' : 'Removed from favorites');
  });
  noteBtn.addEventListener('click', async () => {
    const rec = getRecord();
    if (!rec) return;
    const text = await noteDialog(rec.note);
    if (text === null) return;
    await ctx.repo.setNote(rec.id, text);
    ctx.toast(text.trim() ? 'Note saved' : 'Note removed');
  });
  shareBtn.addEventListener('click', () => {
    const rec = getRecord();
    void shareText(opts.shareTitle(), opts.getShareText(rec?.note ?? ''), ctx.toast);
  });
  newBtn.addEventListener('click', opts.onNew);

  const unsub = ctx.repo.subscribe(async () => {
    if (!record) return;
    const fresh = await ctx.repo.getRecord(record.id);
    if (fresh) {
      record = fresh;
      refresh();
    }
  });

  return {
    el,
    setRecord(rec: CalcRecord | null) {
      record = rec;
      refresh();
    },
    getRecord,
    destroy: unsub,
  };
}
