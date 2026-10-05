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
  const saveBtn = h('button', { class: 'btn btn-action', type: 'button' });
  const favBtn = h('button', { class: 'btn btn-action', type: 'button' });
  const noteBtn = h('button', { class: 'btn btn-action', type: 'button' });
  const shareBtn = h('button', { class: 'btn btn-action', type: 'button' }, icon('share', 22), h('span', null, 'SHARE'));
  const newBtn = h('button', { class: 'btn btn-secondary btn-wide', type: 'button' }, 'NEW CALC');
  const el = h('div', { class: 'action-bar' }, indicators, h('div', { class: 'action-grid' }, saveBtn, favBtn, noteBtn, shareBtn), newBtn);

  const refresh = () => {
    const rec = getRecord();
    saveBtn.replaceChildren(icon(rec?.saved ? 'check' : 'saved', 22), h('span', null, rec?.saved ? 'SAVED' : 'SAVE'));
    saveBtn.classList.toggle('on-saved', !!rec?.saved);
    favBtn.replaceChildren(icon('star', 22), h('span', null, 'FAVORITE'));
    favBtn.classList.toggle('on-fav', !!rec?.favorite);
    favBtn.setAttribute('aria-pressed', String(!!rec?.favorite));
    noteBtn.replaceChildren(icon('note', 22), h('span', null, 'NOTES'));
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
