import { describe, expect, it } from 'vitest';
import { solveTaper, type TaperInput } from '../src/calculators/taper/engine';
import { solveDrillPoint } from '../src/calculators/drillpoint/engine';

const T = (o: Partial<TaperInput>): TaperInput => ({ unit: 'in', large: null, small: null, length: null, taper: null, taperKind: 'perUnit', partLength: null, ...o });
const val = (i: TaperInput) => {
  const r = solveTaper(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('taper', () => {
  it('D 1.0, d 0.5, L 10 → .05/in, .6/ft, 1:20, 2.8642° included', () => {
    const v = val(T({ large: 1, small: 0.5, length: 10 }));
    expect(v.perUnit).toBeCloseTo(0.05, 12);
    expect(v.perFoot).toBeCloseTo(0.6, 12);
    expect(v.per100).toBeCloseTo(5, 10);
    expect(v.ratio).toBeCloseTo(20, 10);
    expect(v.includedDeg).toBeCloseTo(2.8642, 4);
    expect(v.perSideDeg).toBeCloseTo(1.4321, 4);
    expect(v.solved).toEqual(['taper']);
  });
  it('solves the missing length / small / large from the taper', () => {
    expect(val(T({ large: 1, small: 0.5, taper: 0.05 })).length).toBeCloseTo(10, 10);
    expect(val(T({ large: 1, length: 10, taper: 0.05 })).small).toBeCloseTo(0.5, 12);
    expect(val(T({ small: 0.5, length: 10, taper: 0.05 })).large).toBeCloseTo(1, 12);
  });
  it('every taper kind describes the same taper', () => {
    const base = val(T({ large: 1, small: 0.5, length: 10 }));
    const kinds: [number, TaperInput['taperKind']][] = [[0.05, 'perUnit'], [0.6, 'perFoot'], [5, 'per100'], [base.includedDeg, 'included'], [base.perSideDeg, 'perSide']];
    for (const [value, kind] of kinds) expect(val(T({ large: 1, small: 0.5, taper: value, taperKind: kind })).length).toBeCloseTo(10, 8);
  });
  it('metric works unit-agnostically', () => expect(val(T({ unit: 'mm', large: 30, small: 20, length: 100 })).perUnit).toBeCloseTo(0.1, 12));
  it('tailstock set-over = (D−d)/2 × (part length ÷ taper length)', () => expect(val(T({ large: 1, small: 0.5, length: 10, partLength: 20 })).setOver).toBeCloseTo(0.5, 12));
  it('explains impossible geometry', () => {
    const r = solveTaper(T({ large: 1, length: 30, taper: 0.05 }));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/Impossible geometry/);
  });
  it('rejects bad / ambiguous input', () => {
    for (const bad of [T({}), T({ large: 1 }), T({ large: 1, small: 0.5 }), T({ large: 1, small: 0.5, length: 10, taper: 0.05 }), T({ large: 0.5, small: 1, length: 10 }), T({ large: 1, small: 1, length: 10 }), T({ large: -1, small: 0.5, length: 10 }), T({ large: Number.NaN, small: 0.5, length: 10 }), T({ large: 1, small: 0.5, taper: 200, taperKind: 'included' }), T({ large: 1, small: 0.5, taper: 95, taperKind: 'perSide' }), T({ large: 1, small: 0.5, length: 10, partLength: 0 })]) {
      expect(solveTaper(bad).ok).toBe(false);
    }
  });
});

describe('drill point depth', () => {
  it('118°: 0.5" drill → .1502"; 135°: .1036"', () => {
    const a = solveDrillPoint({ unit: 'in', diameter: 0.5, includedAngleDeg: 118, holeDepth: null });
    const b = solveDrillPoint({ unit: 'in', diameter: 0.5, includedAngleDeg: 135, holeDepth: null });
    if (!a.ok || !b.ok) throw new Error('solve');
    expect(a.value.pointDepth).toBeCloseTo(0.25 / Math.tan((59 * Math.PI) / 180), 12);
    expect(a.value.pointDepth).toBeCloseTo(0.1502, 4);
    expect(b.value.pointDepth).toBeCloseTo(0.1036, 4);
  });
  it('180° flat would be zero; 90° point = radius', () => {
    const r = solveDrillPoint({ unit: 'in', diameter: 1, includedAngleDeg: 90, holeDepth: null });
    if (!r.ok) throw new Error('solve');
    expect(r.value.pointDepth).toBeCloseTo(0.5, 12);
  });
  it('total depth = hole depth + point depth', () => {
    const r = solveDrillPoint({ unit: 'mm', diameter: 10, includedAngleDeg: 118, holeDepth: 25 });
    if (!r.ok) throw new Error('solve');
    expect(r.value.totalDepth).toBeCloseTo(25 + 5 / Math.tan((59 * Math.PI) / 180), 10);
  });
  it('rejects bad input', () => {
    for (const bad of [{ diameter: 0, includedAngleDeg: 118, holeDepth: null }, { diameter: 1, includedAngleDeg: 180, holeDepth: null }, { diameter: 1, includedAngleDeg: 0, holeDepth: null }, { diameter: Number.NaN, includedAngleDeg: 118, holeDepth: null }, { diameter: 1, includedAngleDeg: 118, holeDepth: -2 }]) {
      expect(solveDrillPoint({ unit: 'in', ...bad }).ok).toBe(false);
    }
  });
});
