/**
 * Thread depth and compound infeed schedule (60° threads).
 *   Radial thread depth K: external 17H/24 = 0.613435·P, internal 5H/8 = 0.541266·P (H = 0.866025·P)  — see ../thread/geometry.ts
 *   Constant-area passes (the rule behind Haas G76): cumulative depth after pass n = K·√(n/N), so the first pass is the deepest
 *   single cut is shallowest: first-pass depth D = K/√N and cumulative depth_n = D·√n.
 *   Compound infeed at angle θ off the cross-slide direction: slide travel = depth / cosθ, Z shift per side = depth · tanθ.
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';
import { basicThreadDepth, isoExternalThreadDepth } from '../thread/geometry';

export interface ThreadDepthInput {
  unit: Unit;
  /** Pitch in the working unit (inch pitch = 1/TPI). */
  pitch: number;
  external: boolean;
  /** Stock OD (external) or bore diameter before threading (internal). Optional. */
  startDiameter: number | null;
  /** Total radial depth override; null = basic depth for the thread type. */
  depthOverride: number | null;
  /** Give EITHER the number of passes OR the first-pass depth. */
  passes: number | null;
  firstDepth: number | null;
  /** Compound angle off the cross-slide direction, degrees (29–30° typical). */
  angleDeg: number;
}

export interface InfeedPass {
  n: number;
  /** Radial depth of this pass. */
  cut: number;
  /** Cumulative radial depth. */
  depth: number;
  /** X diameter after this pass (null if no start diameter). */
  x: number | null;
  /** Cumulative compound-slide travel from touch-off. */
  compound: number;
  /** Cumulative Z shift from touch-off, per side the tool is fed along. */
  zShift: number;
}

export interface ThreadDepthResult {
  unit: Unit;
  external: boolean;
  totalDepth: number;
  diaChange: number;
  passes: InfeedPass[];
  firstPass: number;
  finalX: number | null;
  /** Passes were derived from the first-pass depth, so the real first pass differs from what was typed. */
  derivedFromFirst: boolean;
  input: ThreadDepthInput;
}

export function solveThreadDepth(i: ThreadDepthInput): Result<ThreadDepthResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.pitch) || i.pitch <= 0) issues.push({ field: 'pitch', message: 'Pitch must be greater than zero.' });
  if (i.startDiameter !== null && (!Number.isFinite(i.startDiameter) || i.startDiameter <= 0)) issues.push({ field: 'dia', message: 'Diameter must be greater than zero.' });
  if (i.depthOverride !== null && (!Number.isFinite(i.depthOverride) || i.depthOverride <= 0)) issues.push({ field: 'depth', message: 'Thread depth must be greater than zero.' });
  if (!Number.isFinite(i.angleDeg) || i.angleDeg < 0 || i.angleDeg >= 60) issues.push({ field: 'angle', message: 'Compound angle must be from 0° up to (not including) 60°.' });
  if (i.passes === null && i.firstDepth === null) issues.push({ field: 'passes', message: 'Enter the number of passes OR the first-pass depth.' });
  else if (i.passes !== null && i.firstDepth !== null) issues.push({ field: 'first', message: 'Enter the number of passes OR the first-pass depth, not both.' });
  if (i.passes !== null && (!Number.isInteger(i.passes) || i.passes < 1 || i.passes > 99)) issues.push({ field: 'passes', message: 'Passes must be a whole number from 1 to 99.' });
  if (i.firstDepth !== null && (!Number.isFinite(i.firstDepth) || i.firstDepth <= 0)) issues.push({ field: 'first', message: 'First-pass depth must be greater than zero.' });
  if (issues.length) return failMany(issues);

  const K = i.depthOverride ?? (i.external ? isoExternalThreadDepth(i.pitch) : basicThreadDepth(i.pitch));
  let N = i.passes ?? 0;
  let derived = false;
  if (i.passes === null) {
    const first = i.firstDepth!;
    if (first >= K) N = 1;
    else N = Math.ceil((K / first) ** 2 - 1e-9);
    derived = true;
    if (N > 99) return failMany([{ field: 'first', message: 'That first-pass depth would need over 99 passes. Use a larger first pass.' }]);
  }
  const tan = Math.tan((i.angleDeg * Math.PI) / 180);
  const cos = Math.cos((i.angleDeg * Math.PI) / 180);
  const passes: InfeedPass[] = [];
  let prev = 0;
  for (let n = 1; n <= N; n++) {
    const depth = n === N ? K : K * Math.sqrt(n / N);
    passes.push({
      n,
      cut: depth - prev,
      depth,
      x: i.startDiameter === null ? null : i.external ? i.startDiameter - 2 * depth : i.startDiameter + 2 * depth,
      compound: depth / cos,
      zShift: depth * tan,
    });
    prev = depth;
  }
  return ok({
    unit: i.unit,
    external: i.external,
    totalDepth: K,
    diaChange: 2 * K,
    passes,
    firstPass: passes[0]!.cut,
    finalX: passes[N - 1]!.x,
    derivedFromFirst: derived,
    input: i,
  });
}
