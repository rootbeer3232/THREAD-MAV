/**
 * Countersink and counterbore geometry (kept separate on purpose).
 *
 * Countersink (cone): with included angle α, diameter D at the surface, hole diameter d:
 *     D = d + 2·h·tan(α/2)      h = (D − d) / (2·tan(α/2))
 * h is the cone depth from the surface down to the hole diameter.
 * Depth to the cone's point (a full cone of diameter D) = D / (2·tan(α/2)).
 *
 * Counterbore (flat-bottom step): pure arithmetic on head size and clearances.
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

export type CskUnknown = 'depth' | 'dia' | 'hole';

export interface CountersinkInput {
  unit: Unit;
  includedAngleDeg: number;
  solveFor: CskUnknown;
  /** Countersink diameter at the surface (needed unless solving for it). */
  csDia: number | null;
  /** Hole diameter the cone runs into (needed unless solving for it). */
  holeDia: number | null;
  /** Cone depth (needed unless solving for it). */
  depth: number | null;
}

export interface CountersinkResult {
  unit: Unit;
  includedAngleDeg: number;
  halfAngleDeg: number;
  csDia: number;
  holeDia: number;
  depth: number;
  /** Depth from the surface to the point of a full cone of diameter csDia. */
  depthToPoint: number;
  solvedFor: CskUnknown;
}

const pos = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function solveCountersink(i: CountersinkInput): Result<CountersinkResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.includedAngleDeg) || i.includedAngleDeg <= 0 || i.includedAngleDeg >= 180) {
    issues.push({ field: 'angle', message: 'The included angle must be between 0° and 180° (common: 82°, 90°, 100°, 120°).' });
  }
  const need = (v: number | null, field: string, label: string) => {
    if (v === null) issues.push({ field, message: `Enter ${label}.` });
    else if (!pos(v)) issues.push({ field, message: `${label[0]!.toUpperCase()}${label.slice(1)} must be greater than zero.` });
  };
  if (i.solveFor !== 'dia') need(i.csDia, 'csDia', 'the countersink diameter');
  if (i.solveFor !== 'hole') need(i.holeDia, 'hole', 'the hole diameter');
  if (i.solveFor !== 'depth') need(i.depth, 'depth', 'the countersink depth');
  if (issues.length) return failMany(issues);

  const t = Math.tan((i.includedAngleDeg * Math.PI) / 360); // tan(α/2)
  let D = i.csDia ?? 0;
  let d = i.holeDia ?? 0;
  let h = i.depth ?? 0;
  if (i.solveFor === 'depth') {
    if (D <= d) return fail('The countersink diameter must be larger than the hole diameter — otherwise there is no cone to cut.', 'csDia');
    h = (D - d) / (2 * t);
  } else if (i.solveFor === 'dia') {
    D = d + 2 * h * t;
  } else {
    d = D - 2 * h * t;
    if (d <= 0) {
      return fail(`Impossible geometry: at this depth the cone reaches its point before it gets down to a hole. The deepest a ${i.includedAngleDeg}° countersink of that diameter can go is ${(D / (2 * t)).toFixed(4)} (to its point).`, 'depth');
    }
  }
  if (![D, d, h].every((n) => Number.isFinite(n) && n > 0)) return fail('Those values give an impossible countersink. Check the entries.');
  return ok({
    unit: i.unit,
    includedAngleDeg: i.includedAngleDeg,
    halfAngleDeg: i.includedAngleDeg / 2,
    csDia: D,
    holeDia: d,
    depth: h,
    depthToPoint: D / (2 * t),
    solvedFor: i.solveFor,
  });
}

export interface CounterboreInput {
  unit: Unit;
  headDia: number;
  headHeight: number;
  /** Extra diameter added to the head diameter (total, not per side). Default 0. */
  diaClearance: number;
  /** Extra depth added to the head height. Default 0. */
  depthClearance: number;
  /** Through-hole diameter (optional). */
  holeDia: number | null;
  /** Part thickness (optional). */
  thickness: number | null;
}

export interface CounterboreResult {
  unit: Unit;
  cbDia: number;
  cbDepth: number;
  /** (cbDia − holeDia)/2: ledge width the head sits on. */
  ledge: number | null;
  /** thickness − cbDepth: material left under the counterbore. */
  floor: number | null;
  holeDia: number | null;
  thickness: number | null;
}

export function solveCounterbore(i: CounterboreInput): Result<CounterboreResult> {
  const issues: CalcIssue[] = [];
  if (!pos(i.headDia)) issues.push({ field: 'headDia', message: 'Head diameter must be greater than zero.' });
  if (!pos(i.headHeight)) issues.push({ field: 'headHeight', message: 'Head height must be greater than zero.' });
  if (!Number.isFinite(i.diaClearance) || i.diaClearance < 0) issues.push({ field: 'diaClr', message: 'Diameter clearance can’t be negative.' });
  if (!Number.isFinite(i.depthClearance) || i.depthClearance < 0) issues.push({ field: 'depthClr', message: 'Depth clearance can’t be negative.' });
  if (i.holeDia !== null && !pos(i.holeDia)) issues.push({ field: 'hole', message: 'Hole diameter must be greater than zero.' });
  if (i.thickness !== null && !pos(i.thickness)) issues.push({ field: 'thick', message: 'Part thickness must be greater than zero.' });
  if (issues.length) return failMany(issues);

  const cbDia = i.headDia + i.diaClearance;
  const cbDepth = i.headHeight + i.depthClearance;
  if (i.holeDia !== null && i.holeDia >= cbDia) {
    return fail('The through-hole is as large as the counterbore — there would be no ledge for the head to sit on.', 'hole');
  }
  if (i.thickness !== null && cbDepth >= i.thickness) {
    return fail('Impossible geometry: the counterbore is as deep as (or deeper than) the part is thick.', 'thick');
  }
  return ok({
    unit: i.unit,
    cbDia,
    cbDepth,
    ledge: i.holeDia !== null ? (cbDia - i.holeDia) / 2 : null,
    floor: i.thickness !== null ? i.thickness - cbDepth : null,
    holeDia: i.holeDia,
    thickness: i.thickness,
  });
}
