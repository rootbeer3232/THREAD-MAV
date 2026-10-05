/**
 * Thread / 3-wire engine. Pure and deterministic: validated inputs in, numbers out.
 * Lengths are in `inputs.unit`; callers derive the other system with core/units.
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import { type Unit, MM_PER_INCH, pitchMmToTpi } from '../../core/units';
import {
  basicMinorDiameter,
  basicPitchDiameter,
  basicThreadDepth,
  isoExternalMinorDiameter,
  isoExternalThreadDepth,
  sharpVHeight,
} from './geometry';
import { bestWire, overWiresFromPitchDia, pitchDiaFromOverWires, wireFit } from './wire';
import { type StandardLimitRecord, type StandardsLookup, lookupStandardLimits } from './standards/gate';
import { VERIFIED_RECORDS } from './standards/records';

export type ThreadSystem = 'unified' | 'metric' | 'custom';

export interface ThreadInputs {
  system: ThreadSystem;
  /** Unit of every dimensional input below. */
  unit: Unit;
  /** Human designation, e.g. "3/8-16 UNC" or "M10 × 1.5" (display only). */
  designation: string;
  majorDia: number;
  pitch: number;
  external: boolean;
  /** e.g. "2A", "6g" (display + standards lookup; no tolerance is derived from it). */
  classLabel: string;
  /** Wire in hand. null → theoretical best wire is used (and flagged). */
  actualWire: number | null;
  /** Custom threads only: user-supplied target pitch diameter overriding basic. */
  targetPitchDia: number | null;
  /** User-entered limits (pitch diameter). Always labelled MANUAL. */
  manualLimits: { pdMin: number; pdMax: number } | null;
  /** Optional reading from the micrometer, to convert back to pitch diameter. */
  measuredOverWires: number | null;
}

export type StatusFlag =
  | 'VERIFIED'
  | 'CUSTOM'
  | 'MANUAL'
  | 'GEOMETRY ONLY'
  | 'STANDARD LIMITS NOT VERIFIED';

export interface ThreadResult {
  inputs: ThreadInputs;
  unit: Unit;
  pitch: number;
  tpi: number;
  sharpVHeight: number;

  basicPitchDia: number;
  targetPitchDia: number;
  targetSource: 'basic' | 'manual-midpoint' | 'custom';
  majorDia: number;
  /** D − 1.0825P: internal-thread minor / basic minor. */
  basicMinorDia: number;
  /** ISO external d3 (metric external only). */
  isoExternalMinorDia: number | null;
  basicThreadDepth: number;
  isoExternalThreadDepth: number | null;

  bestWire: number;
  wireUsed: number;
  wireSource: 'actual' | 'best';

  /** null for internal threads (3-wire is an external-thread measurement). */
  overWires: { target: number; min: number | null; max: number | null } | null;
  limits: { min: number; max: number; source: 'manual' | 'verified' } | null;
  verifiedRecord: StandardLimitRecord | null;

  measured: {
    overWires: number;
    pitchDia: number;
    verdict: 'within' | 'below' | 'above' | 'no-limits';
    /** measured PD − target PD */
    deviationFromTarget: number;
  } | null;

  statuses: StatusFlag[];
  standards: StandardsLookup | { status: 'n/a'; reason: string };
  advisories: string[];
}

export function solveThread(
  inp: ThreadInputs,
  records: readonly StandardLimitRecord[] = VERIFIED_RECORDS,
): Result<ThreadResult> {
  const issues: CalcIssue[] = [];
  const positive = (n: number) => Number.isFinite(n) && n > 0;

  if (!positive(inp.majorDia)) issues.push({ field: 'major', message: 'Major diameter must be greater than zero.' });
  if (!positive(inp.pitch)) issues.push({ field: 'pitch', message: 'Pitch / TPI must be greater than zero.' });
  if (issues.length) return failMany(issues);

  if (basicMinorDiameter(inp.majorDia, inp.pitch) <= 0) {
    return fail(
      'This pitch is too coarse for this diameter — the minor diameter would be zero or negative. Check the diameter and pitch/TPI.',
      'pitch',
    );
  }

  const P = inp.pitch;
  const basicPD = basicPitchDiameter(inp.majorDia, P);
  const best = bestWire(P);

  if (inp.targetPitchDia !== null) {
    if (!positive(inp.targetPitchDia)) {
      return fail('Target pitch diameter must be greater than zero.', 'targetPd');
    }
    if (inp.targetPitchDia >= inp.majorDia) {
      return fail('Target pitch diameter must be smaller than the major diameter.', 'targetPd');
    }
  }
  if (inp.manualLimits) {
    const { pdMin, pdMax } = inp.manualLimits;
    if (!positive(pdMin) || !positive(pdMax)) {
      return fail('Manual limits must be greater than zero.', 'limitMin');
    }
    if (pdMin >= pdMax) {
      return fail('Manual limits: the minimum pitch diameter must be smaller than the maximum.', 'limitMin');
    }
    if (pdMax >= inp.majorDia) {
      return fail('Manual limits: maximum pitch diameter must be smaller than the major diameter.', 'limitMax');
    }
  }

  const advisories: string[] = [];

  // wire
  let wireUsed = best;
  let wireSource: 'actual' | 'best' = 'best';
  if (inp.actualWire !== null) {
    if (!positive(inp.actualWire)) return fail('Wire diameter must be greater than zero.', 'wire');
    wireUsed = inp.actualWire;
    wireSource = 'actual';
  }

  // standards lookup (never fabricates; empty record set → not verified)
  let standards: ThreadResult['standards'];
  let verifiedRecord: StandardLimitRecord | null = null;
  if (inp.system === 'custom') {
    standards = { status: 'n/a', reason: 'Custom thread — no standard applies.' };
  } else {
    standards = lookupStandardLimits(
      {
        system: inp.system,
        majorDia: inp.majorDia,
        pitchOrTpi: inp.system === 'unified' ? (inp.unit === 'in' ? 1 / P : MM_PER_INCH / P) : inp.unit === 'mm' ? P : P * MM_PER_INCH,
        classLabel: inp.classLabel,
        external: inp.external,
        unit: inp.unit,
      },
      records,
    );
    if (standards.status === 'verified') verifiedRecord = standards.record;
  }

  // limits: manual overrides verified; both are labelled by source
  let limits: ThreadResult['limits'] = null;
  if (inp.manualLimits) {
    limits = { min: inp.manualLimits.pdMin, max: inp.manualLimits.pdMax, source: 'manual' };
  } else if (verifiedRecord) {
    limits = { min: verifiedRecord.pdMin, max: verifiedRecord.pdMax, source: 'verified' };
  }

  // target pitch diameter
  let targetPD = basicPD;
  let targetSource: ThreadResult['targetSource'] = 'basic';
  if (inp.targetPitchDia !== null) {
    targetPD = inp.targetPitchDia;
    targetSource = 'custom';
  } else if (limits) {
    targetPD = (limits.min + limits.max) / 2;
    targetSource = 'manual-midpoint';
  }

  // 3-wire (external only)
  let overWires: ThreadResult['overWires'] = null;
  let measured: ThreadResult['measured'] = null;
  if (inp.external) {
    const fit = wireFit(wireUsed, P);
    if (!fit.contactsFlank) {
      const [lo, hi] = [fit.minContactWire, fit.maxContactWire];
      const fmt = (v: number) => v.toFixed(inp.unit === 'in' ? 4 : 3);
      return fail(
        `This wire does not seat on the thread flanks (it would ride on the crests or drop to the root), so the 3-wire formula does not apply. Usable wire range for this pitch is about ${fmt(lo)} – ${fmt(hi)} ${inp.unit}; best wire is ${fmt(best)} ${inp.unit}.`,
        'wire',
      );
    }
    if (!fit.anvilBearsOnWire) {
      advisories.push(
        `Wire is smaller than ${(fit.minPracticalWire).toFixed(inp.unit === 'in' ? 4 : 3)} ${inp.unit}: the micrometer anvil may touch the thread crests instead of the wires. Use a larger wire.`,
      );
    }
    if (wireSource === 'actual' && Math.abs(wireUsed - best) / best > 0.1) {
      advisories.push('Actual wire differs from best wire by more than 10% — verify the wire diameter and its contact with the flanks.');
    }
    overWires = {
      target: overWiresFromPitchDia(targetPD, wireUsed, P),
      min: limits ? overWiresFromPitchDia(limits.min, wireUsed, P) : null,
      max: limits ? overWiresFromPitchDia(limits.max, wireUsed, P) : null,
    };
    if (inp.measuredOverWires !== null) {
      if (!positive(inp.measuredOverWires)) return fail('Measured over-wires value must be greater than zero.', 'measured');
      const pd = pitchDiaFromOverWires(inp.measuredOverWires, wireUsed, P);
      let verdict: 'within' | 'below' | 'above' | 'no-limits' = 'no-limits';
      if (limits) {
        const eps = 1e-9 * Math.max(1, Math.abs(pd));
        verdict = pd < limits.min - eps ? 'below' : pd > limits.max + eps ? 'above' : 'within';
      }
      measured = { overWires: inp.measuredOverWires, pitchDia: pd, verdict, deviationFromTarget: pd - targetPD };
      if (pd <= 0 || pd >= inp.majorDia) {
        return fail('That measurement over wires gives an impossible pitch diameter. Re-check the reading and the wire size.', 'measured');
      }
    }
  }

  if (limits && (basicPD < limits.min || basicPD > limits.max) && limits.source === 'manual') {
    advisories.push('Basic pitch diameter lies outside your manual limits (normal for external threads with an allowance).');
  }

  // status flags
  const statuses: StatusFlag[] = [];
  if (inp.system === 'custom') statuses.push('CUSTOM');
  if (verifiedRecord) statuses.push('VERIFIED');
  if (inp.manualLimits) statuses.push('MANUAL');
  if (inp.system !== 'custom' && !verifiedRecord) statuses.push('STANDARD LIMITS NOT VERIFIED');
  if (!limits) statuses.push('GEOMETRY ONLY');

  const isMetricExternal = inp.system === 'metric' && inp.external;
  const tpi = inp.unit === 'in' ? 1 / P : pitchMmToTpi(P);

  return ok({
    inputs: inp,
    unit: inp.unit,
    pitch: P,
    tpi,
    sharpVHeight: sharpVHeight(P),
    basicPitchDia: basicPD,
    targetPitchDia: targetPD,
    targetSource,
    majorDia: inp.majorDia,
    basicMinorDia: basicMinorDiameter(inp.majorDia, P),
    isoExternalMinorDia: isMetricExternal ? isoExternalMinorDiameter(inp.majorDia, P) : null,
    basicThreadDepth: basicThreadDepth(P),
    isoExternalThreadDepth: isMetricExternal ? isoExternalThreadDepth(P) : null,
    bestWire: best,
    wireUsed,
    wireSource,
    overWires,
    limits,
    verifiedRecord,
    measured,
    statuses,
    standards,
    advisories,
  });
}
