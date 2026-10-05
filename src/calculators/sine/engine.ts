/**
 * Sine bar engine.
 *   Stack height = L · sin(θ)        (find stack)
 *   θ = asin(h / L)                  (find angle)
 * Lengths in `unit`; both systems are derived from the same underlying value.
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Dms, type Unit, degToDms, degToRad, dmsToDeg, radToDeg } from '../../core/units';

export const SINE_PRESET_LENGTHS_IN = [5, 10] as const;

export interface SineStackInput {
  barLength: number;
  unit: Unit;
  angleDeg: number;
}
export interface SineAngleInput {
  barLength: number;
  unit: Unit;
  stackHeight: number;
}

export interface SineResult {
  mode: 'stack' | 'angle';
  unit: Unit;
  barLength: number;
  stackHeight: number;
  angleDeg: number;
  angleDms: Dms;
  advisories: string[];
}

const WARN_ANGLE_DEG = 45;

function checkBar(L: number): CalcIssue | null {
  if (!Number.isFinite(L) || L <= 0) return { field: 'bar', message: 'Sine bar length must be greater than zero.' };
  return null;
}

function advisoriesFor(angleDeg: number): string[] {
  return angleDeg > WARN_ANGLE_DEG
    ? [`Above ${WARN_ANGLE_DEG}° a sine bar setup loses accuracy quickly — consider a different method or verify the setup carefully.`]
    : [];
}

export function solveStackHeight(i: SineStackInput): Result<SineResult> {
  const issues: CalcIssue[] = [];
  const b = checkBar(i.barLength);
  if (b) issues.push(b);
  if (!Number.isFinite(i.angleDeg)) issues.push({ field: 'angle', message: 'Enter the angle.' });
  else if (i.angleDeg < 0 || i.angleDeg > 90) {
    issues.push({ field: 'angle', message: 'Angle must be between 0° and 90° for a sine bar setup.' });
  }
  if (issues.length) return failMany(issues);
  const stack = i.barLength * Math.sin(degToRad(i.angleDeg));
  return ok({
    mode: 'stack',
    unit: i.unit,
    barLength: i.barLength,
    stackHeight: stack,
    angleDeg: i.angleDeg,
    angleDms: degToDms(i.angleDeg, 1),
    advisories: advisoriesFor(i.angleDeg),
  });
}

export function solveAngle(i: SineAngleInput): Result<SineResult> {
  const issues: CalcIssue[] = [];
  const b = checkBar(i.barLength);
  if (b) issues.push(b);
  if (!Number.isFinite(i.stackHeight) || i.stackHeight < 0) {
    issues.push({ field: 'stack', message: 'Stack height can’t be negative.' });
  }
  if (issues.length) return failMany(issues);
  const ratio = i.stackHeight / i.barLength;
  if (ratio > 1 + 1e-12) {
    return fail(
      'Impossible geometry: the stack height is taller than the sine bar length (the angle would be over 90°). Check the stack and the bar length.',
      'stack',
    );
  }
  const angle = radToDeg(Math.asin(Math.min(1, ratio)));
  return ok({
    mode: 'angle',
    unit: i.unit,
    barLength: i.barLength,
    stackHeight: i.stackHeight,
    angleDeg: angle,
    angleDms: degToDms(angle, 1),
    advisories: advisoriesFor(angle),
  });
}

export interface DmsFieldCheck {
  value: number | null;
  issues: CalcIssue[];
}

/** Validate D/M/S fields: whole degrees 0–90, minutes 0–59, seconds 0–59.99. */
export function angleFromDms(d: number, m: number, s: number): Result<number> {
  const issues: CalcIssue[] = [];
  if (![d, m, s].every(Number.isFinite)) return fail('Enter the angle in degrees, minutes and seconds.', 'angle');
  if (d < 0 || m < 0 || s < 0) issues.push({ field: 'angle', message: 'Degrees, minutes and seconds can’t be negative.' });
  if (!Number.isInteger(d)) issues.push({ field: 'angle', message: 'Degrees must be a whole number in D/M/S entry.' });
  if (!Number.isInteger(m) || m >= 60) issues.push({ field: 'angle', message: 'Minutes must be a whole number from 0 to 59.' });
  if (s >= 60) issues.push({ field: 'angle', message: 'Seconds must be less than 60.' });
  if (issues.length) return failMany(issues);
  return ok(dmsToDeg(d, m, s));
}
