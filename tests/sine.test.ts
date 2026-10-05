import { describe, expect, it } from 'vitest';
import { angleFromDms, solveAngle, solveStackHeight } from '../src/calculators/sine/engine';

const ok = <T>(r: { ok: boolean; value?: T }) => {
  expect(r.ok).toBe(true);
  return (r as { value: T }).value;
};

describe('sine bar — find stack height', () => {
  it('5.000" bar at 15° ≈ 1.2941" / 32.870 mm (validation case)', () => {
    const r = ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: 15 }));
    expect(r.stackHeight).toBeCloseTo(1.294095, 5);
    // NOTE: the spec's example quoted 32.868 mm; the exact value is 1.294095 × 25.4 = 32.870 mm.
    expect(r.stackHeight * 25.4).toBeCloseTo(32.870019, 5);
  });
  it('known angles', () => {
    expect(ok(solveStackHeight({ barLength: 10, unit: 'in', angleDeg: 30 })).stackHeight).toBeCloseTo(5, 12);
    expect(ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: 90 })).stackHeight).toBeCloseTo(5, 12);
    expect(ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: 0 })).stackHeight).toBe(0);
  });
  it('metric bar', () => {
    const r = ok(solveStackHeight({ barLength: 200, unit: 'mm', angleDeg: 30 }));
    expect(r.stackHeight).toBeCloseTo(100, 10);
  });
  it('rejects bad values with plain messages', () => {
    for (const bad of [
      { barLength: 0, unit: 'in' as const, angleDeg: 10 },
      { barLength: -5, unit: 'in' as const, angleDeg: 10 },
      { barLength: Number.NaN, unit: 'in' as const, angleDeg: 10 },
      { barLength: 5, unit: 'in' as const, angleDeg: -1 },
      { barLength: 5, unit: 'in' as const, angleDeg: 90.0001 },
      { barLength: 5, unit: 'in' as const, angleDeg: Number.NaN },
    ]) {
      const r = solveStackHeight(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]!.message.length).toBeGreaterThan(10);
    }
  });
  it('warns above 45°', () => {
    expect(ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: 50 })).advisories.length).toBe(1);
    expect(ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: 45 })).advisories.length).toBe(0);
  });
});

describe('sine bar — find angle', () => {
  it('round-trips with stack height', () => {
    for (const a of [0.5, 5, 15, 29.9999, 45, 60, 89]) {
      const stack = ok(solveStackHeight({ barLength: 5, unit: 'in', angleDeg: a })).stackHeight;
      expect(ok(solveAngle({ barLength: 5, unit: 'in', stackHeight: stack })).angleDeg).toBeCloseTo(a, 9);
    }
  });
  it('stack = bar length → 90°; zero → 0°', () => {
    expect(ok(solveAngle({ barLength: 5, unit: 'in', stackHeight: 5 })).angleDeg).toBeCloseTo(90, 9);
    expect(ok(solveAngle({ barLength: 5, unit: 'in', stackHeight: 0 })).angleDeg).toBe(0);
  });
  it('impossible geometry is explained', () => {
    const r = solveAngle({ barLength: 5, unit: 'in', stackHeight: 5.2 });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/Impossible geometry/);
  });
  it('negative stack rejected', () => {
    expect(solveAngle({ barLength: 5, unit: 'in', stackHeight: -1 }).ok).toBe(false);
  });
  it('DMS output is consistent', () => {
    const r = ok(solveAngle({ barLength: 5, unit: 'in', stackHeight: 1.294095 }));
    expect(r.angleDms.degrees).toBe(15);
    expect(r.angleDms.minutes).toBe(0);
  });
});

describe('sine bar — D/M/S entry', () => {
  it('converts valid entries', () => {
    expect(ok(angleFromDms(15, 30, 36))).toBeCloseTo(15 + 30 / 60 + 36 / 3600, 12);
  });
  it('rejects out-of-range parts', () => {
    expect(angleFromDms(15, 60, 0).ok).toBe(false);
    expect(angleFromDms(15, 0, 60).ok).toBe(false);
    expect(angleFromDms(15.5, 0, 0).ok).toBe(false);
    expect(angleFromDms(-1, 0, 0).ok).toBe(false);
    expect(angleFromDms(1, Number.NaN, 0).ok).toBe(false);
  });
});
