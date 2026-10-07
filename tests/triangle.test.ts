import { describe, expect, it } from 'vitest';
import { solveTriangle, type TriangleInput } from '../src/calculators/triangle/engine';

const T = (o: Partial<TriangleInput>): TriangleInput => ({ unit: 'in', rise: null, run: null, hyp: null, angleDeg: null, ...o });
const val = (i: TriangleInput) => {
  const r = solveTriangle(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('right triangle', () => {
  it('3-4-5', () => {
    const v = val(T({ rise: 3, run: 4 }));
    expect(v.hyp).toBeCloseTo(5, 12);
    expect(v.angleDeg).toBeCloseTo(36.8698976, 6);
    expect(v.complementDeg).toBeCloseTo(53.1301024, 6);
    expect(v.slope).toBeCloseTo(0.75, 12);
    expect(v.gradePercent).toBeCloseTo(75, 10);
  });
  it('every input pairing agrees with the same triangle (rise 5, run 8.660254, hyp 10, 30°)', () => {
    const run = 5 * Math.sqrt(3);
    const cases: Partial<TriangleInput>[] = [
      { rise: 5, run }, { rise: 5, hyp: 10 }, { run, hyp: 10 }, { rise: 5, angleDeg: 30 }, { run, angleDeg: 30 }, { hyp: 10, angleDeg: 30 },
    ];
    for (const c of cases) {
      const v = val(T(c));
      expect(v.rise).toBeCloseTo(5, 9);
      expect(v.run).toBeCloseTo(run, 9);
      expect(v.hyp).toBeCloseTo(10, 9);
      expect(v.angleDeg).toBeCloseTo(30, 9);
    }
  });
  it('angle + complement always total 90°', () => {
    for (const a of [1, 15, 45, 60, 89]) {
      const v = val(T({ hyp: 7, angleDeg: a }));
      expect(v.angleDeg + v.complementDeg).toBeCloseTo(90, 12);
    }
  });
  it('rejects too few / too many knowns', () => {
    expect(solveTriangle(T({ rise: 3 })).ok).toBe(false);
    expect(solveTriangle(T({})).ok).toBe(false);
    expect(solveTriangle(T({ rise: 3, run: 4, hyp: 5 })).ok).toBe(false);
  });
  it('rejects impossible geometry with an explanation', () => {
    for (const bad of [T({ rise: 6, hyp: 5 }), T({ rise: 5, hyp: 5 }), T({ run: 9, hyp: 5 })]) {
      const r = solveTriangle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]!.message).toMatch(/Impossible/);
    }
  });
  it('rejects zero, negative, NaN and angles outside 0–90', () => {
    for (const bad of [T({ rise: 0, run: 4 }), T({ rise: -1, run: 4 }), T({ rise: Number.NaN, run: 4 }), T({ rise: 3, angleDeg: 90 }), T({ rise: 3, angleDeg: 120 }), T({ rise: 3, angleDeg: 0 }), T({ angleDeg: 30, run: null })]) {
      expect(solveTriangle(bad).ok).toBe(false);
    }
  });
  it('two angles-only style input (angle + nothing) is refused', () => {
    expect(solveTriangle(T({ angleDeg: 30 })).ok).toBe(false);
  });
});
