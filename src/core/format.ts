import { fmtFixed } from './numeric';
import type { Settings } from './settings-model';
import type { DualLength, Unit } from './units';

export interface FormatOptions {
  inchDecimals: number;
  metricDecimals: number;
}

export function formatOptions(s: Pick<Settings, 'inchDecimals' | 'metricDecimals'>): FormatOptions {
  return { inchDecimals: s.inchDecimals, metricDecimals: s.metricDecimals };
}

export function fmtLength(value: number, unit: Unit, o: FormatOptions, minDecimals?: number): string {
  const dp = unit === 'in' ? o.inchDecimals : o.metricDecimals;
  return fmtFixed(value, Math.max(dp, minDecimals ?? 0));
}

export interface DualText {
  inch: string;
  mm: string;
  primary: Unit;
}

/** Both systems formatted from the SAME underlying value. */
export function fmtDual(d: DualLength, o: FormatOptions, extraDecimals = 0): DualText {
  return {
    inch: fmtFixed(d.in, o.inchDecimals + extraDecimals),
    mm: fmtFixed(d.mm, o.metricDecimals + extraDecimals),
    primary: d.primary,
  };
}

export function fmtDeg(deg: number, decimals = 4): string {
  return `${fmtFixed(deg, decimals)}°`;
}

export function fmtDms(d: { degrees: number; minutes: number; seconds: number }): string {
  const sec = Number.isInteger(d.seconds) ? String(d.seconds) : d.seconds.toFixed(1);
  return `${d.degrees}° ${d.minutes}′ ${sec}″`;
}

/** Trim trailing zeros: 16.000 -> "16", 4.5 -> "4.5", 25.4/1.5 -> "16.933" */
export function fmtLoose(n: number, maxDecimals = 3): string {
  if (!Number.isFinite(n)) return '—';
  return String(Number(n.toFixed(maxDecimals)));
}
