/** Drill chart engine: series lists, nearest-size search, tap drill and percent thread. Pure. */
import { LETTER_DRILLS, NUMBER_DRILLS } from '../../data/drills';
import { MM_PER_INCH } from '../../core/units';

export type DrillSeries = 'fraction' | 'number' | 'letter' | 'metric';

export interface Drill {
  series: DrillSeries;
  name: string;
  inch: number;
  mm: number;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/** n/64 reduced, mixed numbers above 1": 72/64 -> "1-1/8" */
export function fractionName(n64: number): string {
  const whole = Math.floor(n64 / 64);
  const rem = n64 % 64;
  if (rem === 0) return String(whole);
  const g = gcd(rem, 64);
  const frac = `${rem / g}/${64 / g}`;
  return whole ? `${whole}-${frac}` : frac;
}

const inchDrill = (series: DrillSeries, name: string, inch: number): Drill => ({ series, name, inch, mm: inch * MM_PER_INCH });

export const FRACTION_DRILLS: Drill[] = Array.from({ length: 96 }, (_, i) => inchDrill('fraction', fractionName(i + 1), (i + 1) / 64));
export const NUMBER_DRILL_LIST: Drill[] = NUMBER_DRILLS.map(([n, d]) => inchDrill('number', `#${n}`, d));
export const LETTER_DRILL_LIST: Drill[] = LETTER_DRILLS.map(([l, d]) => inchDrill('letter', l, d));

/** Metric drills: 0.5–1.0 by 0.05, 1.0–14 by 0.1, 14.5–25 by 0.5 (exact mm values). */
export const METRIC_DRILLS: Drill[] = (() => {
  const mm: number[] = [];
  for (let i = 10; i < 20; i++) mm.push(i / 20); // 0.50 … 0.95
  for (let i = 10; i <= 140; i++) mm.push(i / 10); // 1.0 … 14.0
  for (let i = 29; i <= 50; i++) mm.push(i / 2); // 14.5 … 25.0
  return mm.map((v) => ({ series: 'metric' as const, name: `${v} mm`, inch: v / MM_PER_INCH, mm: v }));
})();

export const ALL_DRILLS: Drill[] = [...FRACTION_DRILLS, ...NUMBER_DRILL_LIST, ...LETTER_DRILL_LIST, ...METRIC_DRILLS].sort((a, b) => a.inch - b.inch);

export const INCH_DRILLS: Drill[] = ALL_DRILLS.filter((d) => d.series !== 'metric');

export function drillsFor(series: DrillSeries): Drill[] {
  return ALL_DRILLS.filter((d) => d.series === series);
}

export interface NearHit {
  drill: Drill;
  /** drill − target, in inches */
  diffInch: number;
  diffMm: number;
}

/** Closest drills to a target size (inch). */
export function nearestDrills(targetInch: number, count = 8, pool: Drill[] = ALL_DRILLS): NearHit[] {
  return pool
    .map((drill) => ({ drill, diffInch: drill.inch - targetInch, diffMm: (drill.inch - targetInch) * MM_PER_INCH }))
    .sort((a, b) => Math.abs(a.diffInch) - Math.abs(b.diffInch) || a.drill.inch - b.drill.inch)
    .slice(0, count);
}

/** 100% thread = D − 1.299038·P (two basic thread heights of 0.649519·P). */
export const FULL_THREAD_FACTOR = 1.5 * (Math.sqrt(3) / 2); // 1.299038…

/** Percent of full thread produced by a tap drill. Same units for all three. */
export function percentThread(major: number, pitch: number, drillDia: number): number {
  return ((major - drillDia) / (FULL_THREAD_FACTOR * pitch)) * 100;
}

/** Drill diameter that yields a given percent thread. */
export function drillForPercent(major: number, pitch: number, percent: number): number {
  return major - (FULL_THREAD_FACTOR * pitch * percent) / 100;
}

export interface TapDrillChoice {
  drill: Drill;
  percent: number;
}

export interface TapDrillSet {
  /** closest to the target percent */
  best: TapDrillChoice;
  /** next smaller drill (more thread, harder tapping), if any in range */
  tight: TapDrillChoice | null;
  /** next larger drill (less thread, easier tapping), if any in range */
  loose: TapDrillChoice | null;
}

/**
 * Pick the tap drill nearest the target percent (default 75%) from `pool`, plus the
 * neighbours either side. Geometry only — this is not a published tap-drill table.
 * `major`/`pitch` in inches.
 */
export function tapDrillSet(majorInch: number, pitchInch: number, pool: Drill[], targetPercent = 75): TapDrillSet | null {
  const sorted = [...pool].sort((a, b) => a.inch - b.inch);
  if (!sorted.length) return null;
  const withPct = sorted.map((drill) => ({ drill, percent: percentThread(majorInch, pitchInch, drill.inch) }));
  const usable = withPct.filter((c) => c.percent >= 40 && c.percent <= 100);
  if (!usable.length) return null;
  const best = usable.reduce((a, b) => (Math.abs(b.percent - targetPercent) < Math.abs(a.percent - targetPercent) ? b : a));
  const idx = withPct.indexOf(best);
  const smaller = withPct[idx - 1];
  const larger = withPct[idx + 1];
  return {
    best,
    tight: smaller && smaller.percent <= 100 ? smaller : null,
    loose: larger && larger.percent >= 40 ? larger : null,
  };
}
