/**
 * Right-triangle solver in shop terms. Right angle at the corner between RUN and RISE.
 *   θ is measured from the run (horizontal) side; rise is opposite θ; hypotenuse is the long side.
 * Provide exactly two of: rise, run, hypotenuse, θ (at least one must be a side).
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Dms, type Unit, degToDms, degToRad, radToDeg } from '../../core/units';

export interface TriangleInput {
  unit: Unit;
  rise: number | null;
  run: number | null;
  hyp: number | null;
  angleDeg: number | null;
}

export interface TriangleResult {
  unit: Unit;
  rise: number;
  run: number;
  hyp: number;
  angleDeg: number;
  angleDms: Dms;
  complementDeg: number;
  complementDms: Dms;
  /** rise per 1 unit of run = tan θ */
  slope: number;
  /** percent grade = 100 × tan θ */
  gradePercent: number;
  /** which two values were supplied */
  given: string[];
}

const has = (n: number | null): n is number => n !== null;

export function solveTriangle(i: TriangleInput): Result<TriangleResult> {
  const given: [string, number | null][] = [
    ['rise', i.rise],
    ['run', i.run],
    ['hyp', i.hyp],
    ['angle', i.angleDeg],
  ];
  const supplied = given.filter(([, v]) => has(v));
  const issues: CalcIssue[] = [];
  for (const [k, v] of supplied) {
    if (!Number.isFinite(v!)) issues.push({ field: k, message: 'That value isn’t a valid number.' });
    else if (v! <= 0) issues.push({ field: k, message: k === 'angle' ? 'The angle must be greater than 0°.' : 'Lengths must be greater than zero.' });
  }
  if (issues.length) return failMany(issues);
  if (supplied.length < 2) return fail('Enter two known values — for example rise and run, or hypotenuse and angle.');
  if (supplied.length > 2) return fail('Enter only two known values. Three or more can over-define the triangle — clear the extras.');
  if (has(i.angleDeg) && i.angleDeg >= 90) return fail('The angle must be less than 90° in a right triangle.', 'angle');

  let rise: number, run: number, hyp: number, ang: number;
  const th = i.angleDeg !== null ? degToRad(i.angleDeg) : null;

  if (has(i.rise) && has(i.run)) {
    rise = i.rise;
    run = i.run;
    hyp = Math.hypot(rise, run);
    ang = Math.atan2(rise, run);
  } else if (has(i.rise) && has(i.hyp)) {
    if (i.rise >= i.hyp) return fail('Impossible geometry: the rise must be shorter than the hypotenuse.', 'rise');
    rise = i.rise;
    hyp = i.hyp;
    run = Math.sqrt(hyp * hyp - rise * rise);
    ang = Math.asin(rise / hyp);
  } else if (has(i.run) && has(i.hyp)) {
    if (i.run >= i.hyp) return fail('Impossible geometry: the run must be shorter than the hypotenuse.', 'run');
    run = i.run;
    hyp = i.hyp;
    rise = Math.sqrt(hyp * hyp - run * run);
    ang = Math.acos(run / hyp);
  } else if (has(i.rise) && th !== null) {
    rise = i.rise;
    run = rise / Math.tan(th);
    hyp = rise / Math.sin(th);
    ang = th;
  } else if (has(i.run) && th !== null) {
    run = i.run;
    rise = run * Math.tan(th);
    hyp = run / Math.cos(th);
    ang = th;
  } else if (has(i.hyp) && th !== null) {
    hyp = i.hyp;
    rise = hyp * Math.sin(th);
    run = hyp * Math.cos(th);
    ang = th;
  } else {
    return fail('Enter at least one side length.');
  }

  const angleDeg = radToDeg(ang);
  const complementDeg = 90 - angleDeg;
  if (![rise, run, hyp, angleDeg].every((n) => Number.isFinite(n) && n > 0)) {
    return fail('Those values give an impossible or degenerate triangle. Check the entries.');
  }
  return ok({
    unit: i.unit,
    rise,
    run,
    hyp,
    angleDeg,
    angleDms: degToDms(angleDeg, 1),
    complementDeg,
    complementDms: degToDms(complementDeg, 1),
    slope: rise / run,
    gradePercent: (100 * rise) / run,
    given: supplied.map(([k]) => k),
  });
}
