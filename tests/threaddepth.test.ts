import { describe, expect, it } from 'vitest';
import { solveThreadDepth, type ThreadDepthInput } from '../src/calculators/threaddepth/engine';

const base: ThreadDepthInput = { unit: 'in', pitch: 1 / 16, external: true, startDiameter: 0.75, depthOverride: null, passes: 8, firstDepth: null, angleDeg: 29.5 };
const run = (o: Partial<ThreadDepthInput> = {}) => {
  const r = solveThreadDepth({ ...base, ...o });
  if (!r.ok) throw new Error(JSON.stringify(r.issues));
  return r.value;
};

describe('thread depth / compound infeed', () => {
  it('external 3/4-16: depth = 0.613435 × P = .03834 in', () => {
    const r = run();
    expect(r.totalDepth).toBeCloseTo(0.613435 / 16, 6);
    expect(r.diaChange).toBeCloseTo(2 * 0.613435 / 16, 6);
  });
  it('internal depth = 0.541266 × P', () => {
    expect(run({ external: false }).totalDepth).toBeCloseTo(0.541266 / 16, 6);
  });
  it('metric M10×1.5 external: depth 0.9202 mm', () => {
    expect(run({ unit: 'mm', pitch: 1.5, startDiameter: 10 }).totalDepth).toBeCloseTo(0.920153, 5);
  });
  it('constant-area: cumulative depth = K·√(n/N), last pass lands exactly on K', () => {
    const r = run();
    expect(r.passes).toHaveLength(8);
    r.passes.forEach((p) => expect(p.depth).toBeCloseTo(r.totalDepth * Math.sqrt(p.n / 8), 12));
    expect(r.passes[7]!.depth).toBe(r.totalDepth);
  });
  it('passes get shallower: every cut smaller than the one before', () => {
    const c = run().passes.map((p) => p.cut);
    for (let k = 1; k < c.length; k++) expect(c[k]!).toBeLessThan(c[k - 1]!);
    expect(c.reduce((a, b) => a + b, 0)).toBeCloseTo(run().totalDepth, 12);
  });
  it('compound travel = depth / cos θ; Z shift = depth × tan θ', () => {
    const p = run({ angleDeg: 30 }).passes[7]!;
    expect(p.compound).toBeCloseTo(p.depth / Math.cos(Math.PI / 6), 12);
    expect(p.compound / p.depth).toBeCloseTo(1.1547005, 6);
    expect(p.zShift).toBeCloseTo(p.depth * Math.tan(Math.PI / 6), 12);
  });
  it('angle 0 = straight plunge', () => {
    const p = run({ angleDeg: 0 }).passes[3]!;
    expect(p.compound).toBe(p.depth);
    expect(p.zShift).toBe(0);
  });
  it('X goes down by 2×depth for external, up for internal', () => {
    const e = run();
    expect(e.finalX).toBeCloseTo(0.75 - e.diaChange, 12);
    const i = run({ external: false, startDiameter: 0.7 });
    expect(i.finalX).toBeCloseTo(0.7 + i.diaChange, 12);
  });
  it('first-pass depth → passes = ceil((K/D)²), first pass adjusted so the last hits K', () => {
    const K = (0.613435) / 16;
    const r = run({ passes: null, firstDepth: 0.01 });
    expect(r.passes).toHaveLength(Math.ceil((K / 0.01) ** 2));
    expect(r.derivedFromFirst).toBe(true);
    expect(r.passes[r.passes.length - 1]!.depth).toBeCloseTo(K, 6);
  });
  it('depth override is used as given', () => {
    expect(run({ depthOverride: 0.05 }).totalDepth).toBe(0.05);
  });
  it('rejects bad / ambiguous input', () => {
    expect(solveThreadDepth({ ...base, passes: null }).ok).toBe(false);
    expect(solveThreadDepth({ ...base, firstDepth: 0.01 }).ok).toBe(false);
    expect(solveThreadDepth({ ...base, pitch: 0 }).ok).toBe(false);
    expect(solveThreadDepth({ ...base, angleDeg: 60 }).ok).toBe(false);
    expect(solveThreadDepth({ ...base, passes: 2.5 }).ok).toBe(false);
  });
});
