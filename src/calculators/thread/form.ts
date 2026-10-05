/** Thread form state (strings as typed) -> validated engine inputs, with field-level plain-language errors. */
import { type CalcIssue, type Result, failMany, ok, parseDecimal } from '../../core/numeric';
import type { Settings } from '../../core/settings-model';
import { MM_PER_INCH, type Unit } from '../../core/units';
import type { ThreadInputs, ThreadSystem } from './engine';
import { findUnifiedSizeByMajor, seriesFor } from './unified';

export interface ThreadForm {
  system: ThreadSystem;
  /** Only meaningful for custom; unified is always inch, metric always mm. */
  unit: Unit;
  /** Unified size picker value: a size label, 'other', or ''. */
  sizeLabel: string;
  majorText: string;
  /** TPI (unified), pitch in mm (metric), per `pitchMode` for custom. */
  pitchText: string;
  pitchMode: 'tpi' | 'pitch';
  external: boolean;
  classLabel: string;
  wireText: string;
  targetPdText: string;
  limitMinText: string;
  limitMaxText: string;
  measuredText: string;
}

export function defaultForm(system: ThreadSystem, s: Settings): ThreadForm {
  return {
    system,
    unit: system === 'metric' ? 'mm' : system === 'unified' ? 'in' : s.defaultUnit,
    sizeLabel: '',
    majorText: '',
    pitchText: '',
    pitchMode: system === 'unified' ? 'tpi' : system === 'metric' ? 'pitch' : s.defaultUnit === 'in' ? 'tpi' : 'pitch',
    external: true,
    classLabel: defaultClassLabel(system, true, s),
    wireText: '',
    targetPdText: '',
    limitMinText: '',
    limitMaxText: '',
    measuredText: '',
  };
}

export function defaultClassLabel(system: ThreadSystem, external: boolean, s: Settings): string {
  if (system === 'unified') return `${s.defaultUnifiedClass}${external ? 'A' : 'B'}`;
  if (system === 'metric') return external ? s.defaultMetricExternal : s.defaultMetricInternal;
  return '';
}

export function formUnit(f: ThreadForm): Unit {
  return f.system === 'unified' ? 'in' : f.system === 'metric' ? 'mm' : f.unit;
}

function num(
  text: string,
  field: string,
  label: string,
  issues: CalcIssue[],
  required: boolean,
): number | null {
  const v = parseDecimal(text);
  if (v === null) {
    if (required) issues.push({ field, message: `Enter ${label}.` });
    return null;
  }
  if (Number.isNaN(v)) {
    issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} isn't a valid number.` });
    return null;
  }
  if (v <= 0) {
    issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} must be greater than zero.` });
    return null;
  }
  return v;
}

function trimNum(n: number, dp = 4): string {
  return String(Number(n.toFixed(dp)));
}

export function buildThreadInputs(f: ThreadForm): Result<ThreadInputs> {
  const issues: CalcIssue[] = [];
  const unit = formUnit(f);

  const major = num(f.majorText, 'major', f.system === 'metric' ? 'the nominal diameter' : 'the major diameter', issues, true);
  const rawPitch = num(
    f.pitchText,
    'pitch',
    f.pitchMode === 'tpi' ? 'the TPI' : 'the pitch',
    issues,
    true,
  );

  let pitch: number | null = null;
  let tpi: number | null = null;
  if (rawPitch !== null) {
    if (f.pitchMode === 'tpi') {
      tpi = rawPitch;
      pitch = unit === 'in' ? 1 / rawPitch : MM_PER_INCH / rawPitch;
    } else {
      pitch = rawPitch;
    }
  }

  const wire = num(f.wireText, 'wire', 'the wire diameter', issues, false);
  const targetPd = f.system === 'custom' ? num(f.targetPdText, 'targetPd', 'the target pitch diameter', issues, false) : null;
  const measured = f.external ? num(f.measuredText, 'measured', 'the measured over-wires value', issues, false) : null;

  const lo = num(f.limitMinText, 'limitMin', 'the minimum pitch diameter', issues, false);
  const hi = num(f.limitMaxText, 'limitMax', 'the maximum pitch diameter', issues, false);
  let manualLimits: ThreadInputs['manualLimits'] = null;
  if ((lo === null) !== (hi === null) && !issues.some((i) => i.field === 'limitMin' || i.field === 'limitMax')) {
    issues.push({
      field: lo === null ? 'limitMin' : 'limitMax',
      message: 'Manual limits need both a minimum and a maximum pitch diameter (or leave both blank).',
    });
  } else if (lo !== null && hi !== null) {
    manualLimits = { pdMin: lo, pdMax: hi };
  }

  if (issues.length || major === null || pitch === null) return failMany(issues);

  return ok({
    system: f.system,
    unit,
    designation: designationFor(f, major, pitch, tpi),
    majorDia: major,
    pitch,
    external: f.external,
    classLabel: f.system === 'custom' ? '' : f.classLabel,
    actualWire: wire,
    targetPitchDia: targetPd,
    manualLimits,
    measuredOverWires: measured,
  });
}

export function designationFor(f: ThreadForm, major: number, pitch: number, tpi: number | null): string {
  if (f.system === 'metric') return `M${trimNum(major, 3)} × ${trimNum(pitch, 4)}`;
  if (f.system === 'unified') {
    const size = findUnifiedSizeByMajor(major);
    const label = size?.label ?? `${trimNum(major, 4)}`;
    const t = tpi ?? 1 / pitch;
    const series = size ? seriesFor(size.label, t) : undefined;
    return `${label}-${trimNum(t, 3)}${series ? ' ' + series : ''}`;
  }
  const dia = `${trimNum(major, 4)} ${f.unit}`;
  return f.pitchMode === 'tpi' && tpi !== null
    ? `Custom ${dia} × ${trimNum(tpi, 3)} TPI`
    : `Custom ${dia} × ${trimNum(pitch, 4)} ${f.unit} pitch`;
}
