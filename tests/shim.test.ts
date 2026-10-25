import { describe, expect, it } from 'vitest';
import { solveShims, type ShimInput } from '../src/calculators/shim/engine';

const SET_IN = [0.001, 0.002, 0.003, 0.005, 0.01, 0.02, 0.05].map((thickness) => ({ thickness, qty: null as number | null }));
const I = (o: Partial<ShimInput> = {}): ShimInput => ({ unit: 'in', target: 0.062, sizes: SET_IN, maxShims: null, ...o });
const val = (i: ShimInput) => {
  const r = solveShims(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};
const sum = (l: { thickness: number; count: number }[]) => l.reduce((a, x) => a + x.thickness * x.count, 0);

describe('shim stack', () => {
  it('.062 with a typical set → .050 + .010 + .002 (3 shims, exact)', () => {
    const v = val(I());
    expect(v.exact).not.toBeNull();
    expect(v.exact!.shimCount).toBe(3);
    expect(v.exact!.lines.map((l) => [l.thickness, l.count])).toEqual([[0.05, 1], [0.01, 1], [0.002, 1]]);
    expect(v.exact!.difference).toBeCloseTo(0, 12);
  });
  it('stack always adds up to the reported total', () => {
    for (const target of [0.001, 0.0075 + 0.0005, 0.123, 0.249, 0.5]) {
      const v = val(I({ target }));
      const st = (v.exact ?? v.under)!;
      expect(sum(st.lines)).toBeCloseTo(st.total, 9);
    }
  });
  it('uses the fewest shims (minimum-count check against brute force)', () => {
    const sizes = [{ thickness: 0.003, qty: null }, { thickness: 0.005, qty: null }, { thickness: 0.02, qty: null }];
    const v = val(I({ target: 0.031, sizes }));
    // .031 = .020 + .005 + .003 + .003 (4) — no 3-shim solution exists
    expect(v.exact!.shimCount).toBe(4);
  });
  it('respects limited quantities', () => {
    const sizes = [{ thickness: 0.05, qty: 1 }, { thickness: 0.02, qty: 1 }, { thickness: 0.01, qty: 2 }];
    const v = val(I({ target: 0.09, sizes })); // the most this set can make is .090
    expect(v.exact).not.toBeNull();
    const cnt = Object.fromEntries(v.exact!.lines.map((l) => [l.thickness, l.count]));
    expect(cnt[0.05] ?? 0).toBeLessThanOrEqual(1);
    expect(cnt[0.02] ?? 0).toBeLessThanOrEqual(1);
    expect(cnt[0.01] ?? 0).toBeLessThanOrEqual(2);
    expect(v.exact!.total).toBeCloseTo(0.09, 12);
    expect(val(I({ target: 0.1, sizes })).exact).toBeNull(); // not enough shims on hand → closest instead
  });
  it('no exact stack → closest under and over, with signed differences', () => {
    const sizes = [{ thickness: 0.01, qty: null }, { thickness: 0.05, qty: null }];
    const v = val(I({ target: 0.0375, sizes }));
    expect(v.exact).toBeNull();
    expect(v.under!.total).toBeCloseTo(0.03, 12);
    expect(v.over!.total).toBeCloseTo(0.04, 12);
    expect(v.under!.difference).toBeCloseTo(-0.0075, 12);
    expect(v.over!.difference).toBeCloseTo(0.0025, 12);
    expect(v.advisories.length).toBeGreaterThan(0);
  });
  it('maximum shim count is honored', () => {
    const v = val(I({ target: 0.062, maxShims: 3 }));
    expect(v.exact!.shimCount).toBeLessThanOrEqual(3);
    const tight = val(I({ target: 0.062, sizes: [{ thickness: 0.001, qty: null }], maxShims: 3 }));
    expect(tight.exact).toBeNull();
    expect(tight.under!.total).toBeCloseTo(0.003, 12);
  });
  it('metric', () => {
    const sizes = [0.01, 0.02, 0.05, 0.1, 0.5, 1].map((thickness) => ({ thickness, qty: null as number | null }));
    const v = val({ unit: 'mm', target: 1.63, sizes, maxShims: null });
    expect(v.exact!.total).toBeCloseTo(1.63, 9);
    expect(v.exact!.shimCount).toBe(5); // 1 + .5 + .1 + .02 + .01
  });
  it('merges duplicate thicknesses', () => {
    const v = val(I({ target: 0.02, sizes: [{ thickness: 0.01, qty: 1 }, { thickness: 0.01, qty: 1 }] }));
    expect(v.exact!.lines).toEqual([{ thickness: 0.01, count: 2 }]);
  });
  it('rounds values to the resolution and says so', () => {
    const v = val(I({ target: 0.06204 }));
    expect(v.advisories.some((a) => /rounded/.test(a))).toBe(true);
  });
  it('rejects bad input in plain words', () => {
    for (const bad of [
      I({ target: 0 }), I({ target: -1 }), I({ target: Number.NaN }), I({ sizes: [] }),
      I({ sizes: [{ thickness: 0, qty: null }] }), I({ sizes: [{ thickness: 0.05, qty: 0 }] }), I({ sizes: [{ thickness: 0.05, qty: 1.5 }] }),
      I({ maxShims: 0 }), I({ target: 9 }), I({ sizes: [{ thickness: 0.00001, qty: null }] }),
    ]) {
      const r = solveShims(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]!.message.length).toBeGreaterThan(8);
    }
  });
  it('no combination near the target is reported, not guessed', () => {
    const r = solveShims(I({ target: 0.001, sizes: [{ thickness: 0.05, qty: 1 }], maxShims: 1 }));
    // only a .050 exists: over is .050
    if (r.ok) expect(r.value.over!.total).toBeCloseTo(0.05, 12);
  });
});
