/**
 * CONTOUR IQ — geometry data model (Gate A).
 *
 * CONVENTIONS (fixed; do not reinterpret silently):
 *  - Coordinates are in the lathe X/Z plane. X is a DIAMETER (as on a Haas in diameter mode).
 *    Any radius math must halve X explicitly (radial = X / 2).
 *  - Z is measured from program zero (P0). Z is NEGATIVE toward the chuck.
 *  - All numbers inside the engine are in MILLIMETRES (one internal representation). Display units
 *    are a presentation choice; inch inputs are converted with the exact 25.4 factor.
 *  - A value is one of: a known number (0 is a real, known value), or null = UNKNOWN.
 *    "Not applicable" is expressed by the segment kind, never by null.
 *  - Profiles run from the first point toward the chuck (Z non-increasing along the profile).
 *  - Saved profiles carry `schema` so they can be migrated safely.
 */

/** v1 = straight/shoulder only (Test 1.5). v2 adds taper segments. v1 profiles are valid v2 profiles. */
export const CONTOUR_SCHEMA = 2;
export const CONTOUR_SCHEMA_MIN = 1;

export type ContourSide = 'od' | 'id';

/** null = unknown. 0 is a legitimate known value. */
export type Known = number | null;

export interface ContourPoint {
  /** Diameter (mm). */
  x: Known;
  /** Distance from P0 along the axis (mm), negative toward the chuck. */
  z: Known;
}

/**
 * Gate B1 segment kinds:
 *  - straight: constant diameter, runs toward the chuck. value = LENGTH (mm, > 0).
 *  - shoulder: constant Z, diameter changes.            value = DIAMETER CHANGE (mm, signed: + steps up, − steps down).
 */
export type SegmentKind = 'straight' | 'shoulder' | 'taper';

/** Direction a taper's diameter changes while running toward the chuck: +1 grows, −1 shrinks, null unknown. */
export type TaperDir = 1 | -1 | null;

export interface ContourSegment {
  kind: SegmentKind;
  /** straight: length; shoulder: signed diameter change. (Unused for taper.) */
  value: Known;
  /**
   * TAPER fields (all mm / degrees, any two of length, dx, angle determine the third):
   *  length — axial length (> 0)      dx — signed TOTAL diameter change (X change)
   *  angle  — measured FROM THE AXIS (centerline), 0° < angle < 90°
   *  dir    — grows/shrinks toward the chuck; needed when dx is not given or derivable
   */
  length?: Known;
  dx?: Known;
  angle?: Known;
  dir?: TaperDir;
}

export interface ContourProfile {
  schema: typeof CONTOUR_SCHEMA;
  side: ContourSide;
  points: ContourPoint[];
  /** segments[i] joins points[i] and points[i + 1]. */
  segments: ContourSegment[];
}

export type Source = 'given' | 'solved' | 'unknown';
export type Status = 'green' | 'amber' | 'red';

export interface SolvedPoint {
  x: Known;
  z: Known;
  xSource: Source;
  zSource: Source;
}

export interface SolvedTaper {
  length: Known;
  dx: Known;
  /** From the axis (centerline), degrees. From the end face it is 90 − this. */
  angle: Known;
  dir: TaperDir;
  lengthSource: Source;
  dxSource: Source;
  angleSource: Source;
}

export interface SolvedSegment {
  kind: SegmentKind;
  value: Known;
  source: Source;
  /** Present for taper segments. */
  taper?: SolvedTaper;
}

export interface ContourMessage {
  level: 'red' | 'amber' | 'info';
  text: string;
}

export interface ContourSolution {
  status: Status;
  points: SolvedPoint[];
  segments: SolvedSegment[];
  messages: ContourMessage[];
}

/** Agreement tolerance between two derivations of the same value, in mm. */
export const CONTOUR_TOL_MM = 1e-6;

/**
 * When length, diameter change AND angle are all given they are a trig relationship, and prints round.
 * They are accepted if they agree within this many mm of diameter change (0.0005 in); beyond that it is a conflict.
 */
export const CONTOUR_TRIG_TOL_MM = 0.0127;
