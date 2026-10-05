import type { AppContext, Screen } from '../app/context';
import type { RecordFilter } from '../storage/repository';
import { chips } from '../ui/components';
import { h } from '../ui/dom';
import { recordCard } from './record-list';

interface ListOpts {
  filters: { value: RecordFilter; label: string }[];
  initial: RecordFilter;
  empty: Record<RecordFilter, string>;
  allowDelete: boolean;
  storeKey: string;
}

function listScreen(ctx: AppContext, o: ListOpts): Screen {
  const root = h('div', { class: 'screen' });
  const bar = h('div', { class: 'filter-bar' });
  const list = h('div', { class: 'rec-list' });
  root.append(bar, list);
  let filter: RecordFilter = o.initial;
  try {
    const s = sessionStorage.getItem(o.storeKey) as RecordFilter | null;
    if (s && o.filters.some((f) => f.value === s)) filter = s;
  } catch {
    /* ignore */
  }

  const draw = async () => {
    bar.replaceChildren(
      chips({
        ariaLabel: 'Filter',
        selected: filter,
        items: o.filters,
        onPick: (v) => {
          filter = v as RecordFilter;
          try {
            sessionStorage.setItem(o.storeKey, filter);
          } catch {
            /* ignore */
          }
          void draw();
        },
      }),
    );
    const recs = await ctx.repo.list(filter);
    list.replaceChildren(
      ...(recs.length
        ? recs.map((r) => recordCard(ctx, r, { allowDelete: o.allowDelete, onChange: () => void draw() }))
        : [h('div', { class: 'empty' }, o.empty[filter])]),
    );
  };
  void draw();
  return { el: root };
}

export const savedScreen = (ctx: AppContext): Screen =>
  listScreen(ctx, {
    filters: [
      { value: 'saved', label: 'ALL SAVED' },
      { value: 'favorites', label: '★ FAVORITES' },
      { value: 'notes', label: 'WITH NOTES' },
    ],
    initial: 'saved',
    storeKey: 'tm-saved-filter',
    allowDelete: true,
    empty: {
      saved: 'Nothing saved yet. Run a calculation and tap SAVE.',
      favorites: 'No favorites yet. Tap the ★ on a calculation.',
      notes: 'No notes yet. Tap NOTES on a result to add a job note.',
      recents: '',
      all: '',
    },
  });

export const historyScreen = (ctx: AppContext): Screen =>
  listScreen(ctx, {
    filters: [
      { value: 'recents', label: 'RECENTS', },
      { value: 'all', label: 'FULL HISTORY' },
    ],
    initial: 'recents',
    storeKey: 'tm-history-filter',
    allowDelete: true,
    empty: {
      recents: 'No recent calculations yet.',
      all: 'No calculations yet. Every CALCULATE is recorded here.',
      saved: '',
      favorites: '',
      notes: '',
    },
  });
