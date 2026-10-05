import type { AppContext } from '../app/context';
import { favIndicator, noteIndicator } from '../ui/components';
import { confirmDialog } from '../ui/dialogs';
import { h, icon } from '../ui/dom';
import type { CalcRecord } from '../storage/types';
import { CALCULATORS } from '../calculators/registry';

export function fmtWhen(ts: number, short = false): string {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (short) return d.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  if (d.toDateString() === now.toDateString()) return `Today ${time}`;
  const y = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })} ${time}`;
}

const openRecord = (ctx: AppContext, rec: CalcRecord) => ctx.go(CALCULATORS.find((c) => c.id === rec.calcId)?.route ?? rec.calcId, { r: rec.id });

/** Split "0.3883 in" -> number + unit for the green headline value. */
function headline(rec: CalcRecord) {
  const first = rec.summary[0];
  if (!first) return null;
  const m = /^([\d.\-—°′″ ]+?)\s*(in|mm)?(?:\s*\[.*\])?$/.exec(first.value);
  const wire = rec.summary.find((l) => l.label.startsWith('Wire used'));
  return { num: m?.[1]?.trim() ?? first.value, unit: m?.[2] ?? '', alt: first.alt, wire: wire?.value.replace(/\s*\[.*\]$/, '') };
}

/** History / Saved list card: designation left, green headline result right, wire under it. */
export function recordCard(ctx: AppContext, rec: CalcRecord, opts: { allowDelete: boolean; onChange(): void }): HTMLElement {
  const calc = CALCULATORS.find((c) => c.id === rec.calcId);
  const hl = headline(rec);
  return h(
    'div',
    { class: 'card rec-card' },
    h(
      'button',
      { class: 'rec-main', type: 'button', on: { click: () => openRecord(ctx, rec) }, 'aria-label': `Open ${rec.title}` },
      h(
        'div',
        { class: 'rec-row' },
        h('div', { class: 'rec-left' }, h('div', { class: 'rec-title' }, rec.title), h('div', { class: 'rec-sub' }, rec.subtitle), h('div', { class: 'rec-when' }, `${calc?.name ?? rec.calcId} · ${fmtWhen(rec.updatedAt)}`)),
        hl
          ? h('div', { class: 'rec-right' }, h('div', { class: 'rec-num' }, hl.num, hl.unit ? h('small', null, ` ${hl.unit}`) : null), hl.wire ? h('div', { class: 'rec-wire' }, hl.wire) : hl.alt ? h('div', { class: 'rec-wire' }, hl.alt) : null)
          : null,
      ),
      h('div', { class: 'indicators' }, rec.favorite ? favIndicator() : null, rec.note ? noteIndicator() : null, rec.saved ? h('span', { class: 'ind ind-saved' }, 'SAVED') : null),
      rec.note ? h('div', { class: 'note-preview' }, rec.note) : null,
    ),
    h(
      'div',
      { class: 'rec-actions' },
      h(
        'button',
        {
          class: `icon-btn ${rec.favorite ? 'on-fav' : ''}`,
          type: 'button',
          'aria-label': rec.favorite ? 'Remove favorite' : 'Add favorite',
          'aria-pressed': String(rec.favorite),
          on: {
            click: async () => {
              await ctx.repo.setFavorite(rec.id, !rec.favorite);
              opts.onChange();
            },
          },
        },
        icon('star', 24),
      ),
      opts.allowDelete
        ? h(
            'button',
            {
              class: 'icon-btn icon-btn-danger',
              type: 'button',
              'aria-label': 'Delete',
              on: {
                click: async () => {
                  const okDel = await confirmDialog({
                    title: 'Delete this calculation?',
                    message: `“${rec.title}”${rec.note ? ' and its note' : ''} will be permanently removed from this device.`,
                    confirmText: 'DELETE',
                    danger: true,
                  });
                  if (okDel) {
                    await ctx.repo.deleteRecord(rec.id);
                    ctx.toast('Deleted');
                    opts.onChange();
                  }
                },
              },
            },
            icon('trash', 22),
          )
        : null,
    ),
  );
}

/** Compact "Your saved threads" row: ★ title, meta, NOTES badge, date, chevron. */
export function savedRow(ctx: AppContext, rec: CalcRecord): HTMLElement {
  return h(
    'button',
    { class: 'saved-row', type: 'button', on: { click: () => openRecord(ctx, rec) }, 'aria-label': `Open ${rec.title}` },
    h('span', { class: `star ${rec.favorite ? 'on' : ''}` }, icon('star', 22)),
    h('span', { class: 'sr-main' }, h('span', { class: 'sr-title' }, rec.title), h('span', { class: 'sr-meta' }, rec.subtitle)),
    h('span', { class: 'sr-side' }, rec.note ? h('span', { class: 'ind ind-note' }, 'NOTES') : h('span', { class: 'ind ind-none' }, 'NO NOTES'), h('span', { class: 'sr-date' }, fmtWhen(rec.updatedAt, true))),
    icon('chevron', 20),
  );
}
