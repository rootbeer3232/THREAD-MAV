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
import { taperDiagram } from './diagram';
import { type TaperInput, type TaperKind, solveTaper } from './engine';
import { presentTaper } from './present';

interface TaperForm {
  unit: Unit;
  largeText: string;
  smallText: string;
  lengthText: string;
  kind: TaperKind;
  taperText: string;
  partText: string;
}
const defaults = (unit: Unit): TaperForm => ({ unit, largeText: '', smallText: '', lengthText: '', kind: 'perUnit', taperText: '', partText: '' });

function toInput(f: TaperForm): { input?: TaperInput; issues: CalcIssue[] } {
  const issues: CalcIssue[] = [];
  const get = (t: string, field: string, label: string) => {
    const v = parseDecimal(t);
    if (v !== null && Number.isNaN(v)) {
      issues.push({ field, message: `${label} isn’t a valid number.` });
      return null;
    }
    return v;
  };
  const large = get(f.largeText, 'large', 'Large diameter');
  const small = get(f.smallText, 'small', 'Small diameter');
  const length = get(f.lengthText, 'length', 'Taper length');
  const taper = get(f.taperText, 'taper', 'Taper');
  const partLength = get(f.partText, 'partLength', 'Part length');
  if (issues.length) return { issues };
  return { issues, input: { unit: f.unit, large, small, length, taper, taperKind: f.kind, partLength } };
}

export async function mountTaper(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen taper-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(h('div', { class: 'diagram-card card' }, taperDiagram()), formHost, resultHost);

  let form = defaults(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentTaper> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields: Record<string, NumericField> = {};

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = (rec?.inputs as { form?: TaperForm } | undefined)?.form;
    if (rec && f) {
      form = { ...defaults(ctx.settings.defaultUnit), ...f };
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: TaperForm; calculated?: boolean }>('taper');
    if (d?.form) {
      form = { ...defaults(ctx.settings.defaultUnit), ...d.form };
      autoCalc = !!d.calculated;
    }
  }

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Taper',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('taper', { form, calculated: presentation !== null }), 350);
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
    const kinds: { value: TaperKind; label: string; unit: string }[] =
      u === 'in'
        ? [
            { value: 'perUnit', label: 'PER INCH', unit: 'in/in' },
            { value: 'perFoot', label: 'PER FOOT', unit: 'in/ft' },
            { value: 'included', label: 'INCLUDED', unit: '°' },
            { value: 'perSide', label: 'PER SIDE', unit: '°' },
          ]
        : [
            { value: 'perUnit', label: 'PER mm', unit: 'mm/mm' },
            { value: 'per100', label: 'PER 100', unit: 'mm' },
            { value: 'included', label: 'INCLUDED', unit: '°' },
            { value: 'perSide', label: 'PER SIDE', unit: '°' },
          ];
    if (!kinds.some((k) => k.value === form.kind)) form.kind = 'perUnit';
    const cur = kinds.find((k) => k.value === form.kind)!;
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
          form = { ...defaults(v) };
          invalidate();
          build();
        },
      }),
      h('p', { class: 'dim small hint-line' }, 'Enter all three of D, d and length — or a taper plus any two of them. Leave the one you want solved blank.'),
      h(
        'section',
        { class: 'card form-card' },
        num('large', 'Large diameter (D)', form.largeText, u, (v) => (form.largeText = v)).el,
        num('small', 'Small diameter (d)', form.smallText, u, (v) => (form.smallText = v)).el,
        num('length', 'Taper length (L)', form.lengthText, u, (v) => (form.lengthText = v)).el,
      ),
      h(
        'section',
        { class: 'card form-card' },
        h('h3', { class: 'card-title' }, 'Taper (when you know it)'),
        segmented<TaperKind>({
          ariaLabel: 'Taper type',
          value: form.kind,
          tone: 'neutral',
          options: kinds.map((k) => ({ value: k.value, label: k.label })),
          onChange: (k) => {
            form.kind = k;
            invalidate();
            build();
          },
        }),
        num('taper', 'Taper', form.taperText, cur.unit, (v) => (form.taperText = v), form.kind === 'perFoot' ? 'e.g. .6024' : form.kind === 'perUnit' ? 'e.g. .05' : '').el,
      ),
      h('section', { class: 'card form-card' }, h('h3', { class: 'card-title' }, 'Tailstock set-over (optional)'), num('partLength', 'Overall part length', form.partText, u, (v) => (form.partText = v), 'blank = skip').el),
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
    const solved = built.input ? solveTaper(built.input) : null;
    if (!built.input || !solved || !solved.ok) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
      showIssues(built.issues.length ? built.issues : solved && !solved.ok ? solved.issues : []);
      return;
    }
    const fo = formatOptions(ctx.settings);
    presentation = presentTaper(solved.value);
    const sig = fnv1a(JSON.stringify(built.input));
    if (!(record && record.signature === sig)) {
      const existing = opts.silent ? await ctx.repo.findBySignature('taper', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'taper',
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
    form = { ...defaults(form.unit), kind: form.kind };
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
      void ctx.repo.setDraft('taper', { form, calculated: presentation !== null });
    },
  };
}
