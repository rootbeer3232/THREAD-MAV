/**
 * Radius / chord / sagitta (arc up to a semicircle).
 *   θ = central angle,  c = chord = 2R·sin(θ/2),  s = sagitta = R·(1 − cos(θ/2)),  arc = R·θ
 *   R = c²/(8s) + s/2
 * Provide any TWO of: radius, chord, sagitta, central angle.
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Dms, type Unit, degToDms, degToRad, radToDeg } from '../../core/units';

export interface ArcInput {
  unit: Unit;
  radius: number | null;
  chord: number | null;
  sagitta: number | null;
  angleDeg: number | null;
}

export interface ArcResult {
  unit: Unit;
  radius: number;
  diameter: number;
  chord: number;
  sagitta: number;
  angleDeg: number;
  angleDms: Dms;
  arcLength: number;
  /** Distance from the chord to the circle center: R − s. */
  centerToChord: number;
  given: ('radius' | 'chord' | 'sagitta' | 'angle')[];
}

const has = (n: number | null): n is number => n !== null;
const EPS = 1e-9;

export function solveArc(i: ArcInput): Result<ArcResult> {
  const issues: CalcIssue[] = [];
  for (const [k, v, label] of [['radius', i.radius, 'Radius'], ['chord', i.chord, 'Chord'], ['sagitta', i.sagitta, 'Sagitta'], ['angle', i.angleDeg, 'Central angle']] as const) {
    if (v !== null && (!Number.isFinite(v) || v <= 0)) issues.push({ field: k, message: `${label} must be greater than zero.` });
  }
  if (has(i.angleDeg) && Number.isFinite(i.angleDeg) && i.angleDeg > 180) issues.push({ field: 'angle', message: 'This calculator handles arcs up to a semicircle (180°).' });
  if (issues.length) return failMany(issues);
  const given = ([i.radius !== null && 'radius', i.chord !== null && 'chord', i.sagitta !== null && 'sagitta', i.angleDeg !== null && 'angle'].filter(Boolean) as ArcResult['given']);
  if (given.length < 2) return fail('Enter any TWO known values — for example radius and chord, or chord and sagitta.');
  if (given.length > 2) return fail('Enter only TWO known values — clear the extras and calculate again.');

  let R: number, c: number, s: number, th: number; // th in radians

  if (has(i.radius) && has(i.chord)) {
    if (i.chord > 2 * i.radius + EPS) return fail('Impossible geometry: the chord can’t be longer than the diameter (2 × radius).', 'chord');
    R = i.radius;
    c = Math.min(i.chord, 2 * R);
    th = 2 * Math.asin(c / (2 * R));
    s = R * (1 - Math.cos(th / 2));
  } else if (has(i.radius) && has(i.sagitta)) {
    if (i.sagitta > i.radius + EPS) return fail('Impossible geometry for an arc up to a semicircle: the sagitta can’t be more than the radius.', 'sagitta');
    R = i.radius;
    s = Math.min(i.sagitta, R);
    th = 2 * Math.acos(1 - s / R);
    c = 2 * R * Math.sin(th / 2);
  } else if (has(i.chord) && has(i.sagitta)) {
    if (i.sagitta > i.chord / 2 + EPS) return fail('Impossible geometry for an arc up to a semicircle: the sagitta can’t be more than half the chord. Check which value is which.', 'sagitta');
    c = i.chord;
    s = Math.min(i.sagitta, c / 2);
    R = (c * c) / (8 * s) + s / 2;
    th = 2 * Math.asin(Math.min(1, c / (2 * R)));
  } else if (has(i.radius) && has(i.angleDeg)) {
    R = i.radius;
    th = degToRad(i.angleDeg);
    c = 2 * R * Math.sin(th / 2);
    s = R * (1 - Math.cos(th / 2));
  } else if (has(i.chord) && has(i.angleDeg)) {
    c = i.chord;
    th = degToRad(i.angleDeg);
    R = c / (2 * Math.sin(th / 2));
    s = R * (1 - Math.cos(th / 2));
  } else {
    s = i.sagitta!;
    th = degToRad(i.angleDeg!);
    R = s / (1 - Math.cos(th / 2));
    c = 2 * R * Math.sin(th / 2);
  }
  const angleDeg = radToDeg(th);
  if (![R, c, s, angleDeg].every((n) => Number.isFinite(n) && n > 0)) return fail('Those values give an impossible arc. Check the entries.');
  return ok({
    unit: i.unit,
    radius: R,
    diameter: 2 * R,
    chord: c,
    sagitta: s,
    angleDeg,
    angleDms: degToDms(angleDeg, 1),
    arcLength: R * th,
    centerToChord: R - s,
    given,
  });
}
