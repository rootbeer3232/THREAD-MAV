import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions, fmtLength } from '../../core/format';
import { type CalcIssue, type Result, fail, ok, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import { dualFrom, type Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, chips, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { sineDiagram } from './diagram';
import { type SineResult, angleFromDms, solveAngle, solveStackHeight } from './engine';
import { presentSine } from './present';

type Mode = 'stack' | 'angle';
type BarPreset = '5' | '10' | 'custom';
type AngleEntry = 'deg' | 'dms';

interface SineForm {
  mode: Mode;
  preset: BarPreset;
  customUnit: Unit;
  customLengthText: string;
  angleEntry: AngleEntry;
  angleText: string;
  dText: string;
  mText: string;
  sText: string;
  stackText: string;
}

const defaults = (unit: Unit): SineForm => ({
  mode: 'stack',
  preset: '5',
  customUnit: unit,
  customLengthText: '',
  angleEntry: 'deg',
  angleText: '',
  dText: '',
  mText: '',
  sText: '',
  stackText: '',
});

/** Preset bars are inch; "custom" uses the chosen unit. */
function barSpec(f: SineForm): { length: number | null; unit: Unit; issue?: CalcIssue } {
  if (f.preset !== 'custom') return { length: Number(f.preset), unit: 'in' };
  const v = parseDecimal(f.customLengthText);
  if (v === null) return { length: null, unit: f.customUnit, issue: { field: 'bar', message: 'Enter the roller center-to-center distance.' } };
  if (Number.isNaN(v)) return { length: null, unit: f.customUnit, issue: { field: 'bar', message: 'Bar length isn’t a valid number.' } };
  return { length: v, unit: f.customUnit };
}

function solve(f: SineForm): Result<SineResult> {
  const bar = barSpec(f);
  if (bar.issue) return { ok: false, issues: [bar.issue] };
  const L = bar.length!;
  if (f.mode === 'stack') {
    let angle: number;
    if (f.angleEntry === 'deg') {
      const a = parseDecimal(f.angleText);
      if (a === null) return fail('Enter the angle.', 'angle');
      if (Number.isNaN(a)) return fail('Angle isn’t a valid number.', 'angle');
      angle = a;
    } else {
      const d = parseDecimal(f.dText) ?? 0;
      const m = parseDecimal(f.mText) ?? 0;
      const s = parseDecimal(f.sText) ?? 0;
      if (f.dText === '' && f.mText === '' && f.sText === '') return fail('Enter the angle in degrees, minutes and seconds.', 'angle');
      const r = angleFromDms(d, m, s);
      if (!r.ok) return r as Result<never>;
      angle = r.value;
    }
    return solveStackHeight({ barLength: L, unit: bar.unit, angleDeg: angle });
  }
  const st = parseDecimal(f.stackText);
  if (st === null) return fail('Enter the gage-block stack height.', 'stack');
  if (Number.isNaN(st)) return fail('Stack height isn’t a valid number.', 'stack');
  return solveAngle({ barLength: L, unit: bar.unit, stackHeight: st });
}

export async function mountSine(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen sine-screen' });
  const diagramHost = h('div', { class: 'diagram-card card' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(diagramHost, formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentSine> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: SineForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: SineForm; calculated?: boolean }>('sine');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Sine Bar',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('sine', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      drawDiagram(null);
    }
    saveDraft();
  };

  const barLabel = () => {
    const b = barSpec(form);
    if (b.length === null || !(b.length > 0)) return '—';
    return `${fmtLength(b.length, b.unit, formatOptions(ctx.settings), b.unit === 'in' ? 3 : 2)}${b.unit === 'in' ? '"' : ' mm'}`;
  };

  function drawDiagram(angle: number | null, stackLabel?: string | null) {
    diagramHost.replaceChildren(sineDiagram({ angleDeg: angle, barLabel: barLabel(), stackLabel: stackLabel ?? null }));
  }

  const num = (id: string, label: string, value: string, unit: string | null, onInput: (v: string) => void, placeholder = '') => {
    const f = numericField({
      id,
      label,
      value,
      unit,
      placeholder,
      onInput: (v) => {
        onInput(v);
        invalidate();
      },
      onEnter: () => void calculate(),
    });
    fields[id] = f;
    return f;
  };

  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const parts: HTMLElement[] = [];

    parts.push(
      segmented<Mode>({
        ariaLabel: 'Sine bar mode',
        value: form.mode,
        options: [
          { value: 'stack', label: 'FIND STACK', sub: 'angle → height' },
          { value: 'angle', label: 'FIND ANGLE', sub: 'height → angle' },
        ],
        onChange: (m) => {
          if (m === form.mode) return;
          form.mode = m;
          invalidate();
          build();
        },
      }),
    );

    const barCard = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Sine bar length'));
    barCard.append(
      chips({
        ariaLabel: 'Sine bar length',
        selected: form.preset,
        items: [
          { value: '5', label: '5.000"', sub: 'standard' },
          { value: '10', label: '10.000"' },
          { value: 'custom', label: 'CUSTOM' },
        ],
        onPick: (v) => {
          form.preset = v as BarPreset;
          invalidate();
          build();
        },
      }),
    );
    if (form.preset === 'custom') {
      barCard.append(
        segmented<Unit>({
          ariaLabel: 'Bar length units',
          value: form.customUnit,
          tone: 'neutral',
          options: [
            { value: 'in', label: 'INCH' },
            { value: 'mm', label: 'METRIC mm' },
          ],
          onChange: (u) => {
            form.customUnit = u;
            invalidate();
            build();
          },
        }),
        num('bar', 'Roller center-to-center distance', form.customLengthText, form.customUnit, (v) => (form.customLengthText = v), 'e.g. 200').el,
      );
    } else {
      const d = dualFrom(Number(form.preset), 'in');
      barCard.append(h('div', { class: 'readout' }, h('span', { class: 'val-in' }, `${d.in.toFixed(3)} in`), h('span', { class: 'dim' }, ' ('), h('span', { class: 'val-mm' }, `${d.mm.toFixed(2)} mm`), h('span', { class: 'dim' }, ')')));
    }
    parts.push(barCard);

    const inUnit = barSpec(form).unit;
    const input = h('section', { class: 'card form-card' });
    if (form.mode === 'stack') {
      input.append(
        h('h3', { class: 'card-title' }, 'Angle'),
        segmented<AngleEntry>({
          ariaLabel: 'Angle entry format',
          value: form.angleEntry,
          tone: 'neutral',
          options: [
            { value: 'deg', label: 'DECIMAL °' },
            { value: 'dms', label: 'D / M / S' },
          ],
          onChange: (v) => {
            form.angleEntry = v;
            invalidate();
            build();
          },
        }),
      );
      if (form.angleEntry === 'deg') {
        input.append(num('angle', 'Angle', form.angleText, '°', (v) => (form.angleText = v), 'e.g. 15 or 22.5').el);
      } else {
        const d = num('dms-d', 'Degrees', form.dText, '°', (v) => (form.dText = v));
        const m = num('dms-m', 'Minutes', form.mText, '′', (v) => (form.mText = v));
        const sec = num('dms-s', 'Seconds', form.sText, '″', (v) => (form.sText = v));
        fields['angle'] = d; // errors surface on the degrees field
        input.append(h('div', { class: 'dms-row' }, d.el, m.el, sec.el));
      }
    } else {
      input.append(h('h3', { class: 'card-title' }, 'Gage-block stack'), num('stack', 'Stack height', form.stackText, inUnit, (v) => (form.stackText = v), inUnit === 'in' ? 'e.g. 1.2941' : 'e.g. 32.870').el);
    }
    parts.push(input);

    parts.push(
      h('button', { class: 'btn btn-calc', type: 'button', on: { click: () => void calculate() } }, 'CALCULATE'),
      h('div', { class: 'btn-row' }, h('button', { class: 'btn btn-secondary btn-wide', type: 'button', on: { click: () => clearForm() } }, 'CLEAR')),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );
    formHost.replaceChildren(...parts);
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
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    banner?.classList.remove('show');
    const r = solve(form);
    if (!r.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      drawDiagram(null);
      showIssues(r.issues);
      return;
    }
    const res = r.value;
    const fo = formatOptions(ctx.settings);
    presentation = presentSine(res, fo);
    const sig = fnv1a(JSON.stringify([res.mode, res.unit, res.barLength, res.mode === 'stack' ? res.angleDeg : res.stackHeight]));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('sine', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'sine',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form } ,
          summary: toSummary(presentation, fo),
          engine: ENGINE_VERSION,
        }));
    }
    drawDiagram(res.angleDeg, `${fmtLength(res.stackHeight, res.unit, fo)}${res.unit === 'in' ? '"' : ''}`);
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    form = { ...defaults(ctx.settings.defaultUnit), mode: form.mode, preset: form.preset, customUnit: form.customUnit, customLengthText: form.customLengthText, angleEntry: form.angleEntry };
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    drawDiagram(null);
    build();
    saveDraft();
    window.scrollTo({ top: 0 });
  }

  drawDiagram(null);
  build();
  if (autoCalc) await calculate({ silent: true });

  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft('sine', { form, calculated: presentation !== null });
    },
  };
}
