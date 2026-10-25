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

export const CONTOUR_SCHEMA = 1;

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
export type SegmentKind = 'straight' | 'shoulder';

export interface ContourSegment {
  kind: SegmentKind;
  value: Known;
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

export interface SolvedSegment {
  kind: SegmentKind;
  value: Known;
  source: Source;
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
