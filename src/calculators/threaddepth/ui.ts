import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { formatOptions } from '../../core/format';
import { fnv1a } from '../../core/hash';
import { type CalcIssue, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { type ThreadDepthInput, solveThreadDepth } from './engine';
import { presentThreadDepth } from './present';

interface TdForm {
  unit: Unit;
  external: boolean;
  pitch: string; // TPI when inch, mm pitch when metric
  dia: string;
  depth: string;
  passes: string;
  first: string;
  angle: string;
}
const defaults = (unit: Unit): TdForm => ({ unit, external: true, pitch: '', dia: '', depth: '', passes: '', first: '', angle: '29.5' });

function toInput(f: TdForm): { input?: ThreadDepthInput; issues: CalcIssue[] } {
  const issues: CalcIssue[] = [];
  const opt = (t: string, field: string, label: string) => {
    const v = parseDecimal(t);
    if (v !== null && Number.isNaN(v)) issues.push({ field, message: `${label} isn’t a valid number.` });
    return v === null || Number.isNaN(v) ? null : v;
  };
  const pv = parseDecimal(f.pitch);
  let pitch = 0;
  if (pv === null) issues.push({ field: 'pitch', message: f.unit === 'in' ? 'Enter the threads per inch.' : 'Enter the pitch.' });
  else if (Number.isNaN(pv) || pv <= 0) issues.push({ field: 'pitch', message: f.unit === 'in' ? 'Threads per inch must be a number above zero.' : 'Pitch must be a number above zero.' });
  else pitch = f.unit === 'in' ? 1 / pv : pv;
  const startDiameter = opt(f.dia, 'dia', 'Diameter');
  const depthOverride = opt(f.depth, 'depth', 'Thread depth');
  const passes = opt(f.passes, 'passes', 'Passes');
  const firstDepth = opt(f.first, 'first', 'First-pass depth');
  const angleDeg = opt(f.angle, 'angle', 'Compound angle') ?? 29.5;
  if (issues.length) return { issues };
  return { issues, input: { unit: f.unit, pitch, external: f.external, startDiameter, depthOverride, passes, firstDepth, angleDeg } };
}

export async function mountThreadDepth(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen td-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentThreadDepth> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: TdForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: TdForm; calculated?: boolean }>('threaddepth');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Thread Infeed',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('threaddepth', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };
  const num = (id: keyof TdForm & string, label: string, unit: string | null, placeholder = '', fraction = false) => {
    const f = numericField({ id, label, value: String(form[id]), unit, placeholder, fraction, onInput: (v) => { (form[id] as string) = v; invalidate(); }, onEnter: () => void calculate() });
    fields[id] = f;
    return f.el;
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
          form = { ...defaults(v), external: form.external, angle: form.angle };
          invalidate();
          build();
        },
      }),
      segmented<'ext' | 'int'>({
        ariaLabel: 'External or internal thread',
        value: form.external ? 'ext' : 'int',
        tone: 'neutral',
        options: [
          { value: 'ext', label: 'EXTERNAL', sub: 'OD thread' },
          { value: 'int', label: 'INTERNAL', sub: 'bore thread' },
        ],
        onChange: (v) => {
          form.external = v === 'ext';
          invalidate();
          build();
        },
      }),
      h(
        'section',
        { class: 'card form-card' },
        num('pitch', u === 'in' ? 'Threads per inch (TPI)' : 'Pitch', u === 'in' ? null : 'mm', u === 'in' ? 'e.g. 16' : 'e.g. 1.5'),
        num('dia', form.external ? 'Stock OD (optional)' : 'Bore diameter before threading (optional)', u, 'blank = skip X column'),
        num('depth', 'Thread depth override (optional)', u, 'blank = standard 60° depth'),
      ),
      h(
        'section',
        { class: 'card form-card' },
        h('h3', { class: 'card-title' }, 'Passes — enter ONE'),
        num('passes', 'Number of passes', null, 'e.g. 8'),
        num('first', 'OR first-pass depth (radius)', u),
        num('angle', 'Compound angle', '°', 'default 29.5'),
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
    const solved = built.input ? solveThreadDepth(built.input) : null;
    if (!built.input || !solved || !solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues.length ? built.issues : solved && !solved.ok ? solved.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentThreadDepth(solved.value);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('threaddepth', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'threaddepth',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo).slice(0, 40),
          engine: ENGINE_VERSION,
        }));
    }
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = { ...defaults(form.unit), external: form.external, angle: form.angle };
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
      void ctx.repo.setDraft('threaddepth', { form, calculated: presentation !== null });
    },
  };
}
