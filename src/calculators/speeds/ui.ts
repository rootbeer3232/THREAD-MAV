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
import { type Process, type SpeedsInput, solveSpeeds } from './engine';
import { presentSpeeds } from './present';

interface SpeedsForm {
  process: Process;
  unit: Unit;
  basis: 'speed' | 'rpm';
  diaText: string;
  speedText: string;
  rpmText: string;
  feedText: string;
  flutesText: string;
  maxRpmText: string;
}

const defaults = (unit: Unit): SpeedsForm => ({ process: 'mill', unit, basis: 'speed', diaText: '', speedText: '', rpmText: '', feedText: '', flutesText: '', maxRpmText: '' });

function toInput(f: SpeedsForm): { input?: SpeedsInput; issues: CalcIssue[] } {
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
  const dia = get(f.diaText, 'dia', 'the diameter', true);
  const speed = f.basis === 'speed' ? get(f.speedText, 'speed', f.unit === 'in' ? 'the surface speed (SFM)' : 'the surface speed (m/min)', true) : null;
  const rpm = f.basis === 'rpm' ? get(f.rpmText, 'rpm', 'the spindle RPM', true) : null;
  const feed = get(f.feedText, 'feed', 'the feed', false);
  const flutes = f.process === 'mill' ? get(f.flutesText, 'flutes', 'the flute count', feed !== null) : null;
  const maxRpm = get(f.maxRpmText, 'maxRpm', 'the spindle limit', false);
  if (issues.length || dia === null) return { issues };
  return { issues, input: { process: f.process, unit: f.unit, diameter: dia, basis: f.basis, surfaceSpeed: speed, rpm, feed, flutes, maxRpm } };
}

export async function mountSpeeds(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen speeds-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentSpeeds> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: SpeedsForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: SpeedsForm; calculated?: boolean }>('speeds');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Speeds & Feeds',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('speeds', { form, calculated: presentation !== null }), 350);
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
    const diaLabel = form.process === 'mill' ? 'Cutter diameter' : form.process === 'turn' ? 'Work diameter' : 'Drill diameter';
    const feedLabel = form.process === 'mill' ? 'Chip load — feed per tooth' : 'Feed per revolution';
    const parts: HTMLElement[] = [
      segmented<Process>({
        ariaLabel: 'Process',
        value: form.process,
        extraClass: 'seg-mode',
        options: [
          { value: 'mill', label: 'Milling' },
          { value: 'turn', label: 'Turning' },
          { value: 'drill', label: 'Drilling' },
        ],
        onChange: (p) => {
          if (p === form.process) return;
          form.process = p;
          invalidate();
          build();
        },
      }),
      segmented<Unit>({
        ariaLabel: 'Units',
        value: u,
        tone: 'neutral',
        options: [
          { value: 'in', label: 'INCH', sub: 'SFM · in' },
          { value: 'mm', label: 'METRIC', sub: 'm/min · mm' },
        ],
        onChange: (v) => {
          if (v === u) return;
          form = { ...defaults(v), process: form.process, basis: form.basis };
          invalidate();
          build();
        },
      }),
    ];

    const card = h('section', { class: 'card form-card' });
    card.append(num('dia', diaLabel, form.diaText, u, (v) => (form.diaText = v), u === 'in' ? 'e.g. .500' : 'e.g. 12').el);
    card.append(
      segmented<'speed' | 'rpm'>({
        ariaLabel: 'Starting value',
        value: form.basis,
        tone: 'neutral',
        options: [
          { value: 'speed', label: u === 'in' ? 'SFM' : 'm/min', sub: 'start from speed' },
          { value: 'rpm', label: 'RPM', sub: 'start from RPM' },
        ],
        onChange: (b) => {
          if (b === form.basis) return;
          form.basis = b;
          invalidate();
          build();
        },
      }),
    );
    if (form.basis === 'speed') card.append(num('speed', u === 'in' ? 'Surface speed (SFM)' : 'Surface speed (m/min)', form.speedText, u === 'in' ? 'SFM' : 'm/min', (v) => (form.speedText = v), 'from your tool / material data').el);
    else card.append(num('rpm', 'Spindle speed', form.rpmText, 'RPM', (v) => (form.rpmText = v)).el);
    parts.push(card);

    const feedCard = h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Feed (optional)'));
    feedCard.append(num('feed', feedLabel, form.feedText, u === 'in' ? 'in' : 'mm', (v) => (form.feedText = v), 'blank = RPM only').el);
    if (form.process === 'mill') feedCard.append(num('flutes', 'Number of flutes', form.flutesText, null, (v) => (form.flutesText = v), 'e.g. 4').el);
    feedCard.append(num('maxRpm', 'Spindle limit (optional)', form.maxRpmText, 'RPM', (v) => (form.maxRpmText = v), 'machine max RPM').el);
    parts.push(feedCard);

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

  async function calculate(opts: { silent?: boolean } = {}) {
    Object.values(fields).forEach((f) => f.setError(null));
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    const built = toInput(form);
    if (!built.input) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues);
      return;
    }
    const solved = solveSpeeds(built.input);
    if (!solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(solved.issues);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentSpeeds(solved.value, fo);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('speeds', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'speeds',
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
    form = { ...defaults(form.unit), process: form.process, basis: form.basis };
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
      void ctx.repo.setDraft('speeds', { form, calculated: presentation !== null });
    },
  };
}
