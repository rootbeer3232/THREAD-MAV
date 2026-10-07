/**
 * Speeds & feeds arithmetic (not recommendations).
 *   RPM  = SFM × 12 / (π × D_in)          (SFM = ft/min, D in inches)
 *   SFM  = π × D_in × RPM / 12
 *   Feed rate (in/min) = RPM × feed per rev;  milling: feed per rev = feed per tooth × flutes
 * Surface speed in m/min = SFM × 0.3048. The cutting data (SFM, chip load) is ALWAYS supplied by the
 * machinist from tool/material data — this tool never suggests cutting parameters.
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import { MM_PER_INCH, type Unit } from '../../core/units';

export type Process = 'mill' | 'turn' | 'drill';
export const M_PER_FT = 0.3048; // exact

export interface SpeedsInput {
  process: Process;
  unit: Unit;
  /** Cutter diameter (mill/drill) or work diameter (turn), in `unit`. */
  diameter: number;
  basis: 'speed' | 'rpm';
  /** SFM when unit = in, m/min when unit = mm. Used when basis = 'speed'. */
  surfaceSpeed: number | null;
  /** Used when basis = 'rpm'. */
  rpm: number | null;
  /** Feed per tooth (mill) or per revolution (turn/drill), in `unit`. */
  feed: number | null;
  /** Flute count (mill only). */
  flutes: number | null;
  /** Optional spindle limit. */
  maxRpm: number | null;
}

export interface SpeedsResult {
  input: SpeedsInput;
  diameterIn: number;
  /** Ideal values from the entered surface speed / rpm. */
  rpmIdeal: number;
  sfmIdeal: number;
  /** Values actually used after the optional spindle limit. */
  rpm: number;
  sfm: number;
  mpm: number;
  limited: boolean;
  /** Feed per tooth in inches (mill) or null */
  feedPerToothIn: number | null;
  feedPerRevIn: number | null;
  /** Table feed in in/min (null if no feed given) */
  feedRateIpm: number | null;
  advisories: string[];
}

const pos = (n: number | null): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

export function solveSpeeds(i: SpeedsInput): Result<SpeedsResult> {
  const issues: CalcIssue[] = [];
  if (!pos(i.diameter)) issues.push({ field: 'dia', message: 'Diameter must be greater than zero.' });
  if (i.basis === 'speed' && !pos(i.surfaceSpeed)) issues.push({ field: 'speed', message: `Enter the surface speed (${i.unit === 'in' ? 'SFM' : 'm/min'}) from your tool data.` });
  if (i.basis === 'rpm' && !pos(i.rpm)) issues.push({ field: 'rpm', message: 'Enter the spindle RPM.' });
  if (i.feed !== null && !pos(i.feed)) issues.push({ field: 'feed', message: 'Feed must be greater than zero.' });
  if (i.process === 'mill' && i.feed !== null && (!pos(i.flutes) || !Number.isInteger(i.flutes))) {
    issues.push({ field: 'flutes', message: 'Flute count must be a whole number of 1 or more.' });
  }
  if (i.maxRpm !== null && !pos(i.maxRpm)) issues.push({ field: 'maxRpm', message: 'Spindle limit must be greater than zero.' });
  if (issues.length) return failMany(issues);

  const dIn = i.unit === 'in' ? i.diameter : i.diameter / MM_PER_INCH;
  let rpmIdeal: number;
  let sfmIdeal: number;
  if (i.basis === 'speed') {
    sfmIdeal = i.unit === 'in' ? i.surfaceSpeed! : i.surfaceSpeed! / M_PER_FT;
    rpmIdeal = (sfmIdeal * 12) / (Math.PI * dIn);
  } else {
    rpmIdeal = i.rpm!;
    sfmIdeal = (Math.PI * dIn * rpmIdeal) / 12;
  }
  const limited = i.maxRpm !== null && rpmIdeal > i.maxRpm;
  const rpm = limited ? i.maxRpm! : rpmIdeal;
  const sfm = (Math.PI * dIn * rpm) / 12;

  const advisories: string[] = [];
  if (limited) advisories.push(`Ideal speed is ${rpmIdeal.toFixed(0)} RPM but your spindle limit is ${i.maxRpm!.toFixed(0)} RPM — figures below use the limit (surface speed drops to ${sfm.toFixed(0)} SFM).`);

  let feedPerToothIn: number | null = null;
  let feedPerRevIn: number | null = null;
  let feedRateIpm: number | null = null;
  if (i.feed !== null) {
    const f = i.unit === 'in' ? i.feed : i.feed / MM_PER_INCH;
    if (i.process === 'mill') {
      feedPerToothIn = f;
      feedPerRevIn = f * i.flutes!;
    } else feedPerRevIn = f;
    feedRateIpm = rpm * feedPerRevIn;
    if (feedPerRevIn > dIn) advisories.push('Feed per revolution is larger than the diameter — double-check the feed value and units.');
  }

  return ok({
    input: i,
    diameterIn: dIn,
    rpmIdeal,
    sfmIdeal,
    rpm,
    sfm,
    mpm: sfm * M_PER_FT,
    limited,
    feedPerToothIn,
    feedPerRevIn,
    feedRateIpm,
    advisories,
  });
}
