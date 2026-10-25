import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions } from '../../core/format';
import { type CalcIssue, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { type ShimInput, solveShims } from './engine';
import { presentShims } from './present';

interface Row {
  t: string;
  q: string;
}
interface Form {
  unit: Unit;
  targetText: string;
  maxText: string;
  inv: { in: Row[]; mm: Row[] };
}

/** STARTER sets only — a convenience. Edit them to match the shims you actually own. */
const STARTER: Form['inv'] = {
  in: ['.001', '.002', '.003', '.005', '.010', '.020', '.050'].map((t) => ({ t, q: '' })),
  mm: ['0.01', '0.02', '0.05', '0.1', '0.2', '0.5', '1'].map((t) => ({ t, q: '' })),
};
const fresh = (unit: Unit): Form => ({ unit, targetText: '', maxText: '', inv: { in: STARTER.in.map((r) => ({ ...r })), mm: STARTER.mm.map((r) => ({ ...r })) } });

export async function mountShim(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen shim-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = fresh(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentShims> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields = new Map<string, NumericField>();

  const valid = (f?: Form): Form | null => (f && f.inv && Array.isArray(f.inv.in) && Array.isArray(f.inv.mm) ? f : null);
  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = valid((rec?.inputs as { form?: Form } | undefined)?.form);
    if (rec && f) {
      form = f;
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    // the inventory is kept between visits (it is YOUR shim drawer)
    const d = await ctx.repo.getDraft<{ form: Form; calculated?: boolean }>('shim');
    const f = valid(d?.form);
    if (f) {
      form = f;
      autoCalc = !!d?.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Shim Stack',
    onNew: () => clearTarget(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('shim', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };
  const num = (id: string, label: string, value: string, unit: string | null, onInput: (v: string) => void, placeholder = '') => {
    const f = numericField({ id, label, value, unit, placeholder, fraction: id === 'target', onInput: (v) => { onInput(v); invalidate(); }, onEnter: () => void calculate() });
    fields.set(id, f);
    return f;
  };

  function build() {
    fields.clear();
    const u = form.unit;
    const rows = form.inv[u];
    const invCard = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Shims you have on hand'), h('p', { class: 'dim small' }, 'A starter set is filled in — change it to match YOUR shims. Leave quantity blank for “plenty”.'));
    rows.forEach((r, i) => {
      invCard.append(
        h(
          'div',
          { class: 'shim-row' },
          num(`size${i}`, i === 0 ? 'Thickness' : '', r.t, u, (v) => (r.t = v)).el,
          num(`qty${i}`, i === 0 ? 'Qty (blank = any)' : '', r.q, null, (v) => (r.q = v), 'any').el,
          h('button', { class: 'icon-btn icon-btn-danger', type: 'button', 'aria-label': 'Remove this size', on: { click: () => { rows.splice(i, 1); invalidate(); build(); } } }, '×'),
        ),
      );
    });
    invCard.append(
      h(
        'div',
        { class: 'contour-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => { rows.push({ t: '', q: '' }); invalidate(); build(); } } }, '+ ADD SIZE'),
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => { form.inv[u] = STARTER[u].map((r) => ({ ...r })); invalidate(); build(); } } }, 'RESET TO STARTER'),
      ),
    );
    formHost.replaceChildren(
      segmented<Unit>({
        ariaLabel: 'Units',
        value: u,
        tone: 'neutral',
        options: [
          { value: 'in', label: 'INCH' },
          { value: 'mm', label: 'METRIC mm' },
        ],
        onChange: (v) => {
          if (v === u) return;
          form.unit = v;
          form.targetText = '';
          invalidate();
          build();
        },
      }),
      h('section', { class: 'card form-card' }, num('target', 'Stack thickness needed', form.targetText, u, (v) => (form.targetText = v), u === 'in' ? 'e.g. .0620' : 'e.g. 1.63').el, num('maxShims', 'Most shims allowed (optional)', form.maxText, null, (v) => (form.maxText = v), 'blank = no limit').el),
      invCard,
      h('div', { class: 'btn-row calc-row' }, h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => void calculate() } }, 'Calculate'), h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearTarget() } }, 'Clear')),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );
  }

  function showIssues(issues: CalcIssue[]) {
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    const general: string[] = [];
    let first: HTMLElement | null = null;
    for (const i of issues) {
      const f = i.field ? fields.get(i.field) : undefined;
      if (f && f.el.isConnected) {
        f.setError(i.message);
        first ??= f.input;
      } else general.push(i.message);
    }
    if (banner) {
      banner.textContent = general.length ? `⚠ ${general.join(' ')}` : '⚠ Fix the highlighted fields.';
      banner.classList.add('show');
    }
    (first ?? banner)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  async function calculate(opts: { silent?: boolean } = {}) {
    fields.forEach((f) => f.setError(null));
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    const issues: CalcIssue[] = [];
    const get = (t: string, field: string, label: string) => {
      const v = parseDecimal(t);
      if (v !== null && Number.isNaN(v)) issues.push({ field, message: `${label} isn’t a valid number.` });
      return v !== null && !Number.isNaN(v) ? v : null;
    };
    const target = get(form.targetText, 'target', 'The stack thickness');
    if (target === null && !issues.length) issues.push({ field: 'target', message: 'Enter the stack thickness you need.' });
    const sizes: ShimInput['sizes'] = [];
    form.inv[form.unit].forEach((r, i) => {
      if (r.t.trim() === '' && r.q.trim() === '') return; // empty spare row
      const t = get(r.t, `size${i}`, 'Thickness');
      const q = get(r.q, `qty${i}`, 'Quantity');
      if (t === null && !issues.some((x) => x.field === `size${i}`)) issues.push({ field: `size${i}`, message: 'Enter this shim’s thickness (or remove the row).' });
      if (t !== null) sizes.push({ thickness: t, qty: q });
    });
    const maxShims = get(form.maxText, 'maxShims', 'Maximum shims');
    if (issues.length) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(issues);
      return;
    }
    const input: ShimInput = { unit: form.unit, target: target!, sizes, maxShims };
    const solved = solveShims(input);
    if (!solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(solved.issues);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentShims(solved.value);
    const sig = fnv1a(JSON.stringify(input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('shim', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'shim',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo).slice(0, 16),
          engine: ENGINE_VERSION,
        }));
    }
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** Clears the target and result but keeps the shim inventory. */
  function clearTarget() {
    form.targetText = '';
    form.maxText = '';
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    build();
    saveDraft();
    window.scrollTo({ top: 0 });
  }

  build();
  if (autoCalc) await calculate({ silent: true });
  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft('shim', { form, calculated: presentation !== null });
    },
  };
}
