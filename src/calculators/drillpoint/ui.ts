import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions } from '../../core/format';
import { type CalcIssue, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, chips, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { drillPointDiagram } from './diagram';
import { type DrillPointInput, solveDrillPoint } from './engine';
import { presentDrillPoint } from './present';

interface DpForm {
  unit: Unit;
  preset: '118' | '135' | '140' | 'custom';
  angleText: string;
  diaText: string;
  depthText: string;
}
const defaults = (unit: Unit): DpForm => ({ unit, preset: '118', angleText: '', diaText: '', depthText: '' });

function toInput(f: DpForm): { input?: DrillPointInput; issues: CalcIssue[] } {
  const issues: CalcIssue[] = [];
  const get = (t: string, field: string, label: string, required: boolean) => {
    const v = parseDecimal(t);
    if (v === null) {
      if (required) issues.push({ field, message: `Enter ${label}.` });
      return null;
    }
    if (Number.isNaN(v)) {
      issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} isn’t a valid number.` });
      return null;
    }
    return v;
  };
  const dia = get(f.diaText, 'dia', 'the drill diameter', true);
  const angle = f.preset === 'custom' ? get(f.angleText, 'angle', 'the point angle', true) : Number(f.preset);
  const depth = get(f.depthText, 'depth', 'the hole depth', false);
  if (issues.length || dia === null || angle === null) return { issues };
  return { issues, input: { unit: f.unit, diameter: dia, includedAngleDeg: angle, holeDepth: depth } };
}

export async function mountDrillPoint(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen drillpoint-screen' });
  const diagramHost = h('div', { class: 'diagram-card card' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(diagramHost, formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentDrillPoint> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: DpForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: DpForm; calculated?: boolean }>('drillpoint');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Drill Point Depth',
    onNew: () => clearForm(),
  });

  const angle = (): number | null => {
    if (form.preset !== 'custom') return Number(form.preset);
    const v = parseDecimal(form.angleText);
    return v === null || Number.isNaN(v) ? null : v;
  };
  const draw = () => diagramHost.replaceChildren(drillPointDiagram(angle()));
  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('drillpoint', { form, calculated: presentation !== null }), 350);
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
    const f = numericField({ id, label, value, unit, placeholder, onInput: (v) => { onInput(v); invalidate(); }, onEnter: () => void calculate() });
    fields[id] = f;
    return f;
  };

  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const u = form.unit;
    const ang = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Point angle (included)'));
    ang.append(
      chips({
        ariaLabel: 'Point angle',
        selected: form.preset,
        items: [
          { value: '118', label: '118°', sub: 'general' },
          { value: '135', label: '135°', sub: 'split point' },
          { value: '140', label: '140°', sub: 'carbide' },
          { value: 'custom', label: 'CUSTOM' },
        ],
        onPick: (v) => {
          form.preset = v as DpForm['preset'];
          invalidate();
          draw();
          build();
        },
      }),
    );
    if (form.preset === 'custom') ang.append(num('angle', 'Point angle', form.angleText, '°', (v) => { form.angleText = v; draw(); }, 'e.g. 130').el);
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
          form = { ...defaults(v), preset: form.preset, angleText: form.angleText };
          invalidate();
          build();
        },
      }),
      ang,
      h(
        'section',
        { class: 'card form-card' },
        num('dia', 'Drill diameter', form.diaText, u, (v) => (form.diaText = v), u === 'in' ? 'e.g. .500' : 'e.g. 10').el,
        num('depth', 'Full-diameter depth (optional)', form.depthText, u, (v) => (form.depthText = v), 'or part thickness for a through hole').el,
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
    const solved = built.input ? solveDrillPoint(built.input) : null;
    if (!built.input || !solved || !solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues.length ? built.issues : solved && !solved.ok ? solved.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentDrillPoint(solved.value);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('drillpoint', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'drillpoint',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo),
          engine: ENGINE_VERSION,
        }));
    }
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = { ...defaults(form.unit), preset: form.preset, angleText: form.angleText };
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    draw();
    build();
    saveDraft();
    window.scrollTo({ top: 0 });
  }

  draw();
  build();
  if (autoCalc) await calculate({ silent: true });
  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft('drillpoint', { form, calculated: presentation !== null });
    },
  };
}
