import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions } from '../../core/format';
import { type CalcIssue, type Result, parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Presentation } from '../../core/results';
import type { Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, chips, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { counterboreDiagram, countersinkDiagram } from './diagram';
import { type CskUnknown, solveCounterbore, solveCountersink } from './engine';
import { presentCounterbore, presentCountersink } from './present';

type Tab = 'csk' | 'cbore';

interface Form {
  tab: Tab;
  unit: Unit;
  // countersink
  anglePreset: '82' | '90' | '100' | '120' | 'custom';
  angleText: string;
  solveFor: CskUnknown;
  csText: string;
  holeText: string;
  depthText: string;
  // counterbore
  headDiaText: string;
  headHtText: string;
  diaClrText: string;
  depthClrText: string;
  cbHoleText: string;
  thickText: string;
}

const defaults = (unit: Unit): Form => ({
  tab: 'csk', unit, anglePreset: '82', angleText: '', solveFor: 'depth', csText: '', holeText: '', depthText: '',
  headDiaText: '', headHtText: '', diaClrText: '', depthClrText: '', cbHoleText: '', thickText: '',
});

export async function mountCskCbore(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen csk-screen' });
  const diagramHost = h('div', { class: 'diagram-card card' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(diagramHost, formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: Presentation | null = null;
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
    const d = await ctx.repo.getDraft<{ form: Form; calculated?: boolean }>('cskcbore');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => `Thread Mav — ${form.tab === 'csk' ? 'Countersink' : 'Counterbore'}`,
    onNew: () => clearForm(),
  });

  const angleValue = (): number | null => {
    if (form.anglePreset !== 'custom') return Number(form.anglePreset);
    const v = parseDecimal(form.angleText);
    return v === null || Number.isNaN(v) ? null : v;
  };
  const draw = () => diagramHost.replaceChildren(form.tab === 'csk' ? countersinkDiagram(angleValue()) : counterboreDiagram());
  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('cskcbore', { form, calculated: presentation !== null }), 350);
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
    const parts: HTMLElement[] = [
      segmented<Tab>({
        ariaLabel: 'Countersink or counterbore',
        value: form.tab,
        extraClass: 'seg-mode',
        options: [
          { value: 'csk', label: 'Countersink' },
          { value: 'cbore', label: 'Counterbore' },
        ],
        onChange: (t) => {
          if (t === form.tab) return;
          form.tab = t;
          invalidate();
          draw();
          build();
        },
      }),
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
          form = { ...defaults(v), tab: form.tab, anglePreset: form.anglePreset, angleText: form.angleText, solveFor: form.solveFor };
          invalidate();
          build();
        },
      }),
    ];

    if (form.tab === 'csk') {
      const ang = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Included angle'));
      ang.append(
        chips({
          ariaLabel: 'Included angle',
          selected: form.anglePreset,
          items: [
            { value: '82', label: '82°', sub: 'inch std' },
            { value: '90', label: '90°', sub: 'metric std' },
            { value: '100', label: '100°' },
            { value: '120', label: '120°' },
            { value: 'custom', label: 'CUSTOM' },
          ],
          onPick: (v) => {
            form.anglePreset = v as Form['anglePreset'];
            invalidate();
            draw();
            build();
          },
        }),
      );
      if (form.anglePreset === 'custom') ang.append(num('angle', 'Included angle', form.angleText, '°', (v) => { form.angleText = v; draw(); }, 'e.g. 118').el);
      parts.push(ang);

      const card = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Solve for'));
      card.append(
        segmented<CskUnknown>({
          ariaLabel: 'Solve for',
          value: form.solveFor,
          tone: 'neutral',
          options: [
            { value: 'depth', label: 'DEPTH' },
            { value: 'dia', label: 'CSK DIA' },
            { value: 'hole', label: 'HOLE DIA' },
          ],
          onChange: (v) => {
            form.solveFor = v;
            invalidate();
            build();
          },
        }),
      );
      if (form.solveFor !== 'dia') card.append(num('csDia', 'Countersink diameter (at surface)', form.csText, u, (v) => (form.csText = v)).el);
      if (form.solveFor !== 'hole') card.append(num('hole', 'Hole diameter', form.holeText, u, (v) => (form.holeText = v)).el);
      if (form.solveFor !== 'depth') card.append(num('depth', 'Countersink depth', form.depthText, u, (v) => (form.depthText = v)).el);
      parts.push(card);
    } else {
      parts.push(
        h(
          'section',
          { class: 'card form-card' },
          h('h3', { class: 'card-title' }, 'Screw head'),
          num('headDia', 'Head diameter', form.headDiaText, u, (v) => (form.headDiaText = v)).el,
          num('headHeight', 'Head height', form.headHtText, u, (v) => (form.headHtText = v)).el,
        ),
        h(
          'section',
          { class: 'card form-card' },
          h('h3', { class: 'card-title' }, 'Clearance (optional)'),
          num('diaClr', 'Added to diameter (total)', form.diaClrText, u, (v) => (form.diaClrText = v), 'blank = 0').el,
          num('depthClr', 'Added to depth', form.depthClrText, u, (v) => (form.depthClrText = v), 'blank = 0').el,
        ),
        h(
          'section',
          { class: 'card form-card' },
          h('h3', { class: 'card-title' }, 'Check against the part (optional)'),
          num('hole', 'Through-hole diameter', form.cbHoleText, u, (v) => (form.cbHoleText = v)).el,
          num('thick', 'Part thickness', form.thickText, u, (v) => (form.thickText = v)).el,
        ),
      );
    }

    parts.push(
      h('div', { class: 'btn-row calc-row' }, h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => void calculate() } }, 'Calculate'), h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearForm() } }, 'Clear')),
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

  /** Parse a text field: null = blank, throws issue via `bad` for malformed. */
  function parse(issues: CalcIssue[], text: string, field: string, label: string): number | null {
    const v = parseDecimal(text);
    if (v === null) return null;
    if (Number.isNaN(v)) {
      issues.push({ field, message: `${label} isn’t a valid number.` });
      return null;
    }
    return v;
  }

  function run(): { result: Result<unknown>; pres?: Presentation; sig?: string } {
    const issues: CalcIssue[] = [];
    if (form.tab === 'csk') {
      const ang = angleValue();
      if (form.anglePreset === 'custom') parse(issues, form.angleText, 'angle', 'Angle');
      const cs = parse(issues, form.csText, 'csDia', 'Countersink diameter');
      const hole = parse(issues, form.holeText, 'hole', 'Hole diameter');
      const depth = parse(issues, form.depthText, 'depth', 'Depth');
      if (issues.length) return { result: { ok: false, issues } };
      const input = { unit: form.unit, includedAngleDeg: ang ?? Number.NaN, solveFor: form.solveFor, csDia: form.solveFor === 'dia' ? null : cs, holeDia: form.solveFor === 'hole' ? null : hole, depth: form.solveFor === 'depth' ? null : depth };
      const r = solveCountersink(input);
      return r.ok ? { result: r, pres: presentCountersink(r.value), sig: fnv1a(JSON.stringify(['csk', input])) } : { result: r };
    }
    const headDia = parse(issues, form.headDiaText, 'headDia', 'Head diameter');
    const headHeight = parse(issues, form.headHtText, 'headHeight', 'Head height');
    const dc = parse(issues, form.diaClrText, 'diaClr', 'Diameter clearance');
    const pc = parse(issues, form.depthClrText, 'depthClr', 'Depth clearance');
    const hole = parse(issues, form.cbHoleText, 'hole', 'Hole diameter');
    const thick = parse(issues, form.thickText, 'thick', 'Part thickness');
    if (headDia === null) issues.push({ field: 'headDia', message: 'Enter the head diameter.' });
    if (headHeight === null) issues.push({ field: 'headHeight', message: 'Enter the head height.' });
    if (issues.length) return { result: { ok: false, issues } };
    const input = { unit: form.unit, headDia: headDia!, headHeight: headHeight!, diaClearance: dc ?? 0, depthClearance: pc ?? 0, holeDia: hole, thickness: thick };
    const r = solveCounterbore(input);
    return r.ok ? { result: r, pres: presentCounterbore(r.value), sig: fnv1a(JSON.stringify(['cbore', input])) } : { result: r };
  }

  async function calculate(opts: { silent?: boolean } = {}) {
    Object.values(fields).forEach((f) => f.setError(null));
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    const out = run();
    if (!out.result.ok || !out.pres || !out.sig) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(out.result.ok ? [] : out.result.issues);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = out.pres;
    if (!(record && record.signature === out.sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('cskcbore', out.sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'cskcbore',
          signature: out.sig,
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
    form = { ...defaults(form.unit), tab: form.tab, anglePreset: form.anglePreset, solveFor: form.solveFor };
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
      void ctx.repo.setDraft('cskcbore', { form, calculated: presentation !== null });
    },
  };
}
