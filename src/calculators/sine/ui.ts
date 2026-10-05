import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions, fmtLength } from '../../core/format';
import { type CalcIssue, type Result, fail, ok, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import { dualFrom, type Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { sineDiagram } from './diagram';
import { type SineResult, angleFromParts, solveAngle, solveStackHeight } from './engine';
import { presentSine } from './present';

type Mode = 'stack' | 'angle';
type BarPreset = '5' | 'custom';

interface SineForm {
  mode: Mode;
  preset: BarPreset;
  /** Unit for the custom bar length, the stack height and the primary result display. */
  unit: Unit;
  customLengthText: string;
  dText: string;
  mText: string;
  sText: string;
  stackText: string;
}

const defaults = (unit: Unit): SineForm => ({
  mode: 'stack',
  preset: '5',
  unit,
  customLengthText: '',
  dText: '',
  mText: '',
  sText: '',
  stackText: '',
});

/** The 5.000" preset is exact in either unit (5 in = 127 mm). */
function barSpec(f: SineForm): { length: number | null; unit: Unit; issue?: CalcIssue } {
  if (f.preset !== 'custom') return { length: f.unit === 'in' ? 5 : 127, unit: f.unit };
  const v = parseDecimal(f.customLengthText);
  if (v === null) return { length: null, unit: f.unit, issue: { field: 'bar', message: 'Enter the roller center-to-center distance.' } };
  if (Number.isNaN(v)) return { length: null, unit: f.unit, issue: { field: 'bar', message: 'Bar length isn’t a valid number.' } };
  return { length: v, unit: f.unit };
}

function solve(f: SineForm): Result<SineResult> {
  const bar = barSpec(f);
  if (bar.issue) return { ok: false, issues: [bar.issue] };
  const L = bar.length!;
  if (f.mode === 'stack') {
    if (f.dText === '' && f.mText === '' && f.sText === '') return fail('Enter the angle.', 'angle');
    const d = parseDecimal(f.dText) ?? 0;
    const m = parseDecimal(f.mText) ?? 0;
    const sec = parseDecimal(f.sText) ?? 0;
    const r = angleFromParts(d, m, sec);
    if (!r.ok) return r as Result<never>;
    const angle = r.value;
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
    return b.unit === 'in' ? `${b.length.toFixed(3)}"` : `${b.length.toFixed(2)} mm`;
  };

  function drawDiagram(angle: number | null, stackLabel?: string | null) {
    diagramHost.replaceChildren(sineDiagram({ angleDeg: angle, barLabel: barLabel(), stackLabel: stackLabel ?? null }), h('div', { class: 'slogan' }, 'Angle with Precision. Parts with Confidence.'));
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

    // Row 1: bar preset chips + Inch/Metric (as in the approved Sine Bar design)
    parts.push(
      h(
        'div',
        { class: 'sine-top' },
        h(
          'div',
          { class: 'preset-row' },
          presetBtn('5', '5.000"', 'Sine Bar'),
          presetBtn('custom', 'Custom', 'Length'),
        ),
        segmented<Unit>({
          ariaLabel: 'Units',
          value: form.unit,
          extraClass: 'seg-unit',
          options: [
            { value: 'in', label: 'Inch' },
            { value: 'mm', label: 'Metric' },
          ],
          onChange: (u) => {
            if (u === form.unit) return;
            form.unit = u;
            form.customLengthText = '';
            form.stackText = '';
            invalidate();
            drawDiagram(null);
            build();
          },
        }),
      ),
    );
    if (form.preset === 'custom') {
      parts.push(h('section', { class: 'card form-card' }, num('bar', 'Roller center-to-center distance', form.customLengthText, form.unit, (v) => { form.customLengthText = v; drawDiagram(null); }, form.unit === 'in' ? 'e.g. 10' : 'e.g. 200').el));
    }

    parts.push(
      segmented<Mode>({
        ariaLabel: 'Sine bar mode',
        value: form.mode,
        extraClass: 'seg-mode',
        options: [
          { value: 'stack', label: 'Find Stack Height' },
          { value: 'angle', label: 'Find Angle' },
        ],
        onChange: (m) => {
          if (m === form.mode) return;
          form.mode = m;
          invalidate();
          build();
        },
      }),
    );

    const input = h('section', { class: 'form-card plain' });
    if (form.mode === 'stack') {
      const d = num('dms-d', '', form.dText, '°', (v) => (form.dText = v), '0');
      const m = num('dms-m', '', form.mText, '′', (v) => (form.mText = v), '0');
      const sec = num('dms-s', '', form.sText, '″', (v) => (form.sText = v), '0');
      fields['angle'] = d;
      input.append(h('h3', { class: 'field-title' }, 'Enter Angle'), h('div', { class: 'dms-row' }, d.el, m.el, sec.el), h('div', { class: 'field-hint' }, 'Enter as decimal degrees or D/M/S'));
    } else {
      input.append(h('h3', { class: 'field-title' }, 'Enter Stack Height'), num('stack', '', form.stackText, form.unit, (v) => (form.stackText = v), form.unit === 'in' ? 'e.g. 1.2941' : 'e.g. 32.870').el);
    }
    parts.push(input);

    parts.push(
      h('div', { class: 'btn-row calc-row' }, h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => void calculate() } }, 'Calculate'), h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearForm() } }, 'Clear')),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );
    formHost.replaceChildren(...parts);
  }

  function presetBtn(v: BarPreset, big: string, small: string) {
    return h(
      'button',
      {
        type: 'button',
        class: 'preset-btn',
        'aria-pressed': String(form.preset === v),
        on: {
          click: () => {
            form.preset = v;
            invalidate();
            drawDiagram(null);
            build();
          },
        },
      },
      h('strong', null, big),
      h('span', null, small),
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
    form = { ...defaults(ctx.settings.defaultUnit), mode: form.mode, preset: form.preset, unit: form.unit, customLengthText: form.customLengthText };
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
