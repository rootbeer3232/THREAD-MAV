import { COARSE_METRIC } from './metric';

/**
 * Unified (inch) thread designation helpers: nominal sizes, common TPI choices, parsing.
 * This is a convenience list of common sizes/pitch pairs — it is NOT tolerance data
 * and carries no authority about acceptance limits.
 */

export interface UnifiedSize {
  /** Display label, e.g. "3/8" or "#10" */
  label: string;
  /** Basic major diameter, inch */
  major: number;
  /** Common threads-per-inch choices with their series tag. */
  pitches: { tpi: number; series: string }[];
}

const S = (label: string, major: number, p: [number, string][]): UnifiedSize => ({
  label,
  major,
  pitches: p.map(([tpi, series]) => ({ tpi, series })),
});

export const UNIFIED_SIZES: UnifiedSize[] = [
  S('#0', 0.06, [[80, 'UNF']]),
  S('#1', 0.073, [[64, 'UNC'], [72, 'UNF']]),
  S('#2', 0.086, [[56, 'UNC'], [64, 'UNF']]),
  S('#3', 0.099, [[48, 'UNC'], [56, 'UNF']]),
  S('#4', 0.112, [[40, 'UNC'], [48, 'UNF']]),
  S('#5', 0.125, [[40, 'UNC'], [44, 'UNF']]),
  S('#6', 0.138, [[32, 'UNC'], [40, 'UNF']]),
  S('#8', 0.164, [[32, 'UNC'], [36, 'UNF']]),
  S('#10', 0.19, [[24, 'UNC'], [32, 'UNF']]),
  S('#12', 0.216, [[24, 'UNC'], [28, 'UNF'], [32, 'UNEF']]),
  S('1/4', 0.25, [[20, 'UNC'], [28, 'UNF'], [32, 'UNEF']]),
  S('5/16', 0.3125, [[18, 'UNC'], [24, 'UNF'], [32, 'UNEF']]),
  S('3/8', 0.375, [[16, 'UNC'], [24, 'UNF'], [32, 'UNEF']]),
  S('7/16', 0.4375, [[14, 'UNC'], [20, 'UNF'], [28, 'UNEF']]),
  S('1/2', 0.5, [[13, 'UNC'], [20, 'UNF'], [28, 'UNEF']]),
  S('9/16', 0.5625, [[12, 'UNC'], [18, 'UNF'], [24, 'UNEF']]),
  S('5/8', 0.625, [[11, 'UNC'], [18, 'UNF'], [24, 'UNEF']]),
  S('11/16', 0.6875, [[24, 'UNEF']]),
  S('3/4', 0.75, [[10, 'UNC'], [16, 'UNF'], [20, 'UNEF']]),
  S('13/16', 0.8125, [[20, 'UNEF']]),
  S('7/8', 0.875, [[9, 'UNC'], [14, 'UNF'], [20, 'UNEF']]),
  S('15/16', 0.9375, [[20, 'UNEF']]),
  S('1', 1.0, [[8, 'UNC'], [12, 'UNF'], [20, 'UNEF']]),
  S('1-1/8', 1.125, [[7, 'UNC'], [12, 'UNF']]),
  S('1-1/4', 1.25, [[7, 'UNC'], [12, 'UNF']]),
  S('1-3/8', 1.375, [[6, 'UNC'], [12, 'UNF']]),
  S('1-1/2', 1.5, [[6, 'UNC'], [12, 'UNF']]),
  S('1-3/4', 1.75, [[5, 'UNC']]),
  S('2', 2.0, [[4.5, 'UNC']]),
];

export const UNIFIED_CLASSES_EXTERNAL = ['1A', '2A', '3A'] as const;
export const UNIFIED_CLASSES_INTERNAL = ['1B', '2B', '3B'] as const;

export function findUnifiedSize(label: string): UnifiedSize | undefined {
  return UNIFIED_SIZES.find((s) => s.label === label);
}

export function findUnifiedSizeByMajor(major: number): UnifiedSize | undefined {
  return UNIFIED_SIZES.find((s) => Math.abs(s.major - major) < 1e-9);
}

export function seriesFor(sizeLabel: string, tpi: number): string | undefined {
  return findUnifiedSize(sizeLabel)?.pitches.find((p) => Math.abs(p.tpi - tpi) < 1e-9)?.series;
}

/** "1-1/8" | "3/8" | "#10" | ".375" | "0.375" | "10" (number >= 1 treated as inches, e.g. "1") */
export function parseUnifiedSize(raw: string): { major: number; label: string } | null {
  const t = raw.trim().replace(/\s+/g, '');
  if (!t) return null;
  const numbered = /^#(\d+)$/.exec(t);
  if (numbered) {
    const hit = findUnifiedSize(`#${numbered[1]}`);
    return hit ? { major: hit.major, label: hit.label } : null;
  }
  const mixed = /^(\d+)-(\d+)\/(\d+)$/.exec(t);
  if (mixed) {
    const den = Number(mixed[3]);
    if (den === 0) return null;
    const major = Number(mixed[1]) + Number(mixed[2]) / den;
    return { major, label: t };
  }
  const frac = /^(\d+)\/(\d+)$/.exec(t);
  if (frac) {
    const den = Number(frac[2]);
    if (den === 0) return null;
    return { major: Number(frac[1]) / den, label: t };
  }
  if (/^(\d+\.?\d*|\.\d+)$/.test(t)) {
    const n = Number(t);
    return n > 0 ? { major: n, label: fmtDecimalLabel(n) } : null;
  }
  return null;
}

function fmtDecimalLabel(n: number): string {
  return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '');
}

export interface ParsedDesignation {
  system: 'unified' | 'metric';
  major: number; // inch for unified, mm for metric
  /** unified only: TPI. metric: undefined */
  tpi?: number;
  /** metric pitch (mm) or unified pitch derived (inch) */
  pitch: number;
  sizeLabel: string;
  /** Class typed with the designation, e.g. "2A" / "6g" (optional). */
  classLabel?: string;
}

/**
 * Quick-entry parser: "3/8-16", "#10-32", ".375-16", "1-1/8-7", "5/16-18 UNC", "M10x1.5", "M10 × 1.5", "M10".
 * Returns null when it can't be read unambiguously.
 */
export function parseDesignation(raw: string): ParsedDesignation | null {
  let t = raw.trim().toUpperCase().replace(/×/g, 'X').replace(/\s+/g, ' ');
  if (!t) return null;
  let typedClass: string | undefined;
  const mClass = /^(M.*?)[-\s]+(\d[GHEF])$/.exec(t);
  if (mClass) {
    t = mClass[1]!.trim();
    const raw = mClass[2]!;
    typedClass = raw.slice(0, 1) + (raw.slice(1) === 'H' ? 'H' : raw.slice(1).toLowerCase());
  }
  const uClass = !t.startsWith('M') ? /[-\s]+([123][AB])$/.exec(t) : null;
  if (uClass) {
    typedClass = uClass[1]!;
    t = t.slice(0, uClass.index).trim();
  }
  const metric = /^M\s*(\d+\.?\d*|\.\d+)\s*(?:X\s*(\d+\.?\d*|\.\d+))?/.exec(t);
  if (metric) {
    const d = Number(metric[1]);
    const pitch = metric[2] !== undefined ? Number(metric[2]) : coarseMetricPitch(d);
    if (!(d > 0) || pitch === undefined || !(pitch > 0)) return null;
    return { system: 'metric', major: d, pitch, sizeLabel: `M${trimNum(d)}`, ...(typedClass ? { classLabel: typedClass } : {}) };
  }
  t = t.replace(/\b(UNC|UNF|UNEF|UN|UNS|NC|NF)\b/g, '').replace(/[-\s]*$/, '').trim();
  // split at the LAST '-' : size on the left, TPI on the right
  const idx = t.lastIndexOf('-');
  if (idx <= 0) return null;
  const sizePart = t.slice(0, idx).trim();
  const tpiPart = t.slice(idx + 1).trim();
  if (!/^(\d+\.?\d*|\.\d+)$/.test(tpiPart)) return null;
  const tpi = Number(tpiPart);
  const size = parseUnifiedSize(sizePart);
  if (!size || !(tpi > 0)) return null;
  return { system: 'unified', major: size.major, tpi, pitch: 1 / tpi, sizeLabel: size.label, ...(typedClass ? { classLabel: typedClass } : {}) };
}

function trimNum(n: number): string {
  return String(Number(n.toFixed(4)));
}

function coarseMetricPitch(d: number): number | undefined {
  return COARSE_METRIC.find((m) => Math.abs(m.d - d) < 1e-9)?.pitch;
}
