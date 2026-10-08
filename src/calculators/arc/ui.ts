import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions } from '../../core/format';
import { type CalcIssue, type Result, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { angleFromParts } from '../sine/engine';
import { arcDiagram } from './diagram';
import { type ArcInput, type ArcResult, solveArc } from './engine';
import { presentArc } from './present';

interface Form {
  unit: Unit;
  radiusText: string;
  chordText: string;
  sagittaText: string;
  dText: string;
  mText: string;
  sText: string;
}
const defaults = (unit: Unit): Form => ({ unit, radiusText: '', chordText: '', sagittaText: '', dText: '', mText: '', sText: '' });

function solve(f: Form): Result<ArcResult> {
  const issues: CalcIssue[] = [];
  const len = (t: string, field: string, label: string) => {
    const v = parseDecimal(t);
    if (v !== null && Number.isNaN(v)) issues.push({ field, message: `${label} isn’t a valid number.` });
    return v !== null && !Number.isNaN(v) ? v : null;
  };
  const radius = len(f.radiusText, 'radius', 'Radius');
  const chord = len(f.chordText, 'chord', 'Chord');
  const sagitta = len(f.sagittaText, 'sagitta', 'Sagitta');
  let angleDeg: number | null = null;
  if (f.dText !== '' || f.mText !== '' || f.sText !== '') {
    const r = angleFromParts(parseDecimal(f.dText) ?? 0, parseDecimal(f.mText) ?? 0, parseDecimal(f.sText) ?? 0);
    if (r.ok) angleDeg = r.value;
    else issues.push(...r.issues.map((i) => ({ ...i, field: 'angle' })));
  }
  if (issues.length) return { ok: false, issues };
  const input: ArcInput = { unit: f.unit, radius, chord, sagitta, angleDeg };
  return solveArc(input);
}

export async function mountArc(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen arc-screen' });
  const diagramHost = h('div', { class: 'diagram-card card' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(diagramHost, formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentArc> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: Form } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: Form; calculated?: boolean }>('arc');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Radius / Chord / Sagitta',
    onNew: () => clearForm(),
  });

  const draw = (a: number | null) => diagramHost.replaceChildren(arcDiagram(a));
  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('arc', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      draw(null);
    }
    saveDraft();
  };
  const num = (id: string, label: string, value: string, unit: string | null, onInput: (v: string) => void, placeholder = '') => {
    const f = numericField({ id, label, value, unit, placeholder, onInput: (v) => { onInput(v); invalidate(); }, onEnter: () => void calculate() });
    fields[id] = f;
    return f;
  };

  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const u = form.unit;
    const d = num('dms-d', '', form.dText, '°', (v) => (form.dText = v), '0');
    const m = num('dms-m', '', form.mText, '′', (v) => (form.mText = v), '0');
    const s = num('dms-s', '', form.sText, '″', (v) => (form.sText = v), '0');
    fields['angle'] = d;
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
          form = defaults(v);
          invalidate();
          build();
        },
      }),
      h('p', { class: 'dim small hint-line' }, 'Enter ANY TWO known values. Works for arcs up to a semicircle.'),
      h(
        'section',
        { class: 'card form-card' },
        num('radius', 'Radius', form.radiusText, u, (v) => (form.radiusText = v)).el,
        num('chord', 'Chord (straight across the arc)', form.chordText, u, (v) => (form.chordText = v)).el,
        num('sagitta', 'Sagitta (height of the arc)', form.sagittaText, u, (v) => (form.sagittaText = v)).el,
      ),
      h('section', { class: 'form-card plain' }, h('h3', { class: 'field-title' }, 'Central angle'), h('div', { class: 'dms-row' }, d.el, m.el, s.el), h('div', { class: 'field-hint' }, 'Decimal degrees, or degrees / minutes / seconds.')),
      h('div', { class: 'btn-row calc-row' }, h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => void calculate() } }, 'Calculate'), h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearForm() } }, 'Clear')),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );
  }

  function showIssues(issues: CalcIssue[]) {
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    const general: string[] = [];
    let first: HTMLElement | null = null;
    for (const i of issues) {
      const f = i.field ? fields[i.field] : undefined;
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
    Object.values(fields).forEach((f) => f.setError(null));
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    const r = solve(form);
    if (!r.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      draw(null);
      showIssues(r.issues);
      return;
    }
    const res = r.value;
    const fo = formatOptions(ctx.settings);
    presentation = presentArc(res);
    const sig = fnv1a(JSON.stringify([res.unit, res.given, res.radius, res.chord, res.sagitta, res.angleDeg]));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('arc', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'arc',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo),
          engine: ENGINE_VERSION,
        }));
    }
    draw(res.angleDeg);
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = defaults(form.unit);
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    draw(null);
    build();
    saveDraft();
    window.scrollTo({ top: 0 });
  }

  draw(null);
  build();
  if (autoCalc) await calculate({ silent: true });
  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft('arc', { form, calculated: presentation !== null });
    },
  };
}
