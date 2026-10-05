/**
 * Pure 60° V-thread geometry (Unified and ISO metric share the same basic profile).
 * All functions are unit-agnostic: pass every length in the same unit, get the same unit back.
 * NO tolerance data lives here.
 */

const SQRT3 = Math.sqrt(3);

/** Fundamental (sharp-V) triangle height H = (√3/2)·P ≈ 0.866025·P */
export function sharpVHeight(pitch: number): number {
  return (SQRT3 / 2) * pitch;
}

/** Basic pitch diameter: D − (3/4)·H = D − 0.649519·P (Unified D − 0.6495P; ISO d2 = d − 0.6495P). */
export function basicPitchDiameter(major: number, pitch: number): number {
  return major - 0.75 * sharpVHeight(pitch);
}

/** Basic thread depth 5H/8 = 0.541266·P (internal thread H1; also the basic external depth). */
export function basicThreadDepth(pitch: number): number {
  return (5 / 8) * sharpVHeight(pitch);
}

/** Basic minor diameter D − 2·(5H/8) = D − 1.082532·P (internal thread D1). */
export function basicMinorDiameter(major: number, pitch: number): number {
  return major - 2 * basicThreadDepth(pitch);
}

/** ISO external minor diameter d3 = d − 2·(17H/24) = d − 1.226869·P (rounded-root external thread). */
export function isoExternalMinorDiameter(major: number, pitch: number): number {
  return major - 2 * (17 / 24) * sharpVHeight(pitch);
}

/** ISO external thread depth h3 = 17H/24 = 0.613435·P. */
export function isoExternalThreadDepth(pitch: number): number {
  return (17 / 24) * sharpVHeight(pitch);
}
