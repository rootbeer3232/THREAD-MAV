import type { AppContext, Screen } from '../../app/context';
import { ENGINE_VERSION, VERSION_LABEL } from '../../app/version';
import { solveContour } from '../../core/contour/engine';
import { CONTOUR_SCHEMA, CONTOUR_SCHEMA_MIN, type ContourProfile, type SegmentKind } from '../../core/contour/types';
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
 * Form state keeps ONE canonical value per field (null = blank/unknown):
 *   lengths in mm · taper diameter change in mm as the TOTAL signed change on the diameter ·
 *   taper angle in degrees measured FROM THE AXIS.
 * `t` is only the text currently displayed; switching unit / per-side / from-face re-renders text
 * from the canonical value, so toggling never loses precision or reinterprets what was typed.
 */
interface Cell {
  v: number | null;
  t: string;
  bad: boolean;
}
interface SegState {
  kind: SegmentKind;
  v: Cell; // straight length / shoulder diameter change
  len: Cell; // taper axial length
  dx: Cell; // taper total diameter change (signed)
  ang: Cell; // taper angle from the axis
  dir: 1 | -1 | 0; // 0 = auto
}
interface FormState {
  schema: number;
  unit: Unit;
  side: 'od' | 'id';
  /** How the taper diameter change is typed: the TOTAL on the diameter, or PER SIDE (radius). */
  dxMode: 'total' | 'perSide';
  /** Which way the taper angle is measured when typed. */
  angRef: 'axis' | 'face';
  pts: { x: Cell; z: Cell; r: Cell }[];
  segs: SegState[];
}

const cell = (): Cell => ({ v: null, t: '', bad: false });
const newPoint = () => ({ x: cell(), z: cell(), r: cell() });
const newSeg = (kind: SegmentKind = 'straight'): SegState => ({ kind, v: cell(), len: cell(), dx: cell(), ang: cell(), dir: 0 });

const initial = (unit: Unit): FormState => ({
  schema: CONTOUR_SCHEMA,
  unit,
  side: 'od',
  dxMode: 'perSide',
  angRef: 'axis',
  pts: [{ x: cell(), z: { v: 0, t: '0', bad: false }, r: cell() }, newPoint()],
  segs: [newSeg()],
});

const fmtNum = (v: number, dp: number) => String(Number(v.toFixed(dp)));

function lengthText(mm: number | null, unit: Unit): string {
  if (mm === null) return '';
  return unit === 'in' ? fmtNum(mm / MM_PER_INCH, 6) : fmtNum(mm, 5);
}
function dxText(f: FormState, mm: number | null): string {
  return lengthText(mm === null ? null : f.dxMode === 'perSide' ? mm / 2 : mm, f.unit);
}
function angText(f: FormState, deg: number | null): string {
  if (deg === null) return '';
  return fmtNum(f.angRef === 'face' ? 90 - deg : deg, 6);
}

function retext(f: FormState) {
  for (const p of f.pts) for (const c of [p.x, p.z, p.r]) if (!c.bad) c.t = lengthText(c.v, f.unit);
  for (const s of f.segs) {
    if (!s.v.bad) s.v.t = lengthText(s.v.v, f.unit);
    if (!s.len.bad) s.len.t = lengthText(s.len.v, f.unit);
    if (!s.dx.bad) s.dx.t = dxText(f, s.dx.v);
    if (!s.ang.bad) s.ang.t = angText(f, s.ang.v);
  }
}

const profileOf = (f: FormState): ContourProfile => ({
  schema: CONTOUR_SCHEMA,
  side: f.side,
  points: f.pts.map((p) => ({ x: p.x.v, z: p.z.v, radius: p.r.v })),
  segments: f.segs.map((s) => (s.kind === 'taper' ? { kind: 'taper' as const, value: null, length: s.len.v, dx: s.dx.v, angle: s.ang.v, dir: s.dir === 0 ? null : s.dir } : { kind: s.kind, value: s.v.v })),
});

/** Accept forms saved by older builds (v1 had no taper fields) and fill in the missing pieces. */
function migrate(raw: unknown): FormState | null {
  const f = raw as Partial<FormState> | undefined;
  if (!f || typeof f.schema !== 'number' || f.schema < CONTOUR_SCHEMA_MIN || f.schema > CONTOUR_SCHEMA) return null;
  if (!Array.isArray(f.pts) || !Array.isArray(f.segs) || f.pts.length < 2 || f.segs.length !== f.pts.length - 1) return null;
  return {
    schema: CONTOUR_SCHEMA,
    unit: f.unit === 'mm' ? 'mm' : 'in',
    side: f.side === 'id' ? 'id' : 'od',
    dxMode: f.dxMode === 'total' ? 'total' : 'perSide',
    angRef: f.angRef === 'face' ? 'face' : 'axis',
    pts: f.pts.map((p) => ({ ...p, r: p.r ?? cell() })),
    segs: f.segs.map((s) => ({ ...newSeg(s.kind), ...s, len: s.len ?? cell(), dx: s.dx ?? cell(), ang: s.ang ?? cell(), dir: s.dir ?? 0 })),
  };
}

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

  const recId = params.get('r');
  if (recId) {
    const rec = await ctx.repo.getRecord(recId);
    const f = migrate((rec?.inputs as { form?: unknown } | undefined)?.form);
    if (rec && f) {
      form = f;
      record = rec;
      autoCalc = true;
    } else ctx.toast('That saved profile could not be opened');
  } else {
    const d = await ctx.repo.getDraft<{ form: unknown; calculated?: boolean }>('contour');
    const f = migrate(d?.form);
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

  /** Convert what the user typed (in the current unit / mode) into the canonical value. */
  type Kind = 'len' | 'dx' | 'ang';
  const canonical = (kind: Kind, typed: number): number => {
    if (kind === 'ang') return form.angRef === 'face' ? 90 - typed : typed;
    const mm = form.unit === 'in' ? typed * MM_PER_INCH : typed;
    return kind === 'dx' && form.dxMode === 'perSide' ? mm * 2 : mm;
  };

  const bind = (id: string, label: string, c: Cell, kind: Kind, opts: { signed?: boolean; unit?: string | null; placeholder?: string; after?: () => void } = {}) => {
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
        c.v = v === null || Number.isNaN(v) ? null : canonical(kind, v);
        opts.after?.();
        invalidate();
      },
    });
    fields.set(id, f);
    return f;
  };

  function taperCard(i: number, s: SegState): HTMLElement[] {
    const u = form.unit;
    const echo = h('div', { class: 'frac-echo' });
    const refreshEcho = () => {
      echo.textContent = s.dx.v === null ? '' : `= ${u === 'in' ? `${(s.dx.v / MM_PER_INCH).toFixed(4)} in` : `${s.dx.v.toFixed(3)} mm`} change on the diameter (X)`;
    };
    refreshEcho();
    return [
      segmented<'total' | 'perSide'>({
        ariaLabel: 'Diameter change entered as',
        value: form.dxMode,
        tone: 'neutral',
        options: [
          { value: 'perSide', label: 'PER SIDE', sub: 'radius change' },
          { value: 'total', label: 'TOTAL', sub: 'on the diameter' },
        ],
        onChange: (m) => {
          form.dxMode = m;
          retext(form);
          saveDraft();
          build();
        },
      }),
      segmented<'0' | '1' | '-1'>({
        ariaLabel: 'Diameter direction toward the chuck',
        value: String(s.dir) as '0',
        tone: 'neutral',
        options: [
          { value: '0', label: 'AUTO', sub: 'from the numbers' },
          { value: '1', label: 'BIGGER', sub: 'toward chuck' },
          { value: '-1', label: 'SMALLER', sub: 'toward chuck' },
        ],
        onChange: (d) => {
          s.dir = Number(d) as 0 | 1 | -1;
          invalidate();
          build();
        },
      }),
      bind(`len${i}`, 'Axial length (optional)', s.len, 'len', { placeholder: 'blank = solve' }).el,
      bind(`dx${i}`, form.dxMode === 'perSide' ? 'Diameter change PER SIDE ± (optional)' : 'Diameter change TOTAL ± (optional)', s.dx, 'dx', { signed: true, placeholder: 'blank = solve', after: refreshEcho }).el,
      echo,
      segmented<'axis' | 'face'>({
        ariaLabel: 'Angle measured from',
        value: form.angRef,
        tone: 'neutral',
        options: [
          { value: 'axis', label: 'FROM AXIS', sub: 'centerline' },
          { value: 'face', label: 'FROM FACE', sub: 'end face' },
        ],
        onChange: (r) => {
          form.angRef = r;
          retext(form);
          saveDraft();
          build();
        },
      }),
      bind(`ang${i}`, 'Angle (optional)', s.ang, 'ang', { unit: '°', placeholder: 'blank = solve' }).el,
      h('p', { class: 'dim small' }, 'Give any TWO of length, diameter change and angle — Contour IQ solves the third. Leave direction on AUTO unless the numbers don’t show it.'),
    ];
  }

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
          h('div', { class: 'contour-row' }, bind(`x${i}`, 'X (diameter)', p.x, 'len', { placeholder: 'blank = solve' }).el, bind(`z${i}`, 'Z from P0', p.z, 'len', { signed: true, placeholder: 'blank = solve' }).el),
          ...(i > 0 && i < form.pts.length - 1
            ? [bind(`r${i}`, 'Corner radius (optional)', p.r, 'len', { placeholder: 'blank = sharp corner' }).el, h('p', { class: 'dim small' }, 'X and Z above are the SHARP corner, as dimensioned on the print — the radius is blended in for you.')]
            : []),
        ),
      );
      if (i < form.segs.length) {
        const s = form.segs[i]!;
        const card = h(
          'section',
          { class: 'card form-card contour-seg' },
          h('h3', { class: 'card-title' }, `Segment P${i + 1} → P${i + 2}`),
          segmented<SegmentKind>({
            ariaLabel: `Segment ${i + 1} type`,
            value: s.kind,
            tone: 'neutral',
            options: [
              { value: 'straight', label: 'STRAIGHT', sub: 'same dia' },
              { value: 'shoulder', label: 'SHOULDER', sub: 'dia steps' },
              { value: 'taper', label: 'TAPER', sub: 'angled' },
            ],
            onChange: (k) => {
              if (k === s.kind) return;
              s.kind = k;
              s.v = cell();
              s.len = cell();
              s.dx = cell();
              s.ang = cell();
              s.dir = 0;
              invalidate();
              build();
            },
          }),
        );
        if (s.kind === 'taper') card.append(...taperCard(i, s));
        else card.append(bind(`v${i}`, s.kind === 'straight' ? 'Length (optional)' : 'Diameter change ± (optional)', s.v, 'len', { signed: s.kind === 'shoulder', placeholder: 'blank = solve' }).el);
        parts.push(card);
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
    formHost.querySelector<HTMLElement>('#err-banner')?.classList.remove('show');
    // malformed text is reported before solving (never silently treated as blank)
    const badField = [...fields.entries()].find(([id]) => {
      const m = /^(x|z|r|v|len|dx|ang)(\d+)$/.exec(id);
      if (!m) return false;
      const idx = Number(m[2]);
      const c = m[1] === 'x' ? form.pts[idx]?.x : m[1] === 'z' ? form.pts[idx]?.z : m[1] === 'r' ? form.pts[idx]?.r : form.segs[idx]?.[m[1] as 'v' | 'len' | 'dx' | 'ang'];
      return !!c?.bad;
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
    const keep = { unit: form.unit, side: form.side, dxMode: form.dxMode, angRef: form.angRef };
    form = { ...initial(keep.unit), side: keep.side, dxMode: keep.dxMode, angRef: keep.angRef };
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
