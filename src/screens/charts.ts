import type { AppContext, Screen } from '../app/context';
import { ALL_DRILLS, type Drill, type DrillSeries, drillsFor, nearestDrills, percentThread } from '../calculators/charts/drills';
import { type ChartRow, METRIC_ROWS, UNIFIED_ROWS } from '../calculators/charts/threads';
import { defaultClassLabel, defaultForm } from '../calculators/thread/form';
import { type FormatOptions, fmtDual, fmtLoose, formatOptions } from '../core/format';
import { fmtFixed, parseDecimal } from '../core/numeric';
import { MM_PER_INCH, type Unit, dualFrom } from '../core/units';
import { chips, numericField, segmented } from '../ui/components';
import { h } from '../ui/dom';

const NOTE_DRILLS =
  'Drill sizes are the standard decimal equivalents, spot-checked (not independently re-verified in this build). Always confirm with your drill index.';
const NOTE_THREADS =
  'Every value here is CALCULATED from 60° thread geometry — it is not a standards table and carries no tolerances. Tap drills are the sizes nearest 75% thread.';

function dualCells(inch: number, mm: number, fo: FormatOptions, extra = 0) {
  const t = fmtDual({ in: inch, mm, primary: 'in' }, fo, extra);
  return [h('div', { class: 'cell cell-in' }, t.inch), h('div', { class: 'cell cell-mm' }, t.mm)];
}

function tableHead(title: string) {
  return h(
    'div',
    { class: 'sec-head' },
    h('h3', { class: 'card-title' }, title),
    h('span', { class: 'col-h col-in' }, 'in', h('small', null, 'STANDARD')),
    h('span', { class: 'col-h col-mm' }, 'mm', h('small', null, 'METRIC')),
  );
}

function drillLine(label: string, d: Drill, pct: number, fo: FormatOptions, strong = false) {
  const t = fmtDual(dualFrom(d.inch, 'in'), fo);
  return h(
    'div',
    { class: `res-row ${strong ? 'strong-row' : ''}` },
    h('div', { class: 'res-label' }, h('span', null, label), h('span', { class: 'drill-name' }, `${d.name}${d.series === 'metric' ? '' : ''}`)),
    h('div', { class: 'cell cell-in' }, t.inch),
    h('div', { class: 'cell cell-mm' }, d.series === 'metric' ? fmtFixed(d.mm, 2) : t.mm),
    h('div', { class: 'res-hint pct' }, `${fmtFixed(pct, 0)}% thread`),
  );
}

/* ------------------------------------------------------------------ */
/* Thread chart                                                         */
/* ------------------------------------------------------------------ */

export function threadChartScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen charts' });
  const fo = () => formatOptions(ctx.settings);
  let sys: 'unified' | 'metric' = ctx.settings.defaultUnit === 'mm' ? 'metric' : 'unified';
  let filter = 'ALL';
  let query = '';
  let openId: string | null = null;

  const top = h('div', { class: 'chart-controls' });
  const list = h('div', { class: 'chart-list' });
  root.append(top, list, h('p', { class: 'dim small chart-note' }, NOTE_THREADS));

  const rowsFor = () => (sys === 'unified' ? UNIFIED_ROWS : METRIC_ROWS);

  function matches(r: ChartRow): boolean {
    if (filter !== 'ALL' && r.series.toUpperCase() !== filter) return false;
    const q = query.trim().toLowerCase().replace('×', 'x');
    if (!q) return true;
    return r.designation.toLowerCase().replace('×', 'x').includes(q) || r.sizeLabel.toLowerCase() === q;
  }

  function drawControls() {
    const search = h('input', { class: 'text-input', type: 'search', inputmode: 'text', autocomplete: 'off', autocapitalize: 'none', spellcheck: 'false', placeholder: sys === 'unified' ? 'Search: 3/8, #10, 20 UNF…' : 'Search: M10, 1.5…', 'aria-label': 'Search threads' });
    search.value = query;
    search.addEventListener('input', () => {
      query = search.value;
      drawList();
    });
    const series = sys === 'unified' ? ['ALL', 'UNC', 'UNF', 'UNEF'] : ['ALL', 'COARSE', 'FINE'];
    top.replaceChildren(
      segmented<'unified' | 'metric'>({
        extraClass: `seg-system seg-${sys}`,
        ariaLabel: 'Thread system',
        value: sys,
        options: [
          { value: 'unified', label: 'UNIFIED (INCH)' },
          { value: 'metric', label: 'METRIC (mm)' },
        ],
        onChange: (v) => {
          sys = v;
          filter = 'ALL';
          query = '';
          openId = null;
          drawControls();
          drawList();
        },
      }),
      search,
      chips({ ariaLabel: 'Series filter', selected: filter, items: series.map((s) => ({ value: s, label: s })), onPick: (v) => { filter = v; drawControls(); drawList(); } }),
    );
  }

  function drawList() {
    const rows = rowsFor().filter(matches);
    list.replaceChildren(
      ...(rows.length
        ? rows.map((r) => chartRow(r))
        : [h('div', { class: 'empty' }, 'No threads match.')]),
    );
  }

  function chartRow(r: ChartRow): HTMLElement {
    const f = fo();
    const open = openId === r.id;
    const major = dualFrom(r.major, r.unit);
    const mj = fmtDual(major, f);
    const td = r.tapDrills?.best;
    const head = h(
      'button',
      { class: 'chart-head', type: 'button', 'aria-expanded': String(open), on: { click: () => { openId = open ? null : r.id; drawList(); } } },
      h('span', { class: 'ch-main' }, h('span', { class: 'ch-title' }, r.designation), h('span', { class: 'ch-sub' }, td ? `Tap drill ${td.drill.name} · ${fmtFixed(td.percent, 0)}%` : 'Tap drill —')),
      h('span', { class: 'ch-vals' }, h('span', { class: 'val-in' }, `⌀ ${mj.inch}"`), h('span', { class: 'val-mm' }, `${mj.mm} mm`)),
    );
    const card = h('div', { class: `card chart-card ${open ? 'open' : ''}` }, head);
    if (open) card.append(detail(r));
    return card;
  }

  function detail(r: ChartRow): HTMLElement {
    const f = fo();
    const d = (v: number) => dualFrom(v, r.unit);
    const row = (label: string, v: number, extra = 0) => {
      const t = d(v);
      return h('div', { class: 'res-row' }, h('div', { class: 'res-label' }, label), ...dualCells(t.in, t.mm, f, extra));
    };
    const box = h('div', { class: 'chart-detail' }, tableHead('Basic dimensions (60° geometry)'));
    box.append(
      row('Major diameter', r.major),
      row('Basic pitch diameter', r.basicPD),
      row('Basic minor dia. D1', r.basicMinor),
      row('Thread depth (5H/8)', r.depth),
      row('Pitch', r.pitch),
      h('div', { class: 'res-row' }, h('div', { class: 'res-label' }, 'Threads per inch'), h('div', { class: 'cell cell-plain' }, fmtLoose(r.tpi, 3))),
      row('Best wire (3-wire)', r.bestWire, 1),
    );

    if (r.tapDrills) {
      const td = r.tapDrills;
      box.append(h('div', { class: 'sub-title' }, 'TAP DRILL — nearest 75% thread'), drillLine('Best', td.best.drill, td.best.percent, f, true));
      if (td.tight) box.append(drillLine('Tighter', td.tight.drill, td.tight.percent, f));
      if (td.loose) box.append(drillLine('Easier', td.loose.drill, td.loose.percent, f));
    }

    // percent thread for any drill the machinist has in hand
    const unit: Unit = r.unit;
    const out = h('div', { class: 'pct-out' }, 'Enter a drill diameter to see its percent thread.');
    const field = numericField({
      id: `pct-${r.id}`,
      label: 'Percent thread for YOUR drill',
      unit,
      placeholder: unit === 'in' ? 'e.g. .201' : 'e.g. 8.5',
      onInput: (v) => {
        const n = parseDecimal(v);
        if (n === null) out.textContent = 'Enter a drill diameter to see its percent thread.';
        else if (Number.isNaN(n) || n <= 0) out.textContent = '⚠ Enter a valid drill diameter.';
        else if (n >= r.major) out.textContent = '⚠ That drill is as large as the thread — no thread would be cut.';
        else {
          const pct = percentThread(r.major, r.pitch, n);
          const near = nearestDrills(unit === 'in' ? n : n / MM_PER_INCH, 1)[0]!;
          out.textContent = `${fmtFixed(pct, 1)}% thread${pct > 100 ? ' — more than a full thread: drill too small' : pct < 50 ? ' — very shallow thread' : ''}  (closest standard drill: ${near.drill.name})`;
        }
      },
    });
    box.append(h('div', { class: 'pct-box' }, field.el, out));

    box.append(
      h(
        'button',
        {
          class: 'btn btn-calc-blue',
          type: 'button',
          on: {
            click: async () => {
              const form = defaultForm(r.system, ctx.settings);
              form.majorText = String(Number(r.major.toFixed(6)));
              form.pitchText = String(r.pitchOrTpi);
              form.pitchMode = r.system === 'unified' ? 'tpi' : 'pitch';
              form.sizeLabel = r.sizeLabel;
              form.classLabel = defaultClassLabel(r.system, true, ctx.settings);
              await ctx.repo.setDraft('thread', { form, limitsOpen: false, calculated: true });
              ctx.go('thread');
            },
          },
        },
        'OPEN IN THREAD / 3-WIRE',
      ),
    );
    return box;
  }

  drawControls();
  drawList();
  return { el: root };
}

/* ------------------------------------------------------------------ */
/* Drill chart                                                          */
/* ------------------------------------------------------------------ */

type Tab = 'find' | DrillSeries;

export function drillChartScreen(ctx: AppContext): Screen {
  const root = h('div', { class: 'screen charts' });
  const fo = () => formatOptions(ctx.settings);
  let tab: Tab = 'find';
  let query = '';
  let findUnit: Unit = ctx.settings.defaultUnit;
  let findText = '';

  const top = h('div', { class: 'chart-controls' });
  const body = h('div', { class: 'chart-list' });
  root.append(top, body, h('p', { class: 'dim small chart-note' }, NOTE_DRILLS));

  const drillRow = (d: Drill, diff?: { inch: number; mm: number }) => {
    const f = fo();
    const t = fmtDual({ in: d.inch, mm: d.mm, primary: 'in' }, f);
    return h(
      'div',
      { class: 'drill-row' },
      h('div', { class: 'dr-name' }, h('strong', null, d.name), h('small', null, d.series.toUpperCase())),
      h('div', { class: 'cell cell-in' }, d.series === 'metric' ? fmtFixed(d.inch, 4) : t.inch),
      h('div', { class: 'cell cell-mm' }, d.series === 'metric' ? String(d.mm) : t.mm),
      diff
        ? h('div', { class: 'dr-diff' }, findUnit === 'in' ? `${diff.inch >= 0 ? '+' : '−'}${fmtFixed(Math.abs(diff.inch), 4)}"` : `${diff.mm >= 0 ? '+' : '−'}${fmtFixed(Math.abs(diff.mm), 3)}`)
        : null,
    );
  };

  function draw() {
    const tabs: { value: Tab; label: string }[] = [
      { value: 'find', label: 'FIND NEAREST' },
      { value: 'fraction', label: 'FRACTION' },
      { value: 'number', label: 'NUMBER' },
      { value: 'letter', label: 'LETTER' },
      { value: 'metric', label: 'METRIC' },
    ];
    top.replaceChildren(chips({ ariaLabel: 'Drill series', selected: tab, items: tabs, onPick: (v) => { tab = v as Tab; query = ''; draw(); } }));

    if (tab === 'find') {
      const out = h('div', { class: 'chart-list' });
      const field = numericField({
        id: 'find',
        label: 'Decimal size',
        unit: findUnit,
        value: findText,
        placeholder: findUnit === 'in' ? 'e.g. .2010' : 'e.g. 5.1',
        onInput: (v) => {
          findText = v;
          show();
        },
      });
      const show = () => {
        const n = parseDecimal(findText);
        if (n === null) return void out.replaceChildren(h('div', { class: 'empty small' }, 'Type a size to see the nearest drills in every series — fractional, number, letter and metric.'));
        if (Number.isNaN(n) || n <= 0) return void out.replaceChildren(h('div', { class: 'empty small' }, '⚠ Enter a valid size.'));
        const inch = findUnit === 'in' ? n : n / MM_PER_INCH;
        out.replaceChildren(
          h('div', { class: 'drill-head' }, h('span', null, 'Drill'), h('span', { class: 'col-in' }, 'in'), h('span', { class: 'col-mm' }, 'mm'), h('span', null, 'Δ vs yours')),
          ...nearestDrills(inch, 8).map((hit) => drillRow(hit.drill, { inch: hit.diffInch, mm: hit.diffMm })),
        );
      };
      body.replaceChildren(
        h(
          'div',
          { class: 'card form-card' },
          segmented<Unit>({ ariaLabel: 'Units', value: findUnit, tone: 'neutral', options: [{ value: 'in', label: 'INCH' }, { value: 'mm', label: 'METRIC mm' }], onChange: (u) => { findUnit = u; findText = ''; draw(); } }),
          field.el,
        ),
        out,
      );
      show();
      return;
    }

    const search = h('input', { class: 'text-input', type: 'search', inputmode: tab === 'metric' ? 'decimal' : 'text', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', placeholder: tab === 'number' ? 'Search: #7, 29…' : tab === 'letter' ? 'Search: F, Q…' : tab === 'fraction' ? 'Search: 5/16, 1/4…' : 'Search: 8.5…', 'aria-label': 'Search drills' });
    search.value = query;
    const rowsEl = h('div', { class: 'chart-list' });
    const list = tab === 'number' ? [...drillsFor('number')].sort((a, b) => b.inch - a.inch) : drillsFor(tab as DrillSeries);
    const render = () => {
      const q = query.trim().toLowerCase().replace('#', '');
      const rows = list.filter((d) => !q || d.name.toLowerCase().replace('#', '').replace(' mm', '').startsWith(q) || d.name.toLowerCase().replace('#', '').includes(q));
      rowsEl.replaceChildren(
        h('div', { class: 'drill-head' }, h('span', null, 'Drill'), h('span', { class: 'col-in' }, 'in'), h('span', { class: 'col-mm' }, 'mm')),
        ...(rows.length ? rows.map((d) => drillRow(d)) : [h('div', { class: 'empty small' }, 'No match.')]),
      );
    };
    search.addEventListener('input', () => {
      query = search.value;
      render();
    });
    body.replaceChildren(search, rowsEl);
    render();
  }

  draw();
  void ALL_DRILLS;
  return { el: root };
}
