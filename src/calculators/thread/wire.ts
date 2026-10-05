/**
 * Three-wire measurement for symmetric 60° threads (half-angle α = 30°).
 *
 * Wire centre sits on the groove axis a height h above the pitch line:
 *   h = W/(2·sinα) − (P/4)·cotα
 * Measurement over three wires (one wire one side, two on the other):
 *   M = E + 2h + W = E + W·(1 + 1/sinα) − (P/2)·cotα
 * For α = 30°:  M = E + 3W − 0.866025·P
 *
 * Straight-flank (no lead-angle correction) formula; valid while the wire
 * touches the flanks inside the straight part of the profile (see wireFit).
 */
import { sharpVHeight } from './geometry';

const ALPHA = Math.PI / 6; // half-angle 30°
const SIN_A = Math.sin(ALPHA);
const COS_A = Math.cos(ALPHA);
const COT_A = COS_A / SIN_A;

/** Best wire: touches flanks exactly at the pitch line. W = P / (2·cos α) = 0.57735·P */
export function bestWire(pitch: number): number {
  return pitch / (2 * COS_A);
}

/** Measurement over wires for pitch diameter E and wire W. */
export function overWiresFromPitchDia(pitchDia: number, wire: number, pitch: number): number {
  return pitchDia + wire * (1 + 1 / SIN_A) - (pitch / 2) * COT_A;
}

/** Inverse: pitch diameter from a measurement over wires. */
export function pitchDiaFromOverWires(overWires: number, wire: number, pitch: number): number {
  return overWires - wire * (1 + 1 / SIN_A) + (pitch / 2) * COT_A;
}

export interface WireFit {
  /** Height of wire centre above the pitch line. */
  centreHeight: number;
  /** Radial position of the flank contact point relative to the pitch line (+ = toward major). */
  contactOffset: number;
  /** Smallest wire that still touches the straight flank (contact at root end of flank). */
  minContactWire: number;
  /** Largest wire that still touches the straight flank (contact at crest end of flank). */
  maxContactWire: number;
  /**
   * Smallest wire for which the micrometer anvil bears on the wires instead of
   * the thread crests (wire outer extreme reaches the basic major diameter).
   */
  minPracticalWire: number;
  /** wire touches the straight flank → formula is valid */
  contactsFlank: boolean;
  /** wire is large enough that the anvil rides on the wire, not the crest */
  anvilBearsOnWire: boolean;
}

export function wireFit(wire: number, pitch: number): WireFit {
  const H = sharpVHeight(pitch);
  const h = wire / (2 * SIN_A) - (pitch / 4) * COT_A;
  const t = -(pitch / 4) * SIN_A + h * COS_A; // distance along flank from pitch point
  const contactOffset = t * COS_A;
  // Straight flank spans −H/4 (basic external root) … +3H/8 (basic crest) about the pitch line.
  const lo = -H / 4;
  const hi = (3 * H) / 8;
  // contactOffset = 0.75·W − (cos α·... ) → solve linearly via two probes (formula is linear in W)
  const slope = (contactAt(2, pitch) - contactAt(1, pitch)) / 1;
  const base = contactAt(0, pitch);
  const wireAt = (y: number) => (y - base) / slope;
  const minContactWire = wireAt(lo);
  const maxContactWire = wireAt(hi);
  // outer extreme of wire: h + W/2 >= 3H/8
  const minPracticalWire = ((hi + (pitch / 4) * COT_A) / (1 / (2 * SIN_A) + 0.5));
  return {
    centreHeight: h,
    contactOffset,
    minContactWire,
    maxContactWire,
    minPracticalWire,
    contactsFlank: contactOffset >= lo - 1e-12 && contactOffset <= hi + 1e-12,
    anvilBearsOnWire: wire >= minPracticalWire - 1e-12,
  };
}

function contactAt(wire: number, pitch: number): number {
  const h = wire / (2 * SIN_A) - (pitch / 4) * COT_A;
  const t = -(pitch / 4) * SIN_A + h * COS_A;
  return t * COS_A;
}
