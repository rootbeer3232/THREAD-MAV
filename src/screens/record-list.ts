import type { AppContext } from '../app/context';
import { favIndicator, noteIndicator } from '../ui/components';
import { confirmDialog } from '../ui/dialogs';
import { h, icon } from '../ui/dom';
import type { CalcRecord } from '../storage/types';
import { CALCULATORS } from '../calculators/registry';

export function fmtWhen(ts: number): string {
  const d = new Date(ts);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  const time = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  if (sameDay) return `Today ${time}`;
  const y = new Date(now.getTime() - 86_400_000);
  if (d.toDateString() === y.toDateString()) return `Yesterday ${time}`;
  return `${d.toLocaleDateString([], { month: 'short', day: 'numeric', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' })} ${time}`;
}

export function recordCard(ctx: AppContext, rec: CalcRecord, opts: { allowDelete: boolean; onChange(): void }): HTMLElement {
  const calc = CALCULATORS.find((c) => c.id === rec.calcId);
  const first = rec.summary[0];
  const open = () => ctx.go(calc?.route ?? rec.calcId, { r: rec.id });
  const card = h(
    'div',
    { class: 'card rec-card' },
    h(
      'button',
      { class: 'rec-main', type: 'button', on: { click: open }, 'aria-label': `Open ${rec.title}` },
      h('div', { class: 'rec-top' }, h('span', { class: 'rec-title' }, rec.title), h('span', { class: 'rec-when' }, fmtWhen(rec.updatedAt))),
      h('div', { class: 'rec-sub' }, `${calc?.name ?? rec.calcId} · ${rec.subtitle}`),
      first ? h('div', { class: 'rec-first' }, h('span', { class: 'dim' }, `${first.label}: `), h('strong', null, first.value), first.alt ? h('span', { class: 'val-alt-inline' }, ` (${first.alt})`) : null) : null,
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
  return card;
}
