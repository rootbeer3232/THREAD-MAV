/**
 * STANDARDS GATE — fail closed.
 *
 * A tolerance/limit record may be presented as VERIFIED only when every
 * provenance requirement is met:
 *   - standard + exact edition on the allow-list below
 *   - data provenance (where the numbers came from)
 *   - verifier (who checked them) and verification date
 *   - explicit verified === true
 *   - well-formed, internally consistent limits (min < max, > 0)
 *   - exactly ONE matching record (duplicates fail closed)
 *
 * Anything else yields `not-verified` and the UI must NOT show standard limits.
 * Pure geometry and user-entered Manual Limits are unaffected.
 */
import type { Unit } from '../../../core/units';

export type StandardId = 'ASME B1.1' | 'ISO 965-1';

/** Editions Thread Mav is permitted to treat as current. Metric intentionally empty until verified. */
export const ALLOWED_EDITIONS: Record<StandardId, readonly string[]> = {
  'ASME B1.1': ['2024'],
  'ISO 965-1': [],
};

export interface StandardLimitRecord {
  standard: StandardId;
  edition: string;
  system: 'unified' | 'metric';
  /** Basic major diameter in `unit`. */
  majorDia: number;
  /** Unified: threads per inch. Metric: pitch in mm. */
  pitchOrTpi: number;
  classLabel: string; // e.g. "2A", "6g"
  external: boolean;
  unit: Unit;
  pdMin: number;
  pdMax: number;
  provenance: string;
  verifiedBy: string;
  verifiedOn: string; // ISO date
  verified: boolean;
}

export interface LimitQuery {
  system: 'unified' | 'metric';
  majorDia: number;
  /** Unified: TPI. Metric: pitch (mm). */
  pitchOrTpi: number;
  classLabel: string;
  external: boolean;
  unit: Unit;
}

export type StandardsLookup =
  | { status: 'verified'; record: StandardLimitRecord }
  | { status: 'not-verified'; reason: string };

export function recordProblems(r: StandardLimitRecord): string[] {
  const p: string[] = [];
  const editions = ALLOWED_EDITIONS[r.standard] ?? [];
  if (!editions.includes(r.edition)) p.push(`edition "${r.edition}" of ${r.standard} is not on the allowed list`);
  if (!r.provenance?.trim()) p.push('missing data provenance');
  if (!r.verifiedBy?.trim()) p.push('missing verifier');
  if (!r.verifiedOn || Number.isNaN(Date.parse(r.verifiedOn))) p.push('missing/invalid verification date');
  if (r.verified !== true) p.push('not flagged verified');
  const finite = [r.majorDia, r.pitchOrTpi, r.pdMin, r.pdMax].every((n) => Number.isFinite(n) && n > 0);
  if (!finite) p.push('non-numeric or non-positive values');
  else if (!(r.pdMin < r.pdMax)) p.push('pdMin must be less than pdMax');
  return p;
}

const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

export function lookupStandardLimits(q: LimitQuery, records: readonly StandardLimitRecord[]): StandardsLookup {
  const matches = records.filter(
    (r) =>
      r.system === q.system &&
      r.unit === q.unit &&
      r.external === q.external &&
      r.classLabel.toUpperCase() === q.classLabel.toUpperCase() &&
      near(r.majorDia, q.majorDia) &&
      near(r.pitchOrTpi, q.pitchOrTpi),
  );
  if (matches.length === 0) {
    return { status: 'not-verified', reason: 'No verified limit record is loaded for this thread and class.' };
  }
  if (matches.length > 1) {
    return { status: 'not-verified', reason: 'Duplicate limit records found — refusing to choose one.' };
  }
  const rec = matches[0]!;
  const problems = recordProblems(rec);
  if (problems.length) {
    return { status: 'not-verified', reason: `Limit record failed verification: ${problems.join('; ')}.` };
  }
  return { status: 'verified', record: rec };
}
