import { describe, expect, it } from 'vitest';
import { solveBoltCircle, type BoltCircleInput } from '../src/calculators/boltcircle/engine';

const B = (o: Partial<BoltCircleInput> = {}): BoltCircleInput => ({ unit: 'in', diameter: 4, holes: 4, startDeg: 0, clockwise: false, centerX: 0, centerY: 0, ...o });
const val = (i: BoltCircleInput) => {
  const r = solveBoltCircle(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('bolt circle', () => {
  it('4 holes on a 4" circle land exactly on the axes (no 1e-16 noise)', () => {
    const v = val(B());
    expect(v.holes.map((h) => [h.x, h.y])).toEqual([[2, 0], [0, 2], [-2, 0], [0, -2]]);
    expect(v.holes.map((h) => h.angleDeg)).toEqual([0, 90, 180, 270]);
  });
  it('6 holes on a 3" circle: hole 2 at 60° = (0.75, 1.299038)', () => {
    const h = val(B({ diameter: 3, holes: 6 })).holes[1]!;
    expect(h.angleDeg).toBeCloseTo(60, 12);
    expect(h.x).toBeCloseTo(0.75, 12);
    expect(h.y).toBeCloseTo(1.299038106, 8);
  });
  it('every hole is exactly R from the center and equally spaced', () => {
    const v = val(B({ diameter: 7.5, holes: 7, startDeg: 13.3, centerX: 1.25, centerY: -2.5 }));
    for (const h of v.holes) expect(Math.hypot(h.x - 1.25, h.y + 2.5)).toBeCloseTo(3.75, 10);
    const d = v.holes.map((h, i) => Math.hypot(h.x - v.holes[(i + 1) % 7]!.x, h.y - v.holes[(i + 1) % 7]!.y));
    d.forEach((x) => expect(x).toBeCloseTo(v.chord, 10));
  });
  it('chord = 2R·sin(π/N)', () => expect(val(B({ diameter: 10, holes: 5 })).chord).toBeCloseTo(10 * Math.sin(Math.PI / 5), 12));
  it('start angle and clockwise direction', () => {
    const ccw = val(B({ startDeg: 45 })).holes;
    expect(ccw[0]!.x).toBeCloseTo(Math.SQRT2, 12);
    expect(ccw[1]!.angleDeg).toBeCloseTo(135, 12);
    const cw = val(B({ startDeg: 45, clockwise: true })).holes;
    expect(cw[1]!.angleDeg).toBeCloseTo(315, 12);
    expect(cw[1]!.y).toBeCloseTo(-Math.SQRT2, 12);
  });
  it('center offset shifts every hole; negative start angles wrap', () => {
    const v = val(B({ centerX: 10, centerY: 5, startDeg: -90 }));
    expect(v.holes[0]!.x).toBeCloseTo(10, 12);
    expect(v.holes[0]!.y).toBeCloseTo(3, 12);
    expect(v.holes[0]!.angleDeg).toBeCloseTo(270, 12);
  });
  it('single hole is allowed', () => expect(val(B({ holes: 1 })).holes.length).toBe(1));
  it('metric works the same math', () => expect(val(B({ unit: 'mm', diameter: 100, holes: 8 })).holes[1]!.x).toBeCloseTo(50 * Math.SQRT1_2, 10));
  it('rejects invalid input', () => {
    for (const bad of [B({ diameter: 0 }), B({ diameter: -3 }), B({ holes: 0 }), B({ holes: 2.5 }), B({ holes: 361 }), B({ startDeg: Number.NaN }), B({ diameter: Number.NaN }), B({ centerX: Infinity })]) {
      const r = solveBoltCircle(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]!.message.length).toBeGreaterThan(10);
    }
  });
});
