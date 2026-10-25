import { applyFraction, fmtFixed, parseDecimal, sanitizeDecimalInput, sanitizeFractionInput } from '../core/numeric';
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
  /** Allow a leading minus (iOS decimal pad has no minus key, so a ± button is shown). */
  signed?: boolean;
  /** Accept fractions (3/8, 1-1/2) and show the a/b helper. Defaults to true for inch fields. */
  fraction?: boolean;
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
  const signBtn = opts.signed ? h('button', { class: 'sign-btn', type: 'button', 'aria-label': `Toggle minus for ${opts.label}`, tabindex: '-1' }, '±') : null;
  const clearBtn = h('button', { class: 'clear-x', type: 'button', 'aria-label': `Clear ${opts.label}`, tabindex: '-1' }, '×');
  const err = h('div', { id: `e-${opts.id}`, class: 'field-error', role: 'alert' });
  const labelEl = h('label', { for: `f-${opts.id}`, class: 'field-label' }, opts.label);
  const fractionOn = opts.fraction ?? opts.unit === 'in';
  const fracBtn = fractionOn ? h('button', { class: 'frac-btn', type: 'button', 'aria-expanded': 'false', 'aria-label': `Fraction entry for ${opts.label || 'this field'}`, tabindex: '-1' }, 'a/b') : null;
  const pad = h('div', { class: 'frac-pad', hidden: true });
  const echo = h('div', { class: 'frac-echo' });
  const wrap = h(
    'div',
    { class: 'field' },
    fractionOn ? h('div', { class: 'label-row' }, labelEl, fracBtn) : labelEl,
    h('div', { class: 'input-row' }, input, signBtn, clearBtn, unitEl),
    echo,
    pad,
    opts.hint ? h('div', { class: 'field-hint' }, opts.hint) : null,
    err,
  );
  if (fractionOn) input.setAttribute('placeholder', opts.placeholder ?? '');
  const refreshEcho = () => {
    const t = input.value;
    if (!fractionOn || !t.includes('/')) {
      echo.textContent = '';
      return;
    }
    const v = parseDecimal(t);
    echo.textContent = v === null || Number.isNaN(v) ? '⚠ Not a valid fraction — try 3/8 or 1-1/2' : `= ${v.toFixed(4)} in  ·  ${(v * 25.4).toFixed(3)} mm`;
    echo.classList.toggle('bad', v === null || Number.isNaN(v));
  };
  const setText = (v: string) => {
    input.value = v;
    err.textContent = '';
    wrap.classList.remove('has-error');
    sync();
    refreshEcho();
    opts.onInput?.(v);
  };
  if (fractionOn) {
    const FR = ['1/16', '1/8', '3/16', '1/4', '5/16', '3/8', '7/16', '1/2', '9/16', '5/8', '11/16', '3/4', '13/16', '7/8', '15/16'];
    pad.append(
      h('button', { class: 'frac-chip frac-sym', type: 'button', on: { click: () => setText(`${input.value}/`) } }, '/'),
      h('button', { class: 'frac-chip frac-sym', type: 'button', on: { click: () => setText(`${input.value}-`) } }, '–'),
      ...FR.map((f) => h('button', { class: 'frac-chip', type: 'button', on: { click: () => setText(applyFraction(input.value, f)) } }, f)),
    );
    fracBtn!.addEventListener('click', () => {
      pad.hidden = !pad.hidden;
      fracBtn!.setAttribute('aria-expanded', String(!pad.hidden));
      fracBtn!.classList.toggle('on', !pad.hidden);
    });
  }

  const sync = () => {
    clearBtn.style.visibility = input.value ? 'visible' : 'hidden';
    unitEl.style.display = unitEl.textContent ? '' : 'none';
  };
  input.addEventListener('input', () => {
    const clean = fractionOn ? sanitizeFractionInput(input.value, !!opts.signed) : sanitizeDecimalInput(input.value, !!opts.signed);
    if (clean !== input.value) input.value = clean;
    err.textContent = '';
    wrap.classList.remove('has-error');
    sync();
    refreshEcho();
    opts.onInput?.(input.value);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      input.blur();
      opts.onEnter?.();
    }
  });
  signBtn?.addEventListener('click', () => {
    const v = input.value;
    input.value = v.startsWith('-') ? v.slice(1) : v === '' ? '-' : `-${v}`;
    sync();
    opts.onInput?.(input.value);
    input.focus();
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
      refreshEcho();
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
  extraClass?: string;
  ariaLabel: string;
}): HTMLElement {
  const root = h('div', { class: `segmented ${opts.tone === 'neutral' ? 'seg-neutral' : ''} ${opts.extraClass ?? ''}`, role: 'group', 'aria-label': opts.ariaLabel });
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

const fixedDual = (r: ResultRow, o: FormatOptions) =>
  r.fmt ? { inch: fmtFixed(r.dual!.in, r.fmt.a), mm: fmtFixed(r.dual!.mm, r.fmt.b), primary: r.dual!.primary } : fmtDual(r.dual!, o, r.extraDecimals ?? 0);

function heroCard(r: ResultRow, o: FormatOptions): HTMLElement {
  const card = h('div', { class: 'hero-card' }, h('div', { class: 'hero-cap' }, r.label, r.tag ? badge(r.tag) : null));
  if (r.dual) {
    const t = fixedDual(r, o);
    card.append(
      h(
        'div',
        { class: 'hero-boxes' },
        h('div', { class: `hero-box hero-in ${r.dual.primary === 'in' ? 'is-primary' : ''}` }, h('div', { class: 'hero-unit' }, r.heroCaps?.[0] ?? 'INCHES'), h('div', { class: 'hero-num' }, t.inch, h('span', null, r.syms?.[0] ?? '"'))),
        h('div', { class: `hero-box hero-mm ${r.dual.primary === 'mm' ? 'is-primary' : ''}` }, h('div', { class: 'hero-unit' }, r.heroCaps?.[1] ?? 'MILLIMETERS'), h('div', { class: 'hero-num' }, t.mm, h('span', null, r.syms?.[1] ?? ' mm'))),
      ),
    );
  } else {
    card.append(h('div', { class: 'hero-boxes single' }, h('div', { class: 'hero-box hero-plain' }, h('div', { class: 'hero-num' }, r.text ?? ''), r.altText ? h('div', { class: 'hero-alt' }, r.altText) : null)));
  }
  if (r.hint) card.append(h('div', { class: 'res-hint' }, r.hint));
  return card;
}

function xyRow(r: ResultRow, o: FormatOptions): HTMLElement {
  const xy = r.xy!;
  const cell = (d: typeof xy.x) => {
    const t = fmtDual(d, o);
    return h('div', { class: 'xy-cell' }, h('div', { class: 'cell-in' }, t.inch), h('div', { class: 'cell-mm' }, t.mm));
  };
  return h('div', { class: 'xy-row' }, h('div', { class: 'xy-id' }, h('strong', null, r.label), h('small', null, xy.angle)), cell(xy.x), cell(xy.y));
}

export function renderRow(r: ResultRow, o: FormatOptions): HTMLElement {
  if (r.xy) return xyRow(r, o);
  const row = h('div', { class: 'res-row' });
  row.append(h('div', { class: 'res-label' }, h('span', null, r.label), r.tag ? badge(r.tag) : null));
  if (r.dual) {
    const t = fixedDual(r, o);
    row.append(h('div', { class: 'cell cell-in' }, t.inch), h('div', { class: 'cell cell-mm' }, t.mm));
  } else {
    row.append(h('div', { class: 'cell cell-plain' }, h('div', null, r.text ?? ''), r.altText ? h('div', { class: 'cell-alt' }, r.altText) : null));
  }
  if (r.hint) row.append(h('div', { class: 'res-hint' }, r.hint));
  return row;
}

export function renderPresentation(p: Presentation, o: FormatOptions): HTMLElement {
  const root = h('div', { class: 'results' });
  root.append(
    h('div', { class: `banner-ok ${p.status ? `banner-${p.status.level}` : ''}`, role: 'status' }, icon('check', 20), h('span', null, p.status?.text ?? 'Calculation Complete')),
    h('div', { class: 'res-head' }, h('div', { class: 'res-title' }, p.title), h('div', { class: 'res-sub' }, p.subtitle)),
  );
  if (p.badges.length) root.append(h('div', { class: 'badges' }, ...p.badges.map(badge)));
  for (const sec of p.sections) {
    const heroes = sec.rows.filter((r) => r.size === 'hero');
    const rest = sec.rows.filter((r) => r.size !== 'hero');
    const hasDual = rest.some((r) => r.dual);
    const hasXy = rest.some((r) => r.xy);
    const card = h('section', { class: `card res-card ${hasDual ? '' : 'no-cols'}` });
    if (hasXy) {
      card.append(h('div', { class: 'xy-head' }, h('h3', { class: 'card-title' }, sec.title ?? ''), h('span', { class: 'col-h' }, sec.xyCols?.[0] ?? 'X'), h('span', { class: 'col-h' }, sec.xyCols?.[1] ?? 'Y')), h('div', { class: 'xy-sub' }, h('span', { class: 'col-in' }, 'in'), ' above ', h('span', { class: 'col-mm' }, 'mm')));
    } else if (sec.title || hasDual) {
      card.append(
        h(
          'div',
          { class: 'sec-head' },
          h('h3', { class: 'card-title' }, sec.title ?? ''),
          hasDual ? h('span', { class: 'col-h col-in' }, sec.cols?.[0].t ?? 'in', h('small', null, sec.cols?.[0].s ?? 'STANDARD')) : null,
          hasDual ? h('span', { class: 'col-h col-mm' }, sec.cols?.[1].t ?? 'mm', h('small', null, sec.cols?.[1].s ?? 'METRIC')) : null,
        ),
      );
    }
    for (const r of heroes) card.append(heroCard(r, o));
    for (const r of rest) card.append(renderRow(r, o));
    root.append(card);
  }
  for (const m of p.messages) root.append(h('div', { class: `msg msg-${m.tone}`, role: 'note' }, m.text));
  return root;
}
