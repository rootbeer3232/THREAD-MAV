/** UI-independent result model produced by calculator presenters. */
import type { DualLength } from './units';

export type Tone = 'verified' | 'manual' | 'custom' | 'geometry' | 'warn' | 'info';

export interface Tag {
  text: string;
  tone: Tone;
}

export interface ResultRow {
  label: string;
  /** A length shown in both systems. */
  dual?: DualLength;
  /** Extra decimals beyond the user's setting (e.g. best wire). */
  extraDecimals?: number;
  /** Plain value (angles, counts, text). */
  text?: string;
  /** Equivalent for plain values (e.g. D/M/S, TPI). */
  altText?: string;
  tag?: Tag;
  hint?: string;
  /** Override the inch/metric decimals for non-length pairs (e.g. SFM | m/min). */
  fmt?: { a: number; b: number };
  /** Unit symbols for the two values when they are not in / mm. */
  syms?: [string, string];
  /** A coordinate pair, shown as hole / X / Y with both unit systems. */
  xy?: { angle: string; x: DualLength; y: DualLength };
  /** Hero box captions when not INCHES / MILLIMETERS. */
  heroCaps?: [string, string];
  size: 'hero' | 'normal' | 'sub';
}

export interface ResultSection {
  title?: string;
  /** Column headers when the two values are not in / mm. */
  cols?: [{ t: string; s: string }, { t: string; s: string }];
  rows: ResultRow[];
}

export interface Presentation {
  /** e.g. "3/8-16 UNC" */
  title: string;
  /** e.g. "Class 2A · External" */
  subtitle: string;
  badges: Tag[];
  sections: ResultSection[];
  /** Notes / advisories shown below the numbers. */
  messages: { tone: Tone; text: string }[];
}
