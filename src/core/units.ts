/**
 * Unit framework. Every dual-unit value is derived from ONE underlying number
 * via the exact definition 1 in = 25.4 mm, so displayed inch and metric values
 * can never drift apart through repeated rounding/convert cycles.
 */
export type Unit = 'in' | 'mm';

export const MM_PER_INCH = 25.4; // exact by international definition (1959)

export function toMm(value: number, from: Unit): number {
  return from === 'mm' ? value : value * MM_PER_INCH;
}

export function toInch(value: number, from: Unit): number {
  return from === 'in' ? value : value / MM_PER_INCH;
}

export function convertLength(value: number, from: Unit, to: Unit): number {
  if (from === to) return value;
  return from === 'in' ? value * MM_PER_INCH : value / MM_PER_INCH;
}

/** A length expressed in both systems, remembering which one the user is working in. */
export interface DualLength {
  in: number;
  mm: number;
  /** The unit the calculation was performed/entered in. */
  primary: Unit;
}

export function dualFrom(value: number, unit: Unit): DualLength {
  return unit === 'in'
    ? { in: value, mm: value * MM_PER_INCH, primary: 'in' }
    : { in: value / MM_PER_INCH, mm: value, primary: 'mm' };
}

export function otherUnit(u: Unit): Unit {
  return u === 'in' ? 'mm' : 'in';
}

/** Threads per inch <-> pitch (inch). */
export function tpiToPitchInch(tpi: number): number {
  return 1 / tpi;
}
export function pitchMmToTpi(pitchMm: number): number {
  return MM_PER_INCH / pitchMm;
}

/* ---------- angles ---------- */

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export function degToRad(d: number): number {
  return d * DEG_TO_RAD;
}
export function radToDeg(r: number): number {
  return r * RAD_TO_DEG;
}

export interface Dms {
  degrees: number;
  minutes: number;
  seconds: number;
}

/** Decimal degrees from D/M/S. Caller validates ranges (see validateDms). */
export function dmsToDeg(d: number, m: number, s: number): number {
  return d + m / 60 + s / 3600;
}

/**
 * Decimal degrees -> D/M/S with the seconds rounded to `secDecimals`.
 * Carries correctly so 59.999" never displays as 60".
 */
export function degToDms(deg: number, secDecimals = 1): Dms {
  const sign = deg < 0 ? -1 : 1;
  const total = Math.abs(deg) * 3600;
  const scale = 10 ** secDecimals;
  const roundedTotal = Math.round(total * scale) / scale;
  let degrees = Math.floor(roundedTotal / 3600);
  const rem = roundedTotal - degrees * 3600;
  let minutes = Math.floor(rem / 60);
  let seconds = Math.round((rem - minutes * 60) * scale) / scale;
  if (seconds >= 60) {
    seconds -= 60;
    minutes += 1;
  }
  if (minutes >= 60) {
    minutes -= 60;
    degrees += 1;
  }
  return { degrees: sign * degrees, minutes, seconds };
}
