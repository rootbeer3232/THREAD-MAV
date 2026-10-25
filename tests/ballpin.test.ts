import { describe, expect, it } from 'vitest';
import { solveDovetail, solveVBall, type DovetailInput, type VBallInput } from '../src/calculators/ballpin/engine';

const dv = (o: Partial<DovetailInput>) => solveDovetail({ unit: 'in', kind: 'male', angleDeg: 60, pin: 0.25, width: 1, measurement: null, ...o });
const vb = (o: Partial<VBallInput>) => solveVBall({ unit: 'in', includedDeg: 90, ball: 0.5, opening: 0.5, height: null, ...o });
const val = <T>(r: { ok: true; value: T } | { ok: false }) => {
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('dovetail over / between pins', () => {
  it('60° male, Ø.250 pins, 1.000 at the corners → over pins 1.6830 (d·(1+cot30°) = .6830)', () => {
    const r = val(dv({}));
    expect(r.pinAllowance).toBeCloseTo(0.25 * (1 + Math.sqrt(3)), 12);
    expect(r.measurement).toBeCloseTo(1.6830127, 6);
  });
  it('60° female, 2.000 at the corners → between pins 1.3170', () => {
    expect(val(dv({ kind: 'female', width: 2 })).measurement).toBeCloseTo(1.3169873, 6);
  });
  it('reverse: measurement back to width (both kinds)', () => {
    expect(val(dv({ width: null, measurement: 1.6830127 })).width).toBeCloseTo(1, 6);
    expect(val(dv({ kind: 'female', width: null, measurement: 1.3169873 })).width).toBeCloseTo(2, 6);
  });
  it('45° dovetail uses cot(22.5°)', () => {
    expect(val(dv({ angleDeg: 45 })).pinAllowance).toBeCloseTo(0.25 * (1 + 1 / Math.tan(Math.PI / 8)), 12);
  });
  it('rejects ambiguous / impossible input', () => {
    expect(dv({ measurement: 2 }).ok).toBe(false);
    expect(dv({ width: null }).ok).toBe(false);
    expect(dv({ angleDeg: 90 }).ok).toBe(false);
    expect(dv({ kind: 'female', width: 0.5 }).ok).toBe(false);
  });
});

describe('ball / pin in a V or countersink', () => {
  it('90° countersink Ø.500, Ø.500 ball: top sits .3536 above the surface', () => {
    const r = val(vb({}));
    expect(r.height).toBeCloseTo(0.25 + 0.25 / Math.sin(Math.PI / 4) - 0.25, 12);
    expect(r.seats).toBe(true);
  });
  it('reverse: measured height back to the countersink diameter', () => {
    expect(val(vb({ opening: null, height: 0.3535534 })).opening).toBeCloseTo(0.5, 6);
  });
  it('82° countersink round-trips', () => {
    const h = val(vb({ includedDeg: 82, opening: 0.75 })).height;
    expect(val(vb({ includedDeg: 82, opening: null, height: h })).opening).toBeCloseTo(0.75, 9);
  });
  it('ball below the surface gives a negative height', () => {
    expect(val(vb({ ball: 0.2, opening: 1 })).height).toBeLessThan(0);
  });
  it('flags a ball too big to seat on the flanks', () => {
    expect(val(vb({ ball: 2, opening: 0.5 })).seats).toBe(false);
  });
  it('rejects ambiguous / impossible input', () => {
    expect(vb({ height: 0.1 }).ok).toBe(false);
    expect(vb({ includedDeg: 180 }).ok).toBe(false);
    expect(vb({ opening: null, height: 5 }).ok).toBe(false);
  });
});
