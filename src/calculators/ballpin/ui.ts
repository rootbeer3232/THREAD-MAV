import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { formatOptions } from '../../core/format';
import { fnv1a } from '../../core/hash';
import { type CalcIssue, type Result, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Presentation } from '../../core/results';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { solveDovetail, solveVBall } from './engine';
import { presentDovetail, presentVBall } from './present';

interface BpForm {
  unit: Unit;
  mode: 'dovetail' | 'vball';
  kind: 'male' | 'female';
  angle: string;
  pin: string;
  width: string;
  meas: string;
  incl: string;
  ball: string;
  open: string;
  height: string;
}
const defaults = (unit: Unit): BpForm => ({
  unit,
  mode: 'dovetail',
  kind: 'male',
  angle: '60',
  pin: '',
  width: '',
  meas: '',
  incl: '90',
  ball: '',
  open: '',
  height: '',
});

export async function mountBallPin(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen ballpin-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: Presentation | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: BpForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: BpForm; calculated?: boolean }>('ballpin');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Ball / Pin',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(
      () =>
        void ctx.repo.setDraft('ballpin', {
          form,
          calculated: presentation !== null,
        }),
      350,
    );
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };
  const num = (id: keyof BpForm & string, label: string, unit: string | null, placeholder = '', signed = false) => {
    const f = numericField({
      id,
      label,
      value: String(form[id]),
      unit,
      placeholder,
      signed,
      onInput: (v) => {
        (form[id] as string) = v;
        invalidate();
      },
      onEnter: () => void calculate(),
    });
    fields[id] = f;
    return f.el;
  };
  const pick = <T extends string>(ariaLabel: string, value: T, options: { value: T; label: string; sub?: string }[], set: (v: T) => void) =>
    segmented<T>({
      ariaLabel,
      value,
      tone: 'neutral',
      options,
      onChange: (v) => {
        set(v);
        invalidate();
        build();
      },
    });

  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const u = form.unit;
    const dovetail = form.mode === 'dovetail';
    formHost.replaceChildren(
      pick<Unit>(
        'Units',
        u,
        [
          { value: 'in', label: 'INCH' },
          { value: 'mm', label: 'METRIC mm' },
        ],
        (v) => {
          if (v !== u)
            form = {
              ...defaults(v),
              mode: form.mode,
              kind: form.kind,
              angle: form.angle,
              incl: form.incl,
            };
        },
      ),
      pick<'dovetail' | 'vball'>(
        'What are you measuring',
        form.mode,
        [
          { value: 'dovetail', label: 'DOVETAIL', sub: 'over / between pins' },
          { value: 'vball', label: 'V / CSK', sub: 'ball or pin height' },
        ],
        (v) => (form.mode = v),
      ),
      ...(dovetail
        ? [
            pick<'male' | 'female'>(
              'Dovetail type',
              form.kind,
              [
                { value: 'male', label: 'MALE', sub: 'tongue — over pins' },
                {
                  value: 'female',
                  label: 'FEMALE',
                  sub: 'slot — between pins',
                },
              ],
              (v) => (form.kind = v),
            ),
            h(
              'section',
              { class: 'card form-card' },
              num('angle', 'Dovetail angle α (base to flank)', '°', 'e.g. 60'),
              num('pin', 'Pin diameter', u, u === 'in' ? 'e.g. 0.2500' : 'e.g. 6'),
              h('h3', { class: 'card-title' }, 'Enter ONE'),
              num('width', 'Width at the sharp base corners', u, 'blank = solve'),
              num('meas', form.kind === 'male' ? 'OR measured over pins' : 'OR measured between pins', u, 'blank = solve'),
            ),
          ]
        : [
            h(
              'section',
              { class: 'card form-card' },
              num('incl', 'Included angle (82°, 90°, 100° …)', '°', 'e.g. 90'),
              num('ball', 'Ball / pin diameter', u),
              h('h3', { class: 'card-title' }, 'Enter ONE'),
              num('open', 'Opening at the surface (csk Ø or V width)', u, 'blank = solve'),
              num('height', 'OR ball top above the surface (− if below)', u, 'blank = solve', true),
            ),
          ]),
      h(
        'div',
        { class: 'btn-row calc-row' },
        h(
          'button',
          {
            class: 'btn btn-calc-blue',
            type: 'button',
            on: { click: () => void calculate() },
          },
          'Calculate',
        ),
        h(
          'button',
          {
            class: 'btn btn-secondary',
            type: 'button',
            on: { click: () => clearForm() },
          },
          'Clear',
        ),
      ),
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

  /** Parse the visible fields; malformed text is reported, blank stays null. */
  function solve(): {
    result?: Result<unknown>;
    present?: () => Presentation;
    input?: unknown;
    issues: CalcIssue[];
  } {
    const issues: CalcIssue[] = [];
    const get = (id: keyof BpForm & string, label: string) => {
      const v = parseDecimal(String(form[id]));
      if (v !== null && Number.isNaN(v)) issues.push({ field: id, message: `${label} isn’t a valid number.` });
      return v === null || Number.isNaN(v) ? null : v;
    };
    if (form.mode === 'dovetail') {
      const input = {
        unit: form.unit,
        kind: form.kind,
        angleDeg: get('angle', 'Angle') ?? Number.NaN,
        pin: get('pin', 'Pin diameter') ?? Number.NaN,
        width: get('width', 'Width'),
        measurement: get('meas', 'Measurement'),
      };
      if (issues.length) return { issues };
      const r = solveDovetail(input);
      return {
        result: r,
        input,
        issues,
        ...(r.ok ? { present: () => presentDovetail(r.value) } : {}),
      };
    }
    const input = {
      unit: form.unit,
      includedDeg: get('incl', 'Angle') ?? Number.NaN,
      ball: get('ball', 'Ball diameter') ?? Number.NaN,
      opening: get('open', 'Opening'),
      height: get('height', 'Height'),
    };
    if (issues.length) return { issues };
    const r = solveVBall(input);
    return {
      result: r,
      input,
      issues,
      ...(r.ok ? { present: () => presentVBall(r.value) } : {}),
    };
  }

  async function calculate(opts: { silent?: boolean } = {}) {
    Object.values(fields).forEach((f) => f.setError(null));
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    const s = solve();
    if (!s.result || !s.result.ok || !s.present) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(s.issues.length ? s.issues : s.result && !s.result.ok ? s.result.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = s.present();
    const sig = fnv1a(JSON.stringify({ mode: form.mode, input: s.input }));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('ballpin', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'ballpin',
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
    if (!opts.silent)
      resultHost.firstElementChild?.scrollIntoView({
        block: 'start',
        behavior: 'smooth',
      });
  }

  function clearForm() {
    form = {
      ...defaults(form.unit),
      mode: form.mode,
      kind: form.kind,
      angle: form.angle,
      incl: form.incl,
    };
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
      void ctx.repo.setDraft('ballpin', {
        form,
        calculated: presentation !== null,
      });
    },
  };
}
