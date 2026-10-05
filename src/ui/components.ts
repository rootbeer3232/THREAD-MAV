import { sanitizeDecimalInput } from '../core/numeric';
import type { Presentation, ResultRow, Tag } from '../core/results';
import { type FormatOptions, fmtDual } from '../core/format';
import { h, icon } from './dom';

/* ---------- numeric field ---------- */

export interface NumericField {
  el: HTMLElement;
  input: HTMLInputElement;
  get(): string;
  set(v: string): void;
  setError(msg: string | null): void;
  setUnit(u: string | null): void;
  setLabel(l: string): void;
}

export function numericField(opts: {
  id: string;
  label: string;
  unit?: string | null;
  value?: string;
  placeholder?: string;
  hint?: string;
  onInput?: (v: string) => void;
  onEnter?: () => void;
}): NumericField {
  const input = h('input', {
    id: `f-${opts.id}`,
    class: 'num-input',
    type: 'text',
    inputmode: 'decimal',
    enterkeyhint: 'done',
    autocomplete: 'off',
    autocorrect: 'off',
    autocapitalize: 'off',
    spellcheck: 'false',
    placeholder: opts.placeholder ?? '',
    'aria-describedby': `e-${opts.id}`,
  });
  input.value = opts.value ?? '';
  const unitEl = h('span', { class: 'unit-chip' }, opts.unit ?? '');
  const clearBtn = h('button', { class: 'clear-x', type: 'button', 'aria-label': `Clear ${opts.label}`, tabindex: '-1' }, '×');
  const err = h('div', { id: `e-${opts.id}`, class: 'field-error', role: 'alert' });
  const labelEl = h('label', { for: `f-${opts.id}`, class: 'field-label' }, opts.label);
  const wrap = h('div', { class: 'field' }, labelEl, h('div', { class: 'input-row' }, input, clearBtn, unitEl), opts.hint ? h('div', { class: 'field-hint' }, opts.hint) : null, err);

  const sync = () => {
    clearBtn.style.visibility = input.value ? 'visible' : 'hidden';
    unitEl.style.display = unitEl.textContent ? '' : 'none';
  };
  input.addEventListener('input', () => {
    const clean = sanitizeDecimalInput(input.value);
    if (clean !== input.value) input.value = clean;
    err.textContent = '';
    wrap.classList.remove('has-error');
    sync();
    opts.onInput?.(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
      opts.onEnter?.();
    }
  });
  clearBtn.addEventListener('click', () => {
    input.value = '';
    sync();
    opts.onInput?.('');
    input.focus();
  });
  sync();
  return {
    el: wrap,
    input,
    get: () => input.value,
    set: (v) => {
      input.value = v;
      sync();
    },
    setError: (m) => {
      err.textContent = m ? `⚠ ${m}` : '';
      wrap.classList.toggle('has-error', !!m);
    },
    setUnit: (u) => {
      unitEl.textContent = u ?? '';
      sync();
    },
    setLabel: (l) => {
      labelEl.textContent = l;
    },
  };
}

/* ---------- segmented / chips / buttons ---------- */

export function segmented<T extends string>(opts: {
  options: { value: T; label: string; sub?: string }[];
  value: T;
  onChange(v: T): void;
  tone?: 'blue' | 'neutral';
  ariaLabel: string;
}): HTMLElement {
  const root = h('div', { class: `segmented ${opts.tone === 'neutral' ? 'seg-neutral' : ''}`, role: 'group', 'aria-label': opts.ariaLabel });
  for (const o of opts.options) {
    root.append(
      h(
        'button',
        {
          type: 'button',
          class: 'seg-btn',
          'aria-pressed': String(o.value === opts.value),
          on: { click: () => opts.onChange(o.value) },
        },
        h('span', { class: 'seg-main' }, o.label),
        o.sub ? h('span', { class: 'seg-sub' }, o.sub) : null,
      ),
    );
  }
  return root;
}

export function chips(opts: {
  items: { value: string; label: string; sub?: string }[];
  selected?: string | null;
  onPick(v: string): void;
  ariaLabel: string;
}): HTMLElement {
  const root = h('div', { class: 'chips', role: 'group', 'aria-label': opts.ariaLabel });
  for (const it of opts.items) {
    root.append(
      h(
        'button',
        { type: 'button', class: 'chip', 'aria-pressed': String(it.value === opts.selected), on: { click: () => opts.onPick(it.value) } },
        h('span', null, it.label),
        it.sub ? h('small', null, it.sub) : null,
      ),
    );
  }
  return root;
}

export function selectField(opts: {
  id: string;
  label: string;
  options: { value: string; label: string }[];
  value: string;
  onChange(v: string): void;
}): { el: HTMLElement; select: HTMLSelectElement; set(v: string): void } {
  const select = h('select', { id: `f-${opts.id}`, class: 'select', on: { change: () => opts.onChange(select.value) } });
  for (const o of opts.options) select.append(h('option', { value: o.value }, o.label));
  select.value = opts.value;
  return {
    el: h('div', { class: 'field' }, h('label', { for: `f-${opts.id}`, class: 'field-label' }, opts.label), h('div', { class: 'select-wrap' }, select)),
    select,
    set: (v) => {
      select.value = v;
    },
  };
}

/* ---------- badges / indicators ---------- */

export function badge(tag: Tag): HTMLElement {
  return h('span', { class: `badge badge-${tag.tone}` }, tag.text);
}

export function noteIndicator(): HTMLElement {
  return h('span', { class: 'ind ind-note', title: 'Has a note', 'aria-label': 'Has a note' }, icon('note', 16), h('span', null, 'NOTE'));
}
export function favIndicator(): HTMLElement {
  return h('span', { class: 'ind ind-fav', title: 'Favorite', 'aria-label': 'Favorite' }, icon('star', 16), h('span', null, 'FAV'));
}

/* ---------- results rendering ---------- */

export function renderRow(r: ResultRow, o: FormatOptions): HTMLElement {
  const row = h('div', { class: `res-row res-${r.size}` });
  const label = h('div', { class: 'res-label' }, r.label, r.tag ? badge(r.tag) : null);
  const vals = h('div', { class: 'res-values' });
  if (r.dual) {
    const t = fmtDual(r.dual, o, r.extraDecimals ?? 0);
    const inch = h('div', { class: 'val val-in' }, h('span', { class: 'num' }, t.inch), h('span', { class: 'u' }, ' in'));
    const mm = h('div', { class: 'val val-mm' }, h('span', { class: 'num' }, t.mm), h('span', { class: 'u' }, ' mm'));
    const first = r.dual.primary === 'in' ? inch : mm;
    const second = r.dual.primary === 'in' ? mm : inch;
    first.classList.add('val-primary');
    second.classList.add('val-alt');
    vals.append(first, h('div', { class: 'paren' }, '(', second, ')'));
  } else {
    vals.append(h('div', { class: 'val val-plain val-primary' }, h('span', { class: 'num' }, r.text ?? '')));
    if (r.altText) vals.append(h('div', { class: 'val val-plain val-alt' }, r.altText));
  }
  row.append(label, vals);
  if (r.hint) row.append(h('div', { class: 'res-hint' }, r.hint));
  return row;
}

export function renderPresentation(p: Presentation, o: FormatOptions): HTMLElement {
  const root = h('div', { class: 'results' });
  root.append(
    h('div', { class: 'res-head' }, h('div', { class: 'res-title' }, p.title), h('div', { class: 'res-sub' }, p.subtitle)),
  );
  if (p.badges.length) root.append(h('div', { class: 'badges' }, ...p.badges.map(badge)));
  for (const sec of p.sections) {
    const card = h('section', { class: 'card res-card' });
    if (sec.title) card.append(h('h3', { class: 'card-title' }, sec.title));
    for (const r of sec.rows) card.append(renderRow(r, o));
    root.append(card);
  }
  for (const m of p.messages) root.append(h('div', { class: `msg msg-${m.tone}`, role: 'note' }, m.text));
  return root;
}
