/**
 * Chamfer on a turned edge, in shop terms. Looking at a half-section of the part:
 *   axial length  = how far the chamfer runs along the axis (Z)
 *   radial width  = how far it cuts in from the surface, per side (X per side = half the diameter change)
 *   face length   = the slanted chamfer face
 *   angle         = measured from the axis (centerline) or from the end face — you choose
 * Any two of these four determine the rest (it is a right triangle).
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Dms, type Unit, degToDms } from '../../core/units';
import { solveTriangle } from '../triangle/engine';

export type AngleRef = 'axis' | 'face';

export interface ChamferInput {
  unit: Unit;
  axial: number | null;
  radial: number | null;
  face: number | null;
  angleDeg: number | null;
  angleRef: AngleRef;
  /** Optional part diameter at the chamfered edge, for end-face diameter. */
  partDia: number | null;
  side: 'external' | 'internal';
}

export interface ChamferResult {
  unit: Unit;
  axial: number;
  radial: number;
  diameterChange: number;
  face: number;
  angleFromAxis: number;
  angleFromAxisDms: Dms;
  angleFromFace: number;
  angleFromFaceDms: Dms;
  /** Cone included angle = 2 × angle from axis. */
  includedDeg: number;
  partDia: number | null;
  endFaceDia: number | null;
  side: 'external' | 'internal';
  given: ('axial' | 'radial' | 'face' | 'angle')[];
}

const has = (n: number | null): n is number => n !== null;

const reword = (m: string) =>
  m.replace(/rise/gi, 'radial width').replace(/\brun\b/gi, 'axial length').replace(/hypotenuse/gi, 'chamfer face length');

export function solveChamfer(i: ChamferInput): Result<ChamferResult> {
  const issues: CalcIssue[] = [];
  const chk = (v: number | null, field: string, label: string) => {
    if (v !== null && (!Number.isFinite(v) || v <= 0)) issues.push({ field, message: `${label} must be greater than zero.` });
  };
  chk(i.axial, 'axial', 'Axial length');
  chk(i.radial, 'radial', 'Radial width');
  chk(i.face, 'face', 'Face length');
  chk(i.angleDeg, 'angle', 'The angle');
  chk(i.partDia, 'partDia', 'Part diameter');
  if (has(i.angleDeg) && Number.isFinite(i.angleDeg) && i.angleDeg >= 90) issues.push({ field: 'angle', message: 'The chamfer angle must be less than 90°.' });
  if (issues.length) return failMany(issues);

  const n = [i.axial, i.radial, i.face, i.angleDeg].filter(has).length;
  if (n < 2) return fail('Enter any TWO of: axial length, radial width, face length or angle.');
  if (n > 2) return fail('Enter only TWO known values — clear the extras and calculate again.');

  const fromAxis = has(i.angleDeg) ? (i.angleRef === 'axis' ? i.angleDeg : 90 - i.angleDeg) : null;
  const t = solveTriangle({ unit: i.unit, rise: i.radial, run: i.axial, hyp: i.face, angleDeg: fromAxis });
  if (!t.ok) {
    return failMany(t.issues.map((x) => ({ message: reword(x.message), ...(x.field ? { field: ({ rise: 'radial', run: 'axial', hyp: 'face', angle: 'angle' } as Record<string, string>)[x.field] ?? x.field } : {}) })));
  }
  const v = t.value;
  if (has(i.partDia) && i.side === 'external' && 2 * v.rise >= i.partDia) {
    return fail('Impossible geometry: the chamfer takes off more than the whole diameter. Check the part diameter and the radial width.', 'partDia');
  }
  return ok({
    unit: i.unit,
    axial: v.run,
    radial: v.rise,
    diameterChange: 2 * v.rise,
    face: v.hyp,
    angleFromAxis: v.angleDeg,
    angleFromAxisDms: v.angleDms,
    angleFromFace: v.complementDeg,
    angleFromFaceDms: v.complementDms,
    includedDeg: 2 * v.angleDeg,
    partDia: i.partDia,
    endFaceDia: has(i.partDia) ? (i.side === 'external' ? i.partDia - 2 * v.rise : i.partDia + 2 * v.rise) : null,
    side: i.side,
    given: ([i.axial !== null && 'axial', i.radial !== null && 'radial', i.face !== null && 'face', i.angleDeg !== null && 'angle'].filter(Boolean) as ChamferResult['given']),
  });
}
