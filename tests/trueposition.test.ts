import { describe, expect, it } from 'vitest';
import { solveTruePosition, type TruePositionInput } from '../src/calculators/trueposition/engine';

const base: TruePositionInput = { unit: 'in', nominalX: 1, nominalY: 2, actualX: 1.003, actualY: 2.004, tolerance: 0.012, mmc: null };
const ok = (i: TruePositionInput) => {
  const r = solveTruePosition(i);
  if (!r.ok) throw new Error('expected ok');
  return r.value;
};

describe('true position', () => {
  it('3-4-5: ΔX .003, ΔY .004 → radial .005, position Ø.010', () => {
    const r = ok(base);
    expect(r.dx).toBeCloseTo(0.003, 12);
    expect(r.dy).toBeCloseTo(0.004, 12);
    expect(r.radial).toBeCloseTo(0.005, 12);
    expect(r.position).toBeCloseTo(0.01, 12);
    expect(r.pass).toBe(true);
    expect(r.percentUsed).toBeCloseTo((0.01 / 0.012) * 100, 9);
    expect(r.remaining).toBeCloseTo(0.002, 12);
  });
  it('fails when the position exceeds the zone', () => {
    const r = ok({ ...base, tolerance: 0.008 });
    expect(r.pass).toBe(false);
    expect(r.remaining).toBeCloseTo(-0.002, 12);
  });
  it('exactly on the limit passes', () => {
    expect(ok({ ...base, tolerance: 0.01 }).pass).toBe(true);
  });
  it('negative deviations give the same position', () => {
    const r = ok({ ...base, actualX: 0.997, actualY: 1.996 });
    expect(r.position).toBeCloseTo(0.01, 12);
    expect(r.dx).toBeLessThan(0);
  });
  it('MMC hole: bonus = actual − MMC size, can rescue an RFS failure', () => {
    const rfs = ok({ ...base, tolerance: 0.008 });
    expect(rfs.pass).toBe(false);
    const m = ok({ ...base, tolerance: 0.008, mmc: { feature: 'hole', mmcSize: 0.25, actualSize: 0.254 } });
    expect(m.bonus).toBeCloseTo(0.004, 12);
    expect(m.allowed).toBeCloseTo(0.012, 12);
    expect(m.pass).toBe(true);
  });
  it('MMC pin: bonus = MMC (largest) − actual', () => {
    const m = ok({ ...base, tolerance: 0.008, mmc: { feature: 'pin', mmcSize: 0.25, actualSize: 0.246 } });
    expect(m.bonus).toBeCloseTo(0.004, 12);
  });
  it('size past MMC gives no bonus and a flag (never a negative bonus)', () => {
    const m = ok({ ...base, mmc: { feature: 'hole', mmcSize: 0.25, actualSize: 0.249 } });
    expect(m.bonus).toBe(0);
    expect(m.sizePastMmc).toBe(true);
  });
  it('metric works the same (units are just carried)', () => {
    const r = ok({ unit: 'mm', nominalX: 10, nominalY: 10, actualX: 10.06, actualY: 10.08, tolerance: 0.25, mmc: null });
    expect(r.position).toBeCloseTo(0.2, 12);
    expect(r.pass).toBe(true);
  });
  it('rejects bad input', () => {
    expect(solveTruePosition({ ...base, tolerance: 0 }).ok).toBe(false);
    expect(solveTruePosition({ ...base, actualX: Number.NaN }).ok).toBe(false);
    expect(solveTruePosition({ ...base, mmc: { feature: 'hole', mmcSize: 0, actualSize: 1 } }).ok).toBe(false);
  });
});
