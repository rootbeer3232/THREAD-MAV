/**
 * Taper solver. T = (D − d) / L is the diametral taper per unit of length (dimensionless).
 *   taper per foot (in/ft) = 12·T          ratio = 1 : (1/T)
 *   included angle α = 2·atan(T/2)         angle per side = α/2
 * Provide EITHER all of D, d, L (taper is computed) OR a taper plus any two of D, d, L (the third is solved).
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Dms, type Unit, degToDms } from '../../core/units';

export type TaperKind = 'perUnit' | 'perFoot' | 'per100' | 'included' | 'perSide';

export interface TaperInput {
  unit: Unit;
  large: number | null;
  small: number | null;
  length: number | null;
  /** Taper value in `taperKind` terms, or null. */
  taper: number | null;
  taperKind: TaperKind;
  /** Optional overall part length for tailstock set-over. */
  partLength: number | null;
}

export interface TaperResult {
  unit: Unit;
  large: number;
  small: number;
  length: number;
  /** diametral taper per unit length (in/in or mm/mm) */
  perUnit: number;
  perFoot: number; // inch per foot (valid as in/ft when unit = in)
  per100: number; // per 100 length units (mm per 100 mm when unit = mm)
  ratio: number; // 1 : ratio
  includedDeg: number;
  includedDms: Dms;
  perSideDeg: number;
  perSideDms: Dms;
  setOver: number | null;
  partLength: number | null;
  solved: ('large' | 'small' | 'length' | 'taper')[];
}

const has = (n: number | null): n is number => n !== null;

export function taperFromKind(value: number, kind: TaperKind): Result<number> {
  switch (kind) {
    case 'perUnit':
      return ok(value);
    case 'perFoot':
      return ok(value / 12);
    case 'per100':
      return ok(value / 100);
    case 'included':
      if (value <= 0 || value >= 180) return fail('The included angle must be between 0° and 180°.', 'taper');
      return ok(2 * Math.tan((value * Math.PI) / 360));
    case 'perSide':
      if (value <= 0 || value >= 90) return fail('The angle per side must be between 0° and 90°.', 'taper');
      return ok(2 * Math.tan((value * Math.PI) / 180));
  }
}

export function solveTaper(i: TaperInput): Result<TaperResult> {
  const issues: CalcIssue[] = [];
  for (const [k, v, label] of [
    ['large', i.large, 'Large diameter'],
    ['small', i.small, 'Small diameter'],
    ['length', i.length, 'Taper length'],
    ['taper', i.taper, 'Taper'],
  ] as const) {
    if (v !== null && (!Number.isFinite(v) || v <= 0)) issues.push({ field: k, message: `${label} must be greater than zero.` });
  }
  if (i.partLength !== null && (!Number.isFinite(i.partLength) || i.partLength <= 0)) issues.push({ field: 'partLength', message: 'Part length must be greater than zero.' });
  if (issues.length) return failMany(issues);

  const dims = [i.large, i.small, i.length].filter(has).length;
  const solved: TaperResult['solved'] = [];
  let D = i.large;
  let d = i.small;
  let L = i.length;
  let T: number;

  if (dims === 3) {
    if (i.taper !== null) return fail('You entered a large diameter, small diameter, length AND a taper — that’s more than needed. Clear one (usually the taper) and calculate again.');
    if (D! <= d!) return fail('The large diameter must be larger than the small diameter.', 'large');
    T = (D! - d!) / L!;
    solved.push('taper');
  } else if (dims === 2 && i.taper !== null) {
    const t = taperFromKind(i.taper, i.taperKind);
    if (!t.ok) return t as Result<never>;
    T = t.value;
    if (!has(L)) {
      if (D! <= d!) return fail('The large diameter must be larger than the small diameter.', 'large');
      L = (D! - d!) / T;
      solved.push('length');
    } else if (!has(d)) {
      d = D! - T * L;
      if (d <= 0) return fail(`Impossible geometry: at that taper the diameter reaches zero before ${L} of length. The longest it can be is ${(D! / T).toFixed(4)}.`, 'length');
      solved.push('small');
    } else {
      D = d + T * L;
      solved.push('large');
    }
  } else {
    return fail('Enter either the large diameter, small diameter and length — or the taper plus any two of them.');
  }

  const large = D!;
  const small = d!;
  const length = L!;
  const included = 2 * Math.atan(T / 2) * (180 / Math.PI);
  const perSide = included / 2;
  if (![large, small, length, T, included].every((n) => Number.isFinite(n) && n > 0)) return fail('Those values give an impossible taper. Check the entries.');
  return ok({
    unit: i.unit,
    large,
    small,
    length,
    perUnit: T,
    perFoot: 12 * T,
    per100: 100 * T,
    ratio: 1 / T,
    includedDeg: included,
    includedDms: degToDms(included, 1),
    perSideDeg: perSide,
    perSideDms: degToDms(perSide, 1),
    setOver: i.partLength !== null ? ((large - small) / 2) * (i.partLength / length) : null,
    partLength: i.partLength,
    solved,
  });
}
