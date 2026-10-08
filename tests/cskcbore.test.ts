import { describe, expect, it } from 'vitest';
import { solveCounterbore, solveCountersink, type CountersinkInput } from '../src/calculators/cskcbore/engine';

const C = (o: Partial<CountersinkInput> = {}): CountersinkInput => ({ unit: 'in', includedAngleDeg: 90, solveFor: 'depth', csDia: 0.5, holeDia: 0.25, depth: null, ...o });
const val = (i: CountersinkInput) => {
  const r = solveCountersink(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('countersink', () => {
  it('90°: depth = (D − d)/2', () => expect(val(C()).depth).toBeCloseTo(0.125, 12));
  it('82°: depth = (D − d)/(2·tan 41°)', () => expect(val(C({ includedAngleDeg: 82 })).depth).toBeCloseTo(0.125 / Math.tan((41 * Math.PI) / 180), 12));
  it('depth to the point of a full cone = D/(2·tan(α/2))', () => {
    expect(val(C()).depthToPoint).toBeCloseTo(0.25, 12);
    expect(val(C({ includedAngleDeg: 120 })).depthToPoint).toBeCloseTo(0.5 / (2 * Math.tan(Math.PI / 3)), 12);
  });
  it('solve for diameter and hole, and round-trip', () => {
    expect(val(C({ solveFor: 'dia', csDia: null, holeDia: 0.25, depth: 0.1 })).csDia).toBeCloseTo(0.45, 12);
    expect(val(C({ solveFor: 'hole', csDia: 0.5, holeDia: null, depth: 0.2 })).holeDia).toBeCloseTo(0.1, 12);
    const a = val(C({ includedAngleDeg: 100 }));
    const b = val(C({ includedAngleDeg: 100, solveFor: 'dia', csDia: null, holeDia: 0.25, depth: a.depth }));
    expect(b.csDia).toBeCloseTo(0.5, 12);
  });
  it('too-deep cone is explained as impossible geometry', () => {
    const r = solveCountersink(C({ solveFor: 'hole', csDia: 0.5, holeDia: null, depth: 0.3 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/Impossible geometry/);
  });
  it('rejects bad input', () => {
    for (const bad of [C({ csDia: 0.2 }), C({ csDia: 0.25 }), C({ includedAngleDeg: 0 }), C({ includedAngleDeg: 180 }), C({ includedAngleDeg: Number.NaN }), C({ csDia: null }), C({ holeDia: -1 }), C({ solveFor: 'dia', csDia: null, holeDia: 0.25, depth: null })]) {
      expect(solveCountersink(bad).ok).toBe(false);
    }
  });
});

describe('counterbore', () => {
  const base = { unit: 'in' as const, headDia: 0.3125, headHeight: 0.25, diaClearance: 0, depthClearance: 0, holeDia: null, thickness: null };
  it('adds clearances to head size', () => {
    const r = solveCounterbore({ ...base, diaClearance: 0.02, depthClearance: 0.01 });
    if (!r.ok) throw new Error('solve');
    expect(r.value.cbDia).toBeCloseTo(0.3325, 12);
    expect(r.value.cbDepth).toBeCloseTo(0.26, 12);
  });
  it('ledge and remaining floor', () => {
    const r = solveCounterbore({ ...base, holeDia: 0.2, thickness: 0.5 });
    if (!r.ok) throw new Error('solve');
    expect(r.value.ledge).toBeCloseTo(0.05625, 12);
    expect(r.value.floor).toBeCloseTo(0.25, 12);
  });
  it('rejects impossible geometry', () => {
    expect(solveCounterbore({ ...base, thickness: 0.25 }).ok).toBe(false);
    expect(solveCounterbore({ ...base, holeDia: 0.4 }).ok).toBe(false);
    expect(solveCounterbore({ ...base, headDia: 0 }).ok).toBe(false);
    expect(solveCounterbore({ ...base, diaClearance: -0.1 }).ok).toBe(false);
    expect(solveCounterbore({ ...base, headHeight: Number.NaN }).ok).toBe(false);
  });
});
