/**
 * Drill point depth.
 *   point depth (cone length) = (D/2) / tan(α/2)       α = included point angle
 * Total depth to program for a hole that must be full diameter to depth `holeDepth`:
 *   drill depth = holeDepth + point depth
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

export interface DrillPointInput {
  unit: Unit;
  diameter: number;
  includedAngleDeg: number;
  /** Optional: depth the hole must be full diameter (or part thickness for a through hole). */
  holeDepth: number | null;
}

export interface DrillPointResult {
  unit: Unit;
  diameter: number;
  includedAngleDeg: number;
  halfAngleDeg: number;
  pointDepth: number;
  holeDepth: number | null;
  totalDepth: number | null;
}

export function solveDrillPoint(i: DrillPointInput): Result<DrillPointResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.diameter) || i.diameter <= 0) issues.push({ field: 'dia', message: 'Drill diameter must be greater than zero.' });
  if (!Number.isFinite(i.includedAngleDeg) || i.includedAngleDeg <= 0 || i.includedAngleDeg >= 180) {
    issues.push({ field: 'angle', message: 'The point angle must be between 0° and 180° (common: 118°, 135°, 140°).' });
  }
  if (i.holeDepth !== null && (!Number.isFinite(i.holeDepth) || i.holeDepth <= 0)) issues.push({ field: 'depth', message: 'Hole depth must be greater than zero.' });
  if (issues.length) return failMany(issues);
  const pointDepth = i.diameter / 2 / Math.tan((i.includedAngleDeg * Math.PI) / 360);
  return ok({
    unit: i.unit,
    diameter: i.diameter,
    includedAngleDeg: i.includedAngleDeg,
    halfAngleDeg: i.includedAngleDeg / 2,
    pointDepth,
    holeDepth: i.holeDepth,
    totalDepth: i.holeDepth === null ? null : i.holeDepth + pointDepth,
  });
}
