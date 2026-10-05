/**
 * Verified standard limit records.
 *
 * INTENTIONALLY EMPTY in this build. Thread Mav prefers missing data to wrong
 * acceptance limits. Records are added here ONLY after they are checked against
 * the controlling standard edition (ASME B1.1-2024 for Unified) with full
 * provenance — see gate.ts for the required fields. Do not paste values from
 * web tables, NIST H28 or handbooks without that verification.
 */
import type { StandardLimitRecord } from './gate';

export const VERIFIED_RECORDS: readonly StandardLimitRecord[] = [];
