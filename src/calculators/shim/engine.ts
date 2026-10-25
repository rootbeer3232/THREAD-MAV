/**
 * Shim / spacer stack: choose the FEWEST shims from the machinist's own inventory that add up to a
 * required thickness. Exact integer arithmetic on a fixed resolution (0.0001 in / 0.001 mm) so
 * floating-point noise never decides whether a stack is "exact".
 *
 * If no exact stack exists, the closest stack just under and just over the target are reported.
 */
import { type CalcIssue, type Result, fail, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

export interface ShimSize {
  /** Thickness in the working unit. */
  thickness: number;
  /** How many of this size are on hand; null = as many as needed. */
  qty: number | null;
}

export interface ShimInput {
  unit: Unit;
  target: number;
  sizes: ShimSize[];
  /** Optional cap on the number of shims in the stack. */
  maxShims: number | null;
}

export interface ShimLine {
  thickness: number;
  count: number;
}

export interface ShimStack {
  lines: ShimLine[];
  total: number;
  shimCount: number;
  /** total − target (negative = under). */
  difference: number;
}

export interface ShimResult {
  unit: Unit;
  target: number;
  resolution: number;
  exact: ShimStack | null;
  under: ShimStack | null;
  over: ShimStack | null;
  advisories: string[];
}

const RES = { in: 1e-4, mm: 1e-3 } as const;
/** Practical cap on identical shims when quantity is "as many as needed". */
const FREE_QTY_CAP = 25;
const MAX_TICKS = 50_000;
const INF = 65_535;

export function solveShims(inp: ShimInput): Result<ShimResult> {
  const res = RES[inp.unit];
  const issues: CalcIssue[] = [];
  const toTicks = (x: number) => Math.round(x / res);
  const advisories: string[] = [];
  const rounded = (x: number) => Math.abs(x / res - Math.round(x / res)) > 1e-6;

  if (!Number.isFinite(inp.target) || inp.target <= 0) issues.push({ field: 'target', message: 'The required stack thickness must be greater than zero.' });
  if (!inp.sizes.length) issues.push({ field: 'sizes', message: 'Add at least one shim thickness you have on hand.' });
  inp.sizes.forEach((s, i) => {
    if (!Number.isFinite(s.thickness) || s.thickness <= 0) issues.push({ field: `size${i}`, message: 'Shim thickness must be greater than zero.' });
    else if (toTicks(s.thickness) < 1) issues.push({ field: `size${i}`, message: `That shim is thinner than this tool’s resolution (${res}).` });
    if (s.qty !== null && (!Number.isInteger(s.qty) || s.qty < 1)) issues.push({ field: `qty${i}`, message: 'Quantity must be a whole number of 1 or more (or blank for any).' });
  });
  if (inp.maxShims !== null && (!Number.isInteger(inp.maxShims) || inp.maxShims < 1)) issues.push({ field: 'maxShims', message: 'Maximum shims must be a whole number of 1 or more.' });
  if (issues.length) return failMany(issues);

  const targetTicks = toTicks(inp.target);
  if (targetTicks < 1) return fail(`That stack is thinner than this tool’s resolution (${res}).`, 'target');
  if (targetTicks > MAX_TICKS) return fail(`That stack is too tall for this tool (limit ${(MAX_TICKS * res).toFixed(inp.unit === 'in' ? 1 : 0)} ${inp.unit}).`, 'target');
  if (rounded(inp.target) || inp.sizes.some((s) => rounded(s.thickness))) {
    advisories.push(`Values were rounded to ${res} ${inp.unit} for the calculation.`);
  }

  // merge duplicate thicknesses, largest first (prefers fewer, thicker shims)
  const merged = new Map<number, number | null>();
  for (const s of inp.sizes) {
    const t = toTicks(s.thickness);
    const prev = merged.get(t);
    merged.set(t, prev === undefined ? s.qty : prev === null || s.qty === null ? null : prev + s.qty);
  }
  const denoms = [...merged.entries()].sort((a, b) => b[0] - a[0]).map(([ticks, qty]) => ({ ticks, qty: Math.min(qty ?? FREE_QTY_CAP, qty === null ? FREE_QTY_CAP : qty) }));
  const K = denoms.length;
  const dmax = denoms[0]!.ticks;
  const T = targetTicks + dmax;

  // dp[k][t] = fewest shims using the first k sizes to make exactly t ticks
  const W = T + 1;
  const dp = new Uint16Array((K + 1) * W).fill(INF);
  const choice = new Uint8Array((K + 1) * W);
  dp[0] = 0;
  for (let k = 1; k <= K; k++) {
    const d = denoms[k - 1]!;
    for (let t = 0; t <= T; t++) {
      let best = INF;
      let bc = 0;
      const maxC = Math.min(d.qty, Math.floor(t / d.ticks));
      for (let c = 0; c <= maxC; c++) {
        const prev = dp[(k - 1) * W + (t - c * d.ticks)]!;
        if (prev !== INF && prev + c <= best) {
          best = prev + c;
          bc = c;
        }
      }
      dp[k * W + t] = best;
      choice[k * W + t] = bc;
    }
  }

  const cap = inp.maxShims ?? INF - 1;
  const reachable = (t: number) => dp[K * W + t]! <= cap;
  const build = (t: number): ShimStack => {
    const lines: ShimLine[] = [];
    let rem = t;
    for (let k = K; k >= 1; k--) {
      const c = choice[k * W + rem]!;
      if (c > 0) lines.push({ thickness: denoms[k - 1]!.ticks * res, count: c });
      rem -= c * denoms[k - 1]!.ticks;
    }
    lines.sort((a, b) => b.thickness - a.thickness);
    const shimCount = lines.reduce((a, l) => a + l.count, 0);
    return { lines, total: t * res, shimCount, difference: (t - targetTicks) * res };
  };

  if (reachable(targetTicks)) {
    return ok({ unit: inp.unit, target: targetTicks * res, resolution: res, exact: build(targetTicks), under: null, over: null, advisories });
  }
  let under: ShimStack | null = null;
  for (let t = targetTicks - 1; t >= 1; t--) if (reachable(t)) { under = build(t); break; }
  let over: ShimStack | null = null;
  for (let t = targetTicks + 1; t <= T; t++) if (reachable(t)) { over = build(t); break; }
  if (!under && !over) {
    return fail(inp.maxShims !== null ? 'No stack of that few shims gets close. Allow more shims or add thicker sizes.' : 'No combination of the shims you listed can make a stack near that thickness.');
  }
  advisories.push('No exact stack is possible with these shims. The closest stacks just under and just over are shown.');
  return ok({ unit: inp.unit, target: targetTicks * res, resolution: res, exact: null, under, over, advisories });
}
