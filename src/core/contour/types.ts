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

/** v1 = straight/shoulder (Test 1.5). v2 adds taper segments. v3 adds corner radii. Older profiles remain valid. */
export const CONTOUR_SCHEMA = 3;
export const CONTOUR_SCHEMA_MIN = 1;

export type ContourSide = 'od' | 'id';

/** null = unknown. 0 is a legitimate known value. */
export type Known = number | null;

export interface ContourPoint {
  /** Diameter (mm) of the SHARP (virtual) corner — where the two lines would meet. */
  x: Known;
  /** Distance from P0 along the axis (mm), negative toward the chuck. */
  z: Known;
  /**
   * Corner radius (mm) rounding this point. null/undefined/0 = sharp corner (no radius).
   * Only interior points can have one. Dimensions to the point are to the SHARP corner.
   */
  radius?: Known;
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

export interface XZ {
  /** Diameter (mm). */
  x: number;
  z: number;
}

export interface SolvedArc {
  radius: number;
  /** Distance from the sharp corner back along each leg to the tangent point. */
  tangentLength: number;
  /** Where the arc starts (on the incoming leg) and ends (on the outgoing leg). */
  start: XZ;
  end: XZ;
  /** Arc center; x is a DIAMETER-scale coordinate (2 × radial position). */
  center: XZ;
  /** Direction of travel around the arc in the X–Z drawing (Z increasing right, X up). */
  turn: 'ccw' | 'cw';
  /** Convex = the arc bulges away from the material (a rounded outside corner). */
  convex: boolean;
  sweepDeg: number;
}

export interface SolvedPoint {
  x: Known;
  z: Known;
  xSource: Source;
  zSource: Source;
  /** Present when this corner has a radius that could be solved. */
  arc?: SolvedArc;
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

/** One thing still unknown, with the ways the user can supply it (Gate D guided solving). */
export interface MissingItem {
  target: string;
  options: { text: string; /** form field id (e.g. `x2`, `z1`, `v0`, `len1`) when typing a value fixes it */ field?: string }[];
}

export interface ContourSolution {
  status: Status;
  points: SolvedPoint[];
  segments: SolvedSegment[];
  messages: ContourMessage[];
  /** Only on amber results: what is unknown and the shortest ways to resolve each item. */
  missing?: MissingItem[];
}

/** Agreement tolerance between two derivations of the same value, in mm. */
export const CONTOUR_TOL_MM = 1e-6;

/**
 * When length, diameter change AND angle are all given they are a trig relationship, and prints round.
 * They are accepted if they agree within this many mm of diameter change (0.0005 in); beyond that it is a conflict.
 */
export const CONTOUR_TRIG_TOL_MM = 0.0127;
