/**
 * Ball / pin measurement helpers. All lengths in one unit; angles in degrees.
 *
 * DOVETAIL over / between two pins (α = angle between the base and the flank, 60° typical; d = pin diameter):
 *   pin center sits r·cot(α/2) from the sharp corner along the base, so
 *   male (tongue)  — over pins:    M = a + d·(1 + cot(α/2)),  a = width across the base corners
 *   female (slot)  — between pins: M = b − d·(1 + cot(α/2)),  b = width across the base corners
 *
 * BALL / PIN in a V or COUNTERSINK (included angle 2β, ball radius r, opening W at the surface):
 *   ball center sits r/sinβ above the apex; apex is (W/2)/tanβ below the surface, so
 *   height of the ball top above the surface  h = r + r/sinβ − (W/2)/tanβ   (negative = below the surface)
 *   opening from a measured height            W = 2·tanβ·(r + r/sinβ − h)
 *   the ball only seats on the cone/flanks if its contact radius r·cosβ ≤ W/2.
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

const rad = (deg: number) => (deg * Math.PI) / 180;

export interface DovetailInput {
  unit: Unit;
  kind: 'male' | 'female';
  angleDeg: number;
  pin: number;
  /** Width across the sharp base corners (give this OR the measurement). */
  width: number | null;
  /** Measured over / between pins. */
  measurement: number | null;
}
export interface DovetailResult {
  unit: Unit;
  kind: 'male' | 'female';
  width: number;
  measurement: number;
  /** d·(1 + cot(α/2)) — what the pins add (male) or take away (female). */
  pinAllowance: number;
  solved: 'measurement' | 'width';
  input: DovetailInput;
}

export function solveDovetail(i: DovetailInput): Result<DovetailResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.angleDeg) || i.angleDeg <= 0 || i.angleDeg >= 90)
    issues.push({
      field: 'angle',
      message: 'Dovetail angle must be between 0° and 90° (60° is common).',
    });
  if (!Number.isFinite(i.pin) || i.pin <= 0)
    issues.push({
      field: 'pin',
      message: 'Pin diameter must be greater than zero.',
    });
  if ((i.width === null) === (i.measurement === null))
    issues.push({
      field: 'width',
      message: 'Enter the width at the corners OR the pin measurement — one of them.',
    });
  if (i.width !== null && (!Number.isFinite(i.width) || i.width <= 0))
    issues.push({
      field: 'width',
      message: 'Width must be greater than zero.',
    });
  if (i.measurement !== null && (!Number.isFinite(i.measurement) || i.measurement <= 0))
    issues.push({
      field: 'meas',
      message: 'Measurement must be greater than zero.',
    });
  if (issues.length) return failMany(issues);
  const allow = i.pin * (1 + 1 / Math.tan(rad(i.angleDeg) / 2));
  const sign = i.kind === 'male' ? 1 : -1;
  const width = i.width ?? i.measurement! - sign * allow;
  const measurement = i.measurement ?? i.width! + sign * allow;
  if (width <= 0)
    return failMany([
      {
        field: 'meas',
        message: 'That measurement gives a width of zero or less — check the pin size and the reading.',
      },
    ]);
  if (measurement <= 0)
    return failMany([
      {
        field: 'pin',
        message: 'The pins are too big for that slot — they would overlap. Use smaller pins.',
      },
    ]);
  return ok({
    unit: i.unit,
    kind: i.kind,
    width,
    measurement,
    pinAllowance: allow,
    solved: i.measurement === null ? 'measurement' : 'width',
    input: i,
  });
}

export interface VBallInput {
  unit: Unit;
  includedDeg: number;
  ball: number;
  /** Opening (countersink diameter or V width at the surface) — give this OR the height. */
  opening: number | null;
  /** Height of the ball top above the surface (negative = below). */
  height: number | null;
}
export interface VBallResult {
  unit: Unit;
  opening: number;
  height: number;
  /** Height of the ball center above the apex. */
  centerAboveApex: number;
  /** Depth of the sharp apex below the surface. */
  apexDepth: number;
  /** Ball sits on the flanks (true) or would ride on the top edge (false → numbers not valid). */
  seats: boolean;
  solved: 'opening' | 'height';
  input: VBallInput;
}

export function solveVBall(i: VBallInput): Result<VBallResult> {
  const issues: CalcIssue[] = [];
  if (!Number.isFinite(i.includedDeg) || i.includedDeg <= 0 || i.includedDeg >= 180)
    issues.push({
      field: 'incl',
      message: 'Included angle must be between 0° and 180° (82°, 90°, 100° for countersinks).',
    });
  if (!Number.isFinite(i.ball) || i.ball <= 0)
    issues.push({
      field: 'ball',
      message: 'Ball / pin diameter must be greater than zero.',
    });
  if ((i.opening === null) === (i.height === null))
    issues.push({
      field: 'open',
      message: 'Enter the opening OR the measured height — one of them.',
    });
  if (i.opening !== null && (!Number.isFinite(i.opening) || i.opening <= 0))
    issues.push({
      field: 'open',
      message: 'Opening must be greater than zero.',
    });
  if (i.height !== null && !Number.isFinite(i.height)) issues.push({ field: 'height', message: 'Height isn’t a valid number.' });
  if (issues.length) return failMany(issues);
  const b = rad(i.includedDeg / 2);
  const r = i.ball / 2;
  const centerAboveApex = r / Math.sin(b);
  const opening = i.opening ?? 2 * Math.tan(b) * (r + centerAboveApex - i.height!);
  if (opening <= 0)
    return failMany([
      {
        field: 'height',
        message: 'That height puts the ball below the bottom of the V — check the reading.',
      },
    ]);
  const apexDepth = opening / 2 / Math.tan(b);
  const height = i.height ?? r + centerAboveApex - apexDepth;
  const seats = r * Math.cos(b) <= opening / 2 + 1e-12;
  return ok({
    unit: i.unit,
    opening,
    height,
    centerAboveApex,
    apexDepth,
    seats,
    solved: i.opening === null ? 'opening' : 'height',
    input: i,
  });
}
