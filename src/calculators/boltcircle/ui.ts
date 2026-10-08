import type { AppContext, Screen } from '../../app/context';
import { copyText } from '../../app/share';
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
import { boltCircleDiagram } from './diagram';
import { type BoltCircleInput, solveBoltCircle } from './engine';
import { coordinateText, presentBoltCircle } from './present';

interface BcForm {
  unit: Unit;
  diaText: string;
  holesText: string;
  startText: string;
  clockwise: boolean;
  cxText: string;
  cyText: string;
}
const defaults = (unit: Unit): BcForm => ({ unit, diaText: '', holesText: '', startText: '', clockwise: false, cxText: '', cyText: '' });

function toInput(f: BcForm): { input?: BoltCircleInput; issues: CalcIssue[] } {
  const issues: CalcIssue[] = [];
  const num = (t: string, field: string, label: string, required: boolean, fallback = 0) => {
    const v = parseDecimal(t);
    if (v === null) {
      if (required) issues.push({ field, message: `Enter ${label}.` });
      return fallback;
    }
    if (Number.isNaN(v)) {
      issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} isn’t a valid number.` });
      return fallback;
    }
    return v;
  };
  const diameter = num(f.diaText, 'dia', 'the bolt circle diameter', true);
  const holes = num(f.holesText, 'holes', 'the number of holes', true);
  const startDeg = num(f.startText, 'start', 'the starting angle', false);
  const centerX = num(f.cxText, 'cx', 'center X', false);
  const centerY = num(f.cyText, 'cy', 'center Y', false);
  if (issues.length) return { issues };
  return { issues, input: { unit: f.unit, diameter, holes, startDeg, clockwise: f.clockwise, centerX, centerY } };
}

export async function mountBoltCircle(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen bolt-screen' });
  const diagramHost = h('div', { class: 'diagram-card card' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(diagramHost, formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentBoltCircle> | null = null;
  let lastText = '';
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: BcForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: BcForm; calculated?: boolean }>('boltcircle');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? `${toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL)}` : ''),
    shareTitle: () => 'Thread Mav — Bolt Circle',
    onNew: () => clearForm(),
  });

  const drawDiagram = () => {
    const n = parseDecimal(form.holesText);
    const a = parseDecimal(form.startText);
    diagramHost.replaceChildren(boltCircleDiagram(n !== null && !Number.isNaN(n) ? n : null, a !== null && !Number.isNaN(a) ? a : 0, form.clockwise));
  };
  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('boltcircle', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    drawDiagram();
    saveDraft();
  };
  const num = (id: string, label: string, value: string, unit: string | null, onInput: (v: string) => void, placeholder = '', signed = false) => {
    const f = numericField({ id, label, value, unit, placeholder, signed, onInput: (v) => { onInput(v); invalidate(); }, onEnter: () => void calculate() });
    fields[id] = f;
    return f;
  };

  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const u = form.unit;
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
          form = { ...defaults(v), holesText: form.holesText, startText: form.startText, clockwise: form.clockwise };
          invalidate();
          build();
        },
      }),
      h(
        'section',
        { class: 'card form-card' },
        num('dia', 'Bolt circle diameter', form.diaText, u, (v) => (form.diaText = v), u === 'in' ? 'e.g. 4.000' : 'e.g. 100').el,
        num('holes', 'Number of holes', form.holesText, null, (v) => (form.holesText = v), 'e.g. 6').el,
        num('start', 'Angle of hole #1 (from +X)', form.startText, '°', (v) => (form.startText = v), 'blank = 0°', true).el,
        segmented<'ccw' | 'cw'>({
          ariaLabel: 'Direction',
          value: form.clockwise ? 'cw' : 'ccw',
          tone: 'neutral',
          options: [
            { value: 'ccw', label: 'CCW', sub: 'counterclockwise' },
            { value: 'cw', label: 'CW', sub: 'clockwise' },
          ],
          onChange: (v) => {
            form.clockwise = v === 'cw';
            invalidate();
            build();
          },
        }),
      ),
      h(
        'section',
        { class: 'card form-card' },
        h('h3', { class: 'card-title' }, 'Circle center from part zero (optional)'),
        num('cx', 'Center X', form.cxText, u, (v) => (form.cxText = v), 'blank = 0', true).el,
        num('cy', 'Center Y', form.cyText, u, (v) => (form.cyText = v), 'blank = 0', true).el,
      ),
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
    const built = toInput(form);
    const solved = built.input ? solveBoltCircle(built.input) : null;
    if (!built.input || !solved || !solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues.length ? built.issues : solved && !solved.ok ? solved.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentBoltCircle(solved.value);
    lastText = coordinateText(solved.value, form.unit === 'in' ? fo.inchDecimals : fo.metricDecimals);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('boltcircle', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'boltcircle',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo).slice(0, 3),
          engine: ENGINE_VERSION,
        }));
    }
    const copyBtn = h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: async () => ctx.toast((await copyText(lastText)) ? 'Coordinates copied' : 'Copy not available — use Share') } }, 'COPY COORDINATES');
    resultHost.replaceChildren(renderPresentation(presentation, fo), copyBtn, bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = { ...defaults(form.unit), clockwise: form.clockwise };
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    drawDiagram();
    build();
    saveDraft();
    window.scrollTo({ top: 0 });
  }

  drawDiagram();
  build();
  if (autoCalc) await calculate({ silent: true });
  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft('boltcircle', { form, calculated: presentation !== null });
    },
  };
}
