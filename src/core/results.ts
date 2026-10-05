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
  size: 'hero' | 'normal' | 'sub';
}

export interface ResultSection {
  title?: string;
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
