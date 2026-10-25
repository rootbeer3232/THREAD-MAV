import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { solveContour } from '../../core/contour/engine';
import { CONTOUR_SCHEMA, type ContourProfile, type SegmentKind } from '../../core/contour/types';
import { formatOptions } from '../../core/format';
import { fnv1a } from '../../core/hash';
import { parseDecimal } from '../../core/numeric';
import { toShareText, toSummary } from '../../core/present-common';
import { MM_PER_INCH, type Unit } from '../../core/units';
import type { CalcRecord } from '../../storage/types';
import { createActionBar } from '../../ui/action-bar';
import { type NumericField, numericField, renderPresentation, segmented } from '../../ui/components';
import { h } from '../../ui/dom';
import { presentContour } from './present';

/**
 * Form state keeps ONE canonical value per field in millimetres (null = blank/unknown).
 * `t` is only the text currently displayed. Switching display units re-renders text from the canonical
 * value, so repeated inch/mm toggling never loses precision or reinterprets what was typed.
 */
interface Cell {
  v: number | null;
  t: string;
  bad: boolean;
}
interface FormState {
  schema: typeof CONTOUR_SCHEMA;
  unit: Unit;
  side: 'od' | 'id';
  pts: { x: Cell; z: Cell }[];
  segs: { kind: SegmentKind; v: Cell }[];
}

const cell = (): Cell => ({ v: null, t: '', bad: false });
const newPoint = () => ({ x: cell(), z: cell() });
const newSeg = (kind: SegmentKind = 'straight') => ({ kind, v: cell() });

const initial = (unit: Unit): FormState => ({
  schema: CONTOUR_SCHEMA,
  unit,
  side: 'od',
  pts: [{ x: cell(), z: { v: 0, t: '0', bad: false } }, newPoint()],
  segs: [newSeg()],
});

/** Display text for a canonical mm value in a unit (trimmed; display only). */
function show(mm: number | null, unit: Unit): string {
  if (mm === null) return '';
  const v = unit === 'in' ? mm / MM_PER_INCH : mm;
  return String(Number(v.toFixed(unit === 'in' ? 6 : 5)));
}

function retext(f: FormState) {
  const all = [...f.pts.flatMap((p) => [p.x, p.z]), ...f.segs.map((s) => s.v)];
  for (const c of all) if (!c.bad) c.t = show(c.v, f.unit);
}

const profileOf = (f: FormState): ContourProfile => ({
  schema: CONTOUR_SCHEMA,
  side: f.side,
  points: f.pts.map((p) => ({ x: p.x.v, z: p.z.v })),
  segments: f.segs.map((s) => ({ kind: s.kind, value: s.v.v })),
});

export async function mountContour(ctx: AppContext, params: URLSearchParams): Promise<Screen> {
  const root = h('div', { class: 'screen contour-screen' });
  const formHost = h('div', { class: 'form-host' });
  const resultHost = h('div', { class: 'result-host', 'aria-live': 'polite' });
  root.append(formHost, resultHost);

  let form = initial(ctx.settings.defaultUnit);
  let record: CalcRecord | null = null;
  let presentation: ReturnType<typeof presentContour> | null = null;
  let draftTimer: number | undefined;
  let autoCalc = false;
  const fields = new Map<string, NumericField>();

  const load = (f: FormState | undefined): FormState | null => (f && f.schema === CONTOUR_SCHEMA && Array.isArray(f.pts) && f.pts.length >= 2 && f.segs.length === f.pts.length - 1 ? f : null);
  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = load((rec?.inputs as { form?: FormState } | undefined)?.form);
    if (rec && f) {
      form = f;
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved profile could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: FormState; calculated?: boolean }>('contour');
    const f = load(d?.form);
    if (f) {
      form = f;
      autoCalc = !!d?.calculated;
    }
  }
  retext(form);

  const bar = createActionBar({
    ctx,
    getShareText: (note) => (presentation ? toShareText(presentation, formatOptions(ctx.settings), note, VERSION_LABEL) : ''),
    shareTitle: () => 'Thread Mav — Contour IQ',
    onNew: () => clearForm(),
  });

  const saveDraft = () => {
    window.clearTimeout(draftTimer);
    draftTimer = window.setTimeout(() => void ctx.repo.setDraft('contour', { form, calculated: presentation !== null }), 350);
  };
  const invalidate = () => {
    if (presentation) {
      presentation = null;
      record = null;
      resultHost.replaceChildren();
    }
    saveDraft();
  };

  /** Numeric field bound to a Cell. Typing updates the canonical mm value for the CURRENT unit. */
  const bind = (id: string, label: string, c: Cell, opts: { signed?: boolean; unit?: string | null; placeholder?: string } = {}) => {
    const f = numericField({
      id,
      label,
      value: c.t,
      unit: opts.unit === undefined ? form.unit : opts.unit,
      placeholder: opts.placeholder ?? '',
      signed: !!opts.signed,
      onInput: (text) => {
        c.t = text;
        const v = parseDecimal(text);
        c.bad = v !== null && Number.isNaN(v);
        c.v = v === null || Number.isNaN(v) ? null : form.unit === 'in' ? v * MM_PER_INCH : v;
        invalidate();
      },
    });
    fields.set(id, f);
    return f;
  };

  function build() {
    fields.clear();
    const u = form.unit;
    const parts: HTMLElement[] = [
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
          form.unit = v;
          retext(form);
          build();
          saveDraft();
        },
      }),
      segmented<'od' | 'id'>({
        ariaLabel: 'Outside or inside profile',
        value: form.side,
        tone: 'neutral',
        options: [
          { value: 'od', label: 'OD', sub: 'outside' },
          { value: 'id', label: 'ID', sub: 'bore' },
        ],
        onChange: (v) => {
          form.side = v;
          invalidate();
          build();
        },
      }),
      h('p', { class: 'dim small hint-line' }, 'X = diameter. Z is measured from program zero (P0) and is negative toward the chuck. Enter what the print gives you; leave the rest blank.'),
    ];

    form.pts.forEach((p, i) => {
      parts.push(
        h(
          'section',
          { class: 'card form-card contour-card' },
          h('h3', { class: 'card-title' }, `Point P${i + 1}`),
          h('div', { class: 'contour-row' }, bind(`x${i}`, 'X (diameter)', p.x, { placeholder: 'blank = solve' }).el, bind(`z${i}`, 'Z from P0', p.z, { signed: true, placeholder: 'blank = solve' }).el),
        ),
      );
      if (i < form.segs.length) {
        const s = form.segs[i]!;
        parts.push(
          h(
            'section',
            { class: 'card form-card contour-seg' },
            h('h3', { class: 'card-title' }, `Segment P${i + 1} → P${i + 2}`),
            segmented<SegmentKind>({
              ariaLabel: `Segment ${i + 1} type`,
              value: s.kind,
              tone: 'neutral',
              options: [
                { value: 'straight', label: 'STRAIGHT', sub: 'same diameter' },
                { value: 'shoulder', label: 'SHOULDER', sub: 'diameter steps' },
              ],
              onChange: (k) => {
                if (k === s.kind) return;
                s.kind = k;
                s.v = cell();
                invalidate();
                build();
              },
            }),
            bind(`v${i}`, s.kind === 'straight' ? 'Length (optional)' : 'Diameter change ± (optional)', s.v, { signed: s.kind === 'shoulder', placeholder: 'blank = solve' }).el,
          ),
        );
      }
    });

    parts.push(
      h(
        'div',
        { class: 'contour-actions' },
        h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => { form.pts.push(newPoint()); form.segs.push(newSeg()); invalidate(); build(); window.scrollTo({ top: document.body.scrollHeight }); } } }, '+ ADD STEP'),
        h('button', { class: 'btn btn-secondary', type: 'button', disabled: form.pts.length <= 2, on: { click: () => { form.pts.pop(); form.segs.pop(); invalidate(); build(); } } }, '− REMOVE LAST'),
      ),
      h('div', { class: 'btn-row calc-row' }, h('button', { class: 'btn btn-calc-blue', type: 'button', on: { click: () => void calculate() } }, 'Calculate'), h('button', { class: 'btn btn-secondary', type: 'button', on: { click: () => clearForm() } }, 'Clear')),
      h('div', { class: 'err-banner', id: 'err-banner', role: 'alert' }),
    );
    formHost.replaceChildren(...parts);
  }

  async function calculate(opts: { silent?: boolean } = {}) {
    fields.forEach((f) => f.setError(null));
    const banner = formHost.querySelector<HTMLElement>('#err-banner');
    banner?.classList.remove('show');
    // malformed text is reported before solving (never silently treated as blank)
    const badField = [...fields.entries()].find(([id]) => {
      const m = /^([xzv])(\d+)$/.exec(id)!;
      const idx = Number(m[2]);
      const c = m[1] === 'x' ? form.pts[idx]!.x : m[1] === 'z' ? form.pts[idx]!.z : form.segs[idx]!.v;
      return c.bad;
    });
    if (badField) {
      badField[1].setError('That isn’t a valid number.');
      badField[1].input.scrollIntoView({ block: 'center', behavior: 'smooth' });
      resultHost.replaceChildren();
      presentation = null;
      record = null;
      return;
    }
    const profile = profileOf(form);
    const sol = solveContour(profile);
    const fo = formatOptions(ctx.settings);
    presentation = presentContour(sol, form.side);
    const sig = fnv1a(JSON.stringify(profile));
    if (sol.status !== 'red') {
      if (!(record && record.signature === sig)) {
        const existing = opts.silent ? await ctx.repo.findBySignature('contour', sig) : undefined;
        record =
          existing ??
          (await ctx.repo.recordCalculation({
            calcId: 'contour',
            signature: sig,
            title: presentation.title,
            subtitle: presentation.subtitle,
            inputs: { form },
            summary: toSummary(presentation, fo).slice(0, 4),
            engine: ENGINE_VERSION,
          }));
      }
      resultHost.replaceChildren(renderPresentation(presentation, fo), bar.el);
      bar.setRecord(record);
    } else {
      record = null;
      resultHost.replaceChildren(renderPresentation(presentation, fo));
    }
    saveDraft();
    if (!opts.silent) resultHost.firstElementChild?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  function clearForm() {
    const keep = { unit: form.unit, side: form.side };
    form = initial(keep.unit);
    form.side = keep.side;
    presentation = null;
    record = null;
    resultHost.replaceChildren();
    retext(form);
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
      void ctx.repo.setDraft('contour', { form, calculated: presentation !== null });
    },
  };
}
