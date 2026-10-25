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
import { type TruePositionInput, solveTruePosition } from './engine';
import { presentTruePosition } from './present';

interface TpForm {
  unit: Unit;
  nx: string;
  ny: string;
  ax: string;
  ay: string;
  tol: string;
  mode: 'rfs' | 'mmc';
  feature: 'hole' | 'pin';
  mmc: string;
  asz: string;
}
const defaults = (unit: Unit): TpForm => ({ unit, nx: '', ny: '', ax: '', ay: '', tol: '', mode: 'rfs', feature: 'hole', mmc: '', asz: '' });

function toInput(f: TpForm): { input?: TruePositionInput; issues: CalcIssue[] } {
  const issues: CalcIssue[] = [];
  const num = (t: string, field: string, label: string, required: boolean) => {
    const v = parseDecimal(t);
    if (v === null) {
      if (required) issues.push({ field, message: `Enter ${label}.` });
      return 0;
    }
    if (Number.isNaN(v)) {
      issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} isn’t a valid number.` });
      return 0;
    }
    return v;
  };
  const nominalX = num(f.nx, 'nx', 'the nominal X', true);
  const nominalY = num(f.ny, 'ny', 'the nominal Y', true);
  const actualX = num(f.ax, 'ax', 'the measured X', true);
  const actualY = num(f.ay, 'ay', 'the measured Y', true);
  const tolerance = num(f.tol, 'tol', 'the position tolerance', true);
  const mmc = f.mode === 'mmc' ? { feature: f.feature, mmcSize: num(f.mmc, 'mmc', 'the MMC size', true), actualSize: num(f.asz, 'asz', 'the measured size', true) } : null;
  if (issues.length) return { issues };
  return { issues, input: { unit: f.unit, nominalX, nominalY, actualX, actualY, tolerance, mmc } };
}

export async function mountTruePosition(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen tp-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentTruePosition> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: TpForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: TpForm; calculated?: boolean }>('trueposition');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — True Position',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('trueposition', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };
  const num = (id: keyof TpForm & string, label: string, unit: string | null, placeholder = '', signed = false) => {
    const f = numericField({ id, label, value: String(form[id]), unit, placeholder, signed, fraction: false, onInput: (v) => { (form[id] as string) = v; invalidate(); }, onEnter: () => void calculate() });
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
          form = { ...defaults(v), mode: form.mode, feature: form.feature };
          invalidate();
          build();
        },
      }),
      h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Print (nominal)'), h('div', { class: 'contour-row' }, num('nx', 'Nominal X', u, '', true), num('ny', 'Nominal Y', u, '', true))),
      h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Measured (actual)'), h('div', { class: 'contour-row' }, num('ax', 'Measured X', u, '', true), num('ay', 'Measured Y', u, '', true))),
      h(
        'section',
        { class: 'card form-card' },
        num('tol', 'Position tolerance (Ø zone)', u, u === 'in' ? 'e.g. 0.010' : 'e.g. 0.25'),
        segmented<'rfs' | 'mmc'>({
          ariaLabel: 'Material condition',
          value: form.mode,
          tone: 'neutral',
          options: [
            { value: 'rfs', label: 'RFS', sub: 'no bonus' },
            { value: 'mmc', label: 'MMC Ⓜ', sub: 'bonus tolerance' },
          ],
          onChange: (m) => {
            form.mode = m;
            invalidate();
            build();
          },
        }),
        ...(form.mode === 'mmc'
          ? [
              segmented<'hole' | 'pin'>({
                ariaLabel: 'Feature type',
                value: form.feature,
                tone: 'neutral',
                options: [
                  { value: 'hole', label: 'HOLE', sub: 'MMC = smallest' },
                  { value: 'pin', label: 'PIN / SHAFT', sub: 'MMC = largest' },
                ],
                onChange: (v) => {
                  form.feature = v;
                  invalidate();
                  build();
                },
              }),
              num('mmc', 'MMC size (limit from the print)', u),
              num('asz', 'Measured size of the feature', u),
            ]
          : []),
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
    const solved = built.input ? solveTruePosition(built.input) : null;
    if (!built.input || !solved || !solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues.length ? built.issues : solved && !solved.ok ? solved.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentTruePosition(solved.value);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('trueposition', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'trueposition',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form },
          summary: toSummary(presentation, fo).slice(0, 3),
          engine: ENGINE_VERSION,
        }));
    }
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = { ...defaults(form.unit), mode: form.mode, feature: form.feature };
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
      void ctx.repo.setDraft('trueposition', { form, calculated: presentation !== null });
    },
  };
}
