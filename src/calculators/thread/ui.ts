import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { fnv1a } from '../../core/hash';
import { formatOptions, fmtLoose } from '../../core/format';
import type { CalcIssue } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { type NumericField, chips, numericField, renderPresentation, segmented, selectField } from '../../ui/components';
import { h } from '../../ui/dom';
import { createActionBar } from '../../ui/action-bar';
import { type ThreadResult, type ThreadSystem, solveThread } from './engine';
import { type ThreadForm, buildThreadInputs, defaultClassLabel, defaultForm, formUnit } from './form';
import { COARSE_METRIC, METRIC_CLASSES_EXTERNAL, METRIC_CLASSES_INTERNAL, metricPitchChoices } from './metric';
import { bestWire } from './wire';
import { presentThread } from './present';
import {
  UNIFIED_CLASSES_EXTERNAL,
  UNIFIED_CLASSES_INTERNAL,
  UNIFIED_SIZES,
  findUnifiedSize,
  findUnifiedSizeByMajor,
  parseDesignation,
} from './unified';

interface ThreadSaved {
  form: ThreadForm;
  limitsOpen: boolean;
  calculated?: boolean;
}

export function threadSignature(form: ThreadForm, res: ThreadResult): string {
  const i = res.inputs;
  return fnv1a(JSON.stringify([i.system, i.unit, i.majorDia, i.pitch, i.external, i.classLabel, i.actualWire, i.targetPitchDia, i.manualLimits, i.measuredOverWires]));
}

export async function mountThread(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen thread-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form: ThreadForm = defaultForm(ctx.settings.defaultUnit === 'mm' ? 'metric' : 'unified', ctx.settings);
  let limitsOpen = false;
  let record: CalcRecord | null = null;
  let presentation: Presentation | null = null;
  let draftTimer: number | undefined;
  const fields: Record<string, NumericField> = {};

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => `Thread Mav — ${presentation?.title ?? 'calculation'}`,
    onNew: () => newCalc(),
  });

  /* ---------- load initial state ---------- */
  const recId = params.get('r');
  let autoCalc = false;
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const saved = rec?.inputs as ThreadSaved | undefined;
    if (rec && saved?.form) {
      form = { ...defaultForm(saved.form.system, ctx.settings), ...saved.form };
      limitsOpen = !!saved.limitsOpen;
      autoCalc = true;
    } else ctx.toast('That saved calculation could not be opened');
  } else {
    const draft = await ctx.repo.getDraft<ThreadSaved>('thread');
    if (draft?.form) {
      form = { ...defaultForm(draft.form.system, ctx.settings), ...draft.form };
      limitsOpen = !!draft.limitsOpen;
      autoCalc = !!draft.calculated;
    }
  }

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => {
      void ctx.repo.setDraft<ThreadSaved>('thread', { form, limitsOpen, calculated: presentation !== null });
    }, 350);
  };

  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };

  /* ---------- helpers ---------- */
  const unit = () => formUnit(form);
  const unitLabel = () => (unit() === 'in' ? 'in' : 'mm');

  const currentPitch = (): number | null => {
    const v = Number(form.pitchText);
    if (!(v > 0)) return null;
    return form.pitchMode === 'tpi' ? (unit() === 'in' ? 1 / v : 25.4 / v) : v;
  };

  const classOptions = () =>
    form.system === 'unified'
      ? form.external ? UNIFIED_CLASSES_EXTERNAL : UNIFIED_CLASSES_INTERNAL
      : form.external ? METRIC_CLASSES_EXTERNAL : METRIC_CLASSES_INTERNAL;

  const num = (id: string, label: string, value: string, extra: { unit?: string | null; placeholder?: string; hint?: string; onInput?: (v: string) => void } = {}) => {
    const f = numericField({
      id,
      label,
      value,
      unit: extra.unit === undefined ? unitLabel() : extra.unit,
      placeholder: extra.placeholder ?? '',
      ...(extra.hint ? { hint: extra.hint } : {}),
      onInput: (v) => {
        extra.onInput?.(v);
        invalidate();
      },
    });
    fields[id] = f;
    return f;
  };

  /* ---------- form construction ---------- */
  function build() {
    for (const k of Object.keys(fields)) delete fields[k];
    const parts: HTMLElement[] = [];

    parts.push(
      segmented<ThreadSystem>({
        extraClass: `seg-system seg-${form.system}`,
        ariaLabel: 'Thread system',
        value: form.system,
        options: [
          { value: 'unified', label: 'UNIFIED', sub: 'INCH' },
          { value: 'metric', label: 'ISO METRIC', sub: 'mm' },
          { value: 'custom', label: 'CUSTOM', sub: 'ODDBALL' },
        ],
        onChange: (sys) => {
          if (sys === form.system) return;
          const ext = form.external;
          form = { ...defaultForm(sys, ctx.settings), external: ext, classLabel: defaultClassLabel(sys, ext, ctx.settings) };
          invalidate();
          build();
        },
      }),
    );

    if (form.system !== 'custom') parts.push(quickEntry());

    const card = h('section', { class: 'card form-card' });
    if (form.system === 'unified') buildUnified(card);
    else if (form.system === 'metric') buildMetric(card);
    else buildCustom(card);
    parts.push(card);

    const opts = h('section', { class: 'card form-card' });
    opts.append(
      segmented<'ext' | 'int'>({
        ariaLabel: 'External or internal',
        value: form.external ? 'ext' : 'int',
        options: [
          { value: 'ext', label: 'EXTERNAL', sub: 'bolt / screw' },
          { value: 'int', label: 'INTERNAL', sub: 'nut / tapped' },
        ],
        tone: 'neutral',
        onChange: (v) => {
          const ext = v === 'ext';
          if (ext === form.external) return;
          form.external = ext;
          if (form.system !== 'custom') form.classLabel = defaultClassLabel(form.system, ext, ctx.settings);
          if (!ext) form.measuredText = '';
          invalidate();
          build();
        },
      }),
    );
    if (form.system !== 'custom') {
      const cls = selectField({
        id: 'class',
        label: 'Thread class',
        options: classOptions().map((c) => ({ value: c, label: c })),
        value: classOptions().includes(form.classLabel as never) ? form.classLabel : classOptions()[0]!,
        onChange: (v) => {
          form.classLabel = v;
          invalidate();
        },
      });
      if (!(classOptions() as readonly string[]).includes(form.classLabel)) form.classLabel = classOptions()[0]!;
      opts.append(cls.el);
    }
    parts.push(opts);

    if (form.external) {
      const wireCard = h('section', { class: 'card form-card' });
      if (ctx.settings.wireMode === 'actual') {
        const wf = num('wire', 'Actual wire diameter', form.wireText, {
          placeholder: 'blank = use best wire',
          onInput: (v) => {
            form.wireText = v;
            refreshHints();
          },
        });
        wireCard.append(wf.el, h('div', { class: 'best-hint', id: 'best-hint' }));
        wireCard.append(h('div', { class: 'all-actual' }, 'All calculations use the actual wire size entered.'));
      } else {
        wireCard.append(h('div', { class: 'best-hint', id: 'best-hint' }), h('div', { class: 'all-actual' }, 'Wire mode: BEST — calculations use the theoretical best wire. Change in Settings.'));
      }
      const mf = num('measured', 'Measured over wires (optional)', form.measuredText, {
        placeholder: 'micrometer reading',
        onInput: (v) => (form.measuredText = v),
      });
      wireCard.append(mf.el);
      parts.push(wireCard);
    }

    if (limitsOpen) parts.push(limitsPanel());

    parts.push(
      h('button', { class: 'btn btn-calc', type: 'button', on: { click: () => void calculate() } }, 'CALCULATE'),
      h(
        'div',
        { class: 'btn-row' },
        h(
          'button',
          { class: `btn btn-secondary ${limitsOpen || form.limitMinText || form.limitMaxText ? 'is-on' : ''}`, type: 'button', 'aria-expanded': String(limitsOpen), on: { click: () => { limitsOpen = !limitsOpen; saveDraft(); build(); } } },
          'MANUAL LIMITS',
          form.limitMinText || form.limitMaxText ? h('span', { class: 'dot' }) : null,
        ),
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearForm() } }, 'CLEAR'),
      ),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );

    formHost.replaceChildren(...parts);
    refreshHints();
  }

  function quickEntry(): HTMLElement {
    const msg = h('div', { class: 'quick-msg' });
    const input = h('input', {
      class: 'text-input',
      type: 'text',
      inputmode: 'text',
      enterkeyhint: 'go',
      autocomplete: 'off',
      autocorrect: 'off',
      autocapitalize: 'characters',
      spellcheck: 'false',
      placeholder: form.system === 'metric' ? 'Quick entry: M10x1.5' : 'Quick entry: 3/8-16   #10-32   M10x1.5',
      'aria-label': 'Quick entry thread designation',
    });
    const apply = () => {
      const raw = input.value;
      if (!raw.trim()) {
        msg.textContent = '';
        return;
      }
      const p = parseDesignation(raw);
      if (!p) {
        msg.className = 'quick-msg bad';
        msg.textContent = '⚠ Couldn’t read that. Try 3/8-16, #10-32 or M10x1.5';
        return;
      }
      const ext = form.external;
      form = { ...defaultForm(p.system, ctx.settings), external: ext, classLabel: defaultClassLabel(p.system, ext, ctx.settings) };
      if (p.system === 'unified') {
        const size = findUnifiedSizeByMajor(p.major);
        form.sizeLabel = size ? size.label : 'other';
        form.majorText = String(Number(p.major.toFixed(6)));
        form.pitchText = String(p.tpi);
      } else {
        form.sizeLabel = COARSE_METRIC.some((m) => m.d === p.major) ? `M${p.major}` : 'other';
        form.majorText = String(p.major);
        form.pitchText = String(p.pitch);
      }
      if (p.classLabel && (classOptions() as readonly string[]).map((c) => c.toLowerCase()).includes(p.classLabel.toLowerCase())) {
        form.classLabel = (classOptions() as readonly string[]).find((c) => c.toLowerCase() === p.classLabel!.toLowerCase())!;
      }
      invalidate();
      build();
      const m = formHost.querySelector('.quick-msg');
      if (m) {
        m.className = 'quick-msg good';
        m.textContent = `✓ Read as ${p.system === 'unified' ? `${p.sizeLabel}-${fmtLoose(p.tpi ?? 0)}` : `${p.sizeLabel} × ${p.pitch}`}`;
      }
    };
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        input.blur();
        apply();
      }
    });
    input.addEventListener('change', apply);
    return h('div', { class: 'quick' }, input, msg);
  }

  function buildUnified(card: HTMLElement) {
    const sizeSel = selectField({
      id: 'size',
      label: 'Nominal size',
      options: [
        { value: '', label: 'Select size…' },
        ...UNIFIED_SIZES.map((s) => ({ value: s.label, label: `${s.label}   (${s.major.toFixed(4)}")` })),
        { value: 'other', label: 'Other — type decimal' },
      ],
      value: form.sizeLabel,
      onChange: (v) => {
        form.sizeLabel = v;
        const size = findUnifiedSize(v);
        if (size) {
          form.majorText = String(size.major);
          form.pitchText = String((size.pitches.find((p) => p.series === 'UNC') ?? size.pitches[0]!).tpi);
        } else if (v === 'other') {
          form.majorText = '';
          form.pitchText = '';
        }
        invalidate();
        build();
      },
    });
    card.append(sizeSel.el);
    if (form.sizeLabel === 'other' || (form.sizeLabel === '' && form.majorText)) {
      card.append(num('major', 'Major diameter', form.majorText, { onInput: (v) => (form.majorText = v) }).el);
    } else {
      card.append(h('div', { class: 'readout', id: 'major-readout' }));
      fields['major'] = numericField({ id: 'major-hidden', label: '', value: form.majorText });
    }
    const size = findUnifiedSize(form.sizeLabel);
    if (size) {
      card.append(
        chips({
          ariaLabel: 'Threads per inch',
          selected: form.pitchText,
          items: size.pitches.map((p) => ({ value: String(p.tpi), label: String(p.tpi), sub: p.series })),
          onPick: (v) => {
            form.pitchText = v;
            invalidate();
            build();
          },
        }),
      );
    }
    card.append(
      num('pitch', 'Threads per inch (TPI)', form.pitchText, {
        unit: 'TPI',
        onInput: (v) => {
          form.pitchText = v;
          refreshHints();
        },
      }).el,
    );
  }

  function buildMetric(card: HTMLElement) {
    const sel = selectField({
      id: 'size',
      label: 'Nominal diameter',
      options: [
        { value: '', label: 'Select size…' },
        ...COARSE_METRIC.map((m) => ({ value: `M${m.d}`, label: `M${m.d}` })),
        { value: 'other', label: 'Other — type diameter' },
      ],
      value: form.sizeLabel,
      onChange: (v) => {
        form.sizeLabel = v;
        const m = COARSE_METRIC.find((x) => `M${x.d}` === v);
        if (m) {
          form.majorText = String(m.d);
          form.pitchText = String(m.pitch);
        } else if (v === 'other') {
          form.majorText = '';
          form.pitchText = '';
        }
        invalidate();
        build();
      },
    });
    card.append(sel.el);
    if (form.sizeLabel === 'other' || (form.sizeLabel === '' && form.majorText)) {
      card.append(num('major', 'Nominal diameter', form.majorText, { onInput: (v) => (form.majorText = v) }).el);
    } else {
      card.append(h('div', { class: 'readout', id: 'major-readout' }));
      fields['major'] = numericField({ id: 'major-hidden', label: '', value: form.majorText });
    }
    const d = Number(form.majorText);
    const choices = d > 0 ? metricPitchChoices(d) : [];
    if (choices.length) {
      card.append(
        chips({
          ariaLabel: 'Pitch',
          selected: form.pitchText,
          items: choices.map((c) => ({ value: String(c.pitch), label: String(c.pitch), sub: c.fine ? 'fine' : 'coarse' })),
          onPick: (v) => {
            form.pitchText = v;
            invalidate();
            build();
          },
        }),
      );
    }
    card.append(num('pitch', 'Pitch', form.pitchText, { unit: 'mm', onInput: (v) => { form.pitchText = v; refreshHints(); } }).el);
  }

  function buildCustom(card: HTMLElement) {
    card.append(
      segmented<'in' | 'mm'>({
        ariaLabel: 'Units',
        value: form.unit,
        tone: 'neutral',
        options: [
          { value: 'in', label: 'INCH' },
          { value: 'mm', label: 'METRIC mm' },
        ],
        onChange: (u) => {
          if (u === form.unit) return;
          form.unit = u;
          invalidate();
          build();
        },
      }),
      num('major', 'Major diameter', form.majorText, { onInput: (v) => (form.majorText = v) }).el,
      segmented<'tpi' | 'pitch'>({
        ariaLabel: 'Pitch entry',
        value: form.pitchMode,
        tone: 'neutral',
        options: [
          { value: 'tpi', label: 'TPI' },
          { value: 'pitch', label: 'PITCH' },
        ],
        onChange: (m) => {
          if (m === form.pitchMode) return;
          form.pitchMode = m;
          form.pitchText = '';
          invalidate();
          build();
        },
      }),
      num('pitch', form.pitchMode === 'tpi' ? 'Threads per inch (TPI)' : 'Pitch', form.pitchText, {
        unit: form.pitchMode === 'tpi' ? 'TPI' : unitLabel(),
        onInput: (v) => { form.pitchText = v; refreshHints(); },
      }).el,
      num('targetPd', 'Target pitch diameter (optional)', form.targetPdText, {
        placeholder: 'blank = basic (D − 0.6495P)',
        onInput: (v) => (form.targetPdText = v),
      }).el,
    );
  }

  function limitsPanel(): HTMLElement {
    return h(
      'section',
      { class: 'card form-card manual-card' },
      h('h3', { class: 'card-title' }, 'Manual limits ', h('span', { class: 'badge badge-manual' }, 'USER-ENTERED')),
      h('p', { class: 'dim small' }, 'Pitch-diameter limits from your print or standard. Shown as MANUAL — never as verified standard data.'),
      num('limitMin', 'Pitch diameter — Minimum', form.limitMinText, { onInput: (v) => (form.limitMinText = v) }).el,
      num('limitMax', 'Pitch diameter — Maximum', form.limitMaxText, { onInput: (v) => (form.limitMaxText = v) }).el,
    );
  }

  /** Live hints that don't need a rebuild: major readout and best-wire suggestion. */
  function refreshHints() {
    const mr = formHost.querySelector<HTMLElement>('#major-readout');
    if (mr) {
      const v = Number(form.majorText);
      if (v > 0) {
        const dl = dualFrom(v, unit());
        mr.replaceChildren(
          h('span', { class: 'dim' }, form.system === 'metric' ? 'Major ⌀ ' : 'Major ⌀ '),
          h('span', { class: unit() === 'in' ? 'val-in' : 'val-mm' }, unit() === 'in' ? `${dl.in.toFixed(4)} in` : `${dl.mm.toFixed(3)} mm`),
          h('span', { class: 'dim' }, ' ('),
          h('span', { class: unit() === 'in' ? 'val-mm' : 'val-in' }, unit() === 'in' ? `${dl.mm.toFixed(3)} mm` : `${dl.in.toFixed(4)} in`),
          h('span', { class: 'dim' }, ')'),
        );
      } else mr.replaceChildren();
    }
    const bh = formHost.querySelector<HTMLElement>('#best-hint');
    if (bh) {
      const p = currentPitch();
      if (p) {
        const bw = bestWire(p);
        const dl = dualFrom(bw, unit());
        const txt = unit() === 'in' ? dl.in.toFixed(4) : dl.mm.toFixed(3);
        const alt = unit() === 'in' ? `${dl.mm.toFixed(3)} mm` : `${dl.in.toFixed(4)} in`;
        const useBtn = h('button', { class: 'link-btn', type: 'button', on: { click: () => { form.wireText = unit() === 'in' ? dl.in.toFixed(5) : dl.mm.toFixed(4); fields['wire']?.set(form.wireText); invalidate(); } } }, 'USE');
        bh.replaceChildren(
          h('span', null, 'Best wire: '),
          h('span', { class: unit() === 'in' ? 'val-in' : 'val-mm' }, `${txt} ${unitLabel()}`),
          h('span', { class: 'dim' }, ' ('),
          h('span', { class: unit() === 'in' ? 'val-mm' : 'val-in' }, alt),
          h('span', { class: 'dim' }, ') '),
        );
        if (ctx.settings.wireMode === 'actual') bh.append(useBtn);
      } else bh.replaceChildren(h('span', { class: 'dim' }, 'Best wire appears once size and pitch are set.'));
    }
  }

  /* ---------- actions ---------- */
  function showIssues(issues: CalcIssue[]) {
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    let first: HTMLElement | null = null;
    const general: string[] = [];
    for (const i of issues) {
      const f = i.field ? fields[i.field] : undefined;
      if (f && f.el.isConnected) {
        f.setError(i.message);
        first ??= f.input;
      } else if (i.field === 'major' || i.field === 'size') {
        general.push(i.message);
        formHost.querySelector('#f-size')?.scrollIntoView({ block: 'center' });
      } else if (i.field === 'wire' && ctx.settings.wireMode === 'best') {
        general.push(i.message);
      } else general.push(i.message);
    }
    if (banner) {
      banner.textContent = general.length ? `⚠ ${general.join(' ')}` : issues.length ? '⚠ Fix the highlighted fields.' : '';
      banner.classList.toggle('show', issues.length > 0);
    }
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    else banner?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }

  function clearErrors() {
    Object.values(fields).forEach((f) => f.setError(null));
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    if (banner) {
      banner.textContent = '';
      banner.classList.remove('show');
    }
  }

  async function calculate(opts: { openRecord?: CalcRecord } = {}) {
    clearErrors();
    const calcForm = ctx.settings.wireMode === 'best' ? { ...form, wireText: '' } : form;
    const built = buildThreadInputs(calcForm);
    if (!built.ok) {
      resultHost.replaceChildren();
      presentation = null;
      showIssues(built.issues);
      return;
    }
    const solved = solveThread(built.value);
    if (!solved.ok) {
      resultHost.replaceChildren();
      presentation = null;
      showIssues(solved.issues);
      return;
    }
    const res = solved.value;
    const fo = formatOptions(ctx.settings);
    presentation = presentThread(res);
    const sig = threadSignature(form, res);
    if (opts.openRecord) record = opts.openRecord;
    else {
      const existing = autoSilent ? await ctx.repo.findBySignature('thread', sig) : undefined;
      record =
        existing ??
        (await ctx.repo.recordCalculation({
          calcId: 'thread',
          signature: sig,
          title: presentation.title,
          subtitle: presentation.subtitle,
          inputs: { form, limitsOpen } satisfies ThreadSaved,
          summary: toSummary(presentation, fo),
          engine: ENGINE_VERSION,
        }));
    }
    resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
    bar.setRecord(record);
    saveDraft();
    resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }
  let autoSilent = false;

  function clearForm() {
    form = { ...defaultForm(form.system, ctx.settings), external: form.external, unit: form.unit, classLabel: defaultClassLabel(form.system, form.external, ctx.settings) };
    limitsOpen = false;
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    saveDraft();
    build();
    window.scrollTo({ top: 0 });
  }
  function newCalc() {
    clearForm();
  }

  build();
  if (autoCalc) {
    autoSilent = true;
    const rec = recId ? record ?? (await ctx.repo.getRecord(recId)) : undefined;
    await calculate(rec ? { openRecord: rec } : {});
    autoSilent = false;
    window.scrollTo({ top: 0 });
  }

  return {
    el: root,
    destroy() {
      window.clearTimeout(draftTimer);
      bar.destroy();
      void ctx.repo.setDraft<ThreadSaved>('thread', { form, limitsOpen, calculated: presentation !== null });
    },
  };
}
