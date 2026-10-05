/** Thread chart rows: every value is computed from 60° geometry (no tolerance data). */
import { MM_PER_INCH } from '../../core/units';
import { COARSE_METRIC, FINE_METRIC_PITCHES } from '../thread/metric';
import { UNIFIED_SIZES } from '../thread/unified';
import { basicMinorDiameter, basicPitchDiameter, basicThreadDepth, sharpVHeight } from '../thread/geometry';
import { bestWire } from '../thread/wire';
import { INCH_DRILLS, METRIC_DRILLS, type TapDrillSet, tapDrillSet } from './drills';

export interface ChartRow {
  id: string;
  system: 'unified' | 'metric';
  designation: string;
  /** Unified: UNC/UNF/UNEF. Metric: coarse/fine. */
  series: string;
  sizeLabel: string;
  /** Unified: TPI. Metric: pitch mm. */
  pitchOrTpi: number;
  /** inch for unified, mm for metric */
  unit: 'in' | 'mm';
  major: number;
  pitch: number;
  tpi: number;
  basicPD: number;
  basicMinor: number;
  depth: number;
  H: number;
  bestWire: number;
  /** tap drill set computed in inches (drill sizes are converted for display) */
  tapDrills: TapDrillSet | null;
}

function build(system: 'unified' | 'metric', designation: string, series: string, sizeLabel: string, pitchOrTpi: number, major: number): ChartRow {
  const unit = system === 'unified' ? 'in' : 'mm';
  const pitch = system === 'unified' ? 1 / pitchOrTpi : pitchOrTpi;
  const tpi = system === 'unified' ? pitchOrTpi : MM_PER_INCH / pitchOrTpi;
  const majorIn = unit === 'in' ? major : major / MM_PER_INCH;
  const pitchIn = unit === 'in' ? pitch : pitch / MM_PER_INCH;
  return {
    id: `${system}:${designation}`,
    system,
    designation,
    series,
    sizeLabel,
    pitchOrTpi,
    unit,
    major,
    pitch,
    tpi,
    basicPD: basicPitchDiameter(major, pitch),
    basicMinor: basicMinorDiameter(major, pitch),
    depth: basicThreadDepth(pitch),
    H: sharpVHeight(pitch),
    bestWire: bestWire(pitch),
    // metric threads: prefer metric drills; unified: fractional / number / letter
    tapDrills: tapDrillSet(majorIn, pitchIn, system === 'unified' ? INCH_DRILLS : METRIC_DRILLS),
  };
}

const trim = (n: number) => String(Number(n.toFixed(4)));

export const UNIFIED_ROWS: ChartRow[] = UNIFIED_SIZES.flatMap((s) =>
  s.pitches.map((p) => build('unified', `${s.label}-${p.tpi} ${p.series}`, p.series, s.label, p.tpi, s.major)),
);

export const METRIC_ROWS: ChartRow[] = (() => {
  const rows: ChartRow[] = [];
  for (const m of COARSE_METRIC) {
    rows.push(build('metric', `M${trim(m.d)} × ${trim(m.pitch)}`, 'coarse', `M${trim(m.d)}`, m.pitch, m.d));
    for (const p of FINE_METRIC_PITCHES[String(m.d)] ?? []) {
      if (p !== m.pitch) rows.push(build('metric', `M${trim(m.d)} × ${trim(p)}`, 'fine', `M${trim(m.d)}`, p, m.d));
    }
  }
  return rows;
})();
