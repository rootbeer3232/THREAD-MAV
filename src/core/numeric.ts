/** Input parsing, plain-language errors and display formatting. No DOM here. */

export interface CalcIssue {
  /** Field id the message belongs to (undefined = whole calculation). */
  field?: string;
  message: string;
}

export type Result<T> = { ok: true; value: T } | { ok: false; issues: CalcIssue[] };

export const ok = <T>(value: T): Result<T> => ({ ok: true, value });
export const fail = <T = never>(message: string, field?: string): Result<T> => ({
  ok: false,
  issues: [field === undefined ? { message } : { field, message }],
});
export const failMany = <T = never>(issues: CalcIssue[]): Result<T> => ({ ok: false, issues });

/**
 * Parse what a machinist types: ".005", "0.005", "5.", "1,5" (comma decimal).
 * Returns null for blank, NaN for malformed (caller reports it).
 */
export function parseDecimal(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined) return null;
  const t = raw.trim().replace(',', '.');
  if (t === '' || t === '.' || t === '-') return null;
  // fractions: "3/8", "1-1/2", "1 1/2", "-3/8"
  const frac = /^(-?)(?:(\d+)[ -])?(\d+)\/(\d+)$/.exec(t);
  if (frac) {
    const den = Number(frac[4]);
    if (den === 0) return Number.NaN;
    const v = Number(frac[2] ?? 0) + Number(frac[3]) / den;
    return Number.isFinite(v) ? (frac[1] ? -v : v) : Number.NaN;
  }
  if (!/^-?(\d+\.?\d*|\.\d+)$/.test(t)) return Number.NaN;
  const n = Number(t);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Keystroke cleanup for fields that accept fractions: digits . / - and spaces. */
export function sanitizeFractionInput(raw: string, allowNegative = false): string {
  let s = raw.replace(/,/g, '.').replace(/[^0-9./\- ]/g, '').replace(/\s+/g, ' ');
  if (!allowNegative) s = s.replace(/^-+/, '');
  return s.replace(/^\s+/, '');
}

/**
 * Put a fraction chip into the entry: "" → "3/8", "1" → "1-3/8", "1-1/2" → "1-3/8", "1.5" → "3/8".
 */
export function applyFraction(text: string, frac: string): string {
  const m = /^(-?\d+)(?:[ -]\d+\/\d+|\/\d+)?$/.exec(text.trim());
  const whole = m && !/^-?\d+\/\d+$/.test(text.trim()) ? m[1] : '';
  return whole ? `${whole}-${frac}` : frac;
}

/** Clean up raw keystrokes: keep digits and one decimal point (optionally a leading minus). */
export function sanitizeDecimalInput(raw: string, allowNegative = false): string {
  let s = raw.replace(/,/g, '.').replace(allowNegative ? /[^0-9.\-]/g : /[^0-9.]/g, '');
  let neg = false;
  if (allowNegative && s.startsWith('-')) neg = true;
  s = s.replace(/-/g, '');
  const first = s.indexOf('.');
  if (first !== -1) s = s.slice(0, first + 1) + s.slice(first + 1).replace(/\./g, '');
  return (neg ? '-' : '') + s;
}

export function isFinitePositive(n: number | null | undefined): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n > 0;
}

/** Fixed-decimal formatting that never emits "-0.0000" or NaN/Infinity. */
export function fmtFixed(value: number, decimals: number): string {
  if (!Number.isFinite(value)) return '—';
  const s = value.toFixed(decimals);
  return /^-0\.?0*$/.test(s) ? s.slice(1) : s;
}

/** Compare numbers within an absolute tolerance (used by tests and range checks). */
export function approx(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}
