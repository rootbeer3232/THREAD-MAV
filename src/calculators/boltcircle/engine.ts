/**
 * Bolt circle: hole positions around a circle.
 *   x = cx + R·cos(θ),  y = cy + R·sin(θ),  θ = start ± i·360/N   (angles from +X, CCW positive)
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

export interface BoltCircleInput {
  unit: Unit;
  /** Bolt circle DIAMETER. */
  diameter: number;
  holes: number;
  /** Angle of hole #1 from the +X axis, degrees (CCW positive). */
  startDeg: number;
  clockwise: boolean;
  centerX: number;
  centerY: number;
}

export interface HolePosition {
  index: number;
  /** Angle from +X axis, normalised to 0 ≤ a < 360. */
  angleDeg: number;
  x: number;
  y: number;
}

export interface BoltCircleResult {
  unit: Unit;
  diameter: number;
  radius: number;
  holes: HolePosition[];
  stepDeg: number;
  /** Straight-line distance between adjacent holes. */
  chord: number;
  input: BoltCircleInput;
}

/** Clean binary noise like 6.1e-17 so a hole on an axis reads exactly 0. */
const clean = (v: number, scale: number) => (Math.abs(v) < 1e-12 * Math.max(1, scale) ? 0 : v);

export function solveBoltCircle(i: BoltCircleInput): Result<BoltCircleResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.diameter) || i.diameter <= 0) issues.push({ field: 'dia', message: 'Bolt circle diameter must be greater than zero.' });
  if (!Number.isInteger(i.holes) || i.holes < 1) issues.push({ field: 'holes', message: 'Number of holes must be a whole number of 1 or more.' });
  else if (i.holes > 360) issues.push({ field: 'holes', message: 'That many holes (over 360) isn’t supported here.' });
  if (!Number.isFinite(i.startDeg)) issues.push({ field: 'start', message: 'Starting angle isn’t a valid number.' });
  if (!Number.isFinite(i.centerX)) issues.push({ field: 'cx', message: 'Center X isn’t a valid number.' });
  if (!Number.isFinite(i.centerY)) issues.push({ field: 'cy', message: 'Center Y isn’t a valid number.' });
  if (issues.length) return failMany(issues);

  const R = i.diameter / 2;
  const step = 360 / i.holes;
  const dir = i.clockwise ? -1 : 1;
  const scale = Math.max(R, Math.abs(i.centerX), Math.abs(i.centerY));
  const holes: HolePosition[] = [];
  for (let k = 0; k < i.holes; k++) {
    const a = i.startDeg + dir * k * step;
    const rad = (a * Math.PI) / 180;
    const norm = ((a % 360) + 360) % 360;
    holes.push({
      index: k + 1,
      angleDeg: clean(norm, 360) === 0 || Math.abs(norm - 360) < 1e-9 ? 0 : norm,
      x: clean(i.centerX + R * Math.cos(rad), scale),
      y: clean(i.centerY + R * Math.sin(rad), scale),
    });
  }
  return ok({
    unit: i.unit,
    diameter: i.diameter,
    radius: R,
    holes,
    stepDeg: step,
    chord: i.holes === 1 ? 0 : 2 * R * Math.sin(Math.PI / i.holes),
    input: i,
  });
}
