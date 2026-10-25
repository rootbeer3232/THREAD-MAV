import { describe, expect, it } from 'vitest';
import { solveContour } from '../src/core/contour/engine';
import { CONTOUR_SCHEMA, type ContourProfile, type ContourSegment, type ContourPoint } from '../src/core/contour/types';

const P = (x: number | null, z: number | null): ContourPoint => ({ x, z });
const S = (kind: ContourSegment['kind'], value: number | null = null): ContourSegment => ({ kind, value });
const prof = (points: ContourPoint[], segments: ContourSegment[]): ContourProfile => ({ schema: CONTOUR_SCHEMA, side: 'od', points, segments });

describe('contour — straight segments', () => {
  it('straight with a length: diameter carries over, Z steps toward the chuck', () => {
    const r = solveContour(prof([P(50.8, 0), P(null, null)], [S('straight', 38.1)]));
    expect(r.status).toBe('green');
    expect(r.points[1]).toMatchObject({ x: 50.8, z: -38.1, xSource: 'solved', zSource: 'solved' });
  });
  it('zero is a real known value (Z0 at P0), unknown is null', () => {
    const r = solveContour(prof([P(50.8, 0), P(null, -10)], [S('straight')]));
    expect(r.status).toBe('green');
    expect(r.segments[0]).toMatchObject({ value: 10, source: 'solved' });
  });
  it('baseline Z values give the length', () => {
    const r = solveContour(prof([P(25.4, 0), P(null, -25.4)], [S('straight')]));
    expect(r.segments[0]!.value).toBeCloseTo(25.4, 12);
  });
  it('solves backward from a known far end', () => {
    const r = solveContour(prof([P(null, null), P(25.4, -50.8)], [S('straight', 25.4)]));
    expect(r.points[0]).toMatchObject({ x: 25.4, z: -25.4 });
  });
});

describe('contour — shoulders', () => {
  it('shoulder with a diameter change; Z carries over', () => {
    const r = solveContour(prof([P(50.8, -10), P(null, null)], [S('shoulder', -12.7)]));
    expect(r.points[1]!.x).toBeCloseTo(38.1, 9);
    expect(r.points[1]!.z).toBe(-10);
  });
  it('diameter change solved from two diameters (signed)', () => {
    const up = solveContour(prof([P(20, -5), P(30, null)], [S('shoulder')]));
    expect(up.segments[0]!.value).toBeCloseTo(10, 12);
    const down = solveContour(prof([P(30, -5), P(20, null)], [S('shoulder')]));
    expect(down.segments[0]!.value).toBeCloseTo(-10, 12);
  });
  it('stepped shaft from baseline dims (all from P0)', () => {
    const r = solveContour(
      prof([P(50.8, 0), P(null, -25.4), P(38.1, null), P(null, -63.5)], [S('straight'), S('shoulder'), S('straight')]),
    );
    expect(r.status).toBe('green');
    expect(r.points.map((p) => [p.x, p.z])).toEqual([[50.8, 0], [50.8, -25.4], [38.1, -25.4], [38.1, -63.5]]);
    expect(r.segments.map((s) => s.source)).toEqual(['solved', 'solved', 'solved']);
    expect(r.segments[1]!.value).toBeCloseTo(-12.7, 12);
  });
  it('ID side works the same (X still a diameter)', () => {
    const r = solveContour({ ...prof([P(25.4, 0), P(null, -20)], [S('straight')]), side: 'id' });
    expect(r.status).toBe('green');
  });
});

describe('contour — status: amber / red', () => {
  it('amber: not enough information, says what is missing', () => {
    const r = solveContour(prof([P(50.8, 0), P(null, null)], [S('straight')]));
    expect(r.status).toBe('amber');
    expect(r.messages.some((m) => m.level === 'amber' && /P2/.test(m.text))).toBe(true);
    expect(r.points[1]!.zSource).toBe('unknown');
  });
  it('amber when a diameter cannot be determined (shoulder with no change given)', () => {
    expect(solveContour(prof([P(50.8, 0), P(null, null), P(null, null)], [S('straight', 5), S('shoulder')])).status).toBe('amber');
    // …and a shoulder placed at a different Z than the straight ends is a genuine conflict
    expect(solveContour(prof([P(50.8, 0), P(null, null), P(null, -10)], [S('straight', 5), S('shoulder')])).status).toBe('red');
  });
  it('red: a straight whose two ends have different diameters', () => {
    expect(solveContour(prof([P(50.8, 0), P(50.0, -10)], [S('straight')])).status).toBe('red');
  });
  it('red: a given length that disagrees with the Z values', () => {
    expect(solveContour(prof([P(50.8, 0), P(null, -10)], [S('straight', 12)])).status).toBe('red');
  });
  it('red: a shoulder at two different Z values', () => {
    expect(solveContour(prof([P(50, -5), P(40, -6)], [S('shoulder')])).status).toBe('red');
  });
  it('red: negative diameter, solved or given', () => {
    expect(solveContour(prof([P(10, -5), P(null, null)], [S('shoulder', -20)])).status).toBe('red');
    expect(solveContour(prof([P(-1, 0), P(null, -5)], [S('straight')])).status).toBe('red');
  });
  it('red: straight running away from the chuck or with zero length', () => {
    expect(solveContour(prof([P(20, -10), P(null, -5)], [S('straight')])).status).toBe('red');
    expect(solveContour(prof([P(20, -10), P(null, -10)], [S('straight')])).status).toBe('red');
    expect(solveContour(prof([P(20, -10), P(null, null)], [S('straight', 0)])).status).toBe('red');
  });
  it('red: shoulder with no diameter change', () => {
    expect(solveContour(prof([P(20, -10), P(20, null)], [S('shoulder')])).status).toBe('red');
  });
  it('a conflict is reported once, not repeated every pass', () => {
    const r = solveContour(prof([P(50, -5), P(40, -6)], [S('shoulder')]));
    expect(r.messages.filter((m) => m.level === 'red').length).toBe(1);
  });
  it('red never reports solved coordinates as a result of a conflict', () => {
    const r = solveContour(prof([P(50.8, 0), P(50.0, -10)], [S('straight')]));
    expect(r.messages.some((m) => m.level === 'red')).toBe(true);
  });
  it('structural errors fail closed', () => {
    expect(solveContour(prof([P(1, 0)], [])).status).toBe('red');
    expect(solveContour(prof([P(1, 0), P(null, null)], [])).status).toBe('red');
    expect(solveContour({ ...prof([P(1, 0), P(null, null)], [S('straight', 1)]), schema: 99 as 2 }).status).toBe('red');
    expect(solveContour(prof([P(Number.NaN, 0), P(null, null)], [S('straight', 1)])).status).toBe('red');
  });
});

describe('contour — units and precision', () => {
  it('geometry is unit-independent: inch inputs converted exactly give the same physical answer', () => {
    const inch = solveContour(prof([P(2 * 25.4, 0), P(null, null)], [S('straight', 1.5 * 25.4)]));
    expect(inch.points[1]!.z).toBeCloseTo(-1.5 * 25.4, 12);
    expect(inch.points[1]!.z! / 25.4).toBeCloseTo(-1.5, 12);
  });
  it('inch → mm → inch round trip is lossless', () => {
    for (const v of [0.375, 1.2345, 0.0001, 12.00005]) expect((v * 25.4) / 25.4).toBeCloseTo(v, 14);
  });
  it('values within tolerance agree (no false conflict from float noise)', () => {
    expect(solveContour(prof([P(0.1 + 0.2, 0), P(0.3, -5)], [S('straight')])).status).toBe('green');
  });
  it('never produces NaN or Infinity', () => {
    const r = solveContour(prof([P(1e6, 0), P(null, -1e-3)], [S('straight')]));
    for (const p of r.points) for (const v of [p.x, p.z]) expect(v === null || Number.isFinite(v)).toBe(true);
  });
  it('large but legitimate profile (20 steps) solves', () => {
    const pts: ContourPoint[] = [P(50, 0)];
    const segs: ContourSegment[] = [];
    for (let i = 0; i < 20; i++) {
      segs.push(S(i % 2 ? 'shoulder' : 'straight', i % 2 ? -1 : 10));
      pts.push(P(null, null));
    }
    const r = solveContour(prof(pts, segs));
    expect(r.status).toBe('green');
  });
});

const T = (o: Partial<ContourSegment>): ContourSegment => ({ kind: 'taper', value: null, ...o });
const deg = (r: number) => (r * 180) / Math.PI;

describe('contour — tapers (Gate B2)', () => {
  it('45° taper: length .25 grows the diameter by .50 (radius .25)', () => {
    const r = solveContour(prof([P(25.4, 0), P(null, null)], [T({ length: 6.35, angle: 45, dir: 1 })]));
    expect(r.status).toBe('green');
    expect(r.points[1]!.x).toBeCloseTo(25.4 + 12.7, 9);
    expect(r.points[1]!.z).toBeCloseTo(-6.35, 12);
  });
  it('direction shrink gives a smaller diameter', () => {
    const r = solveContour(prof([P(50.8, 0), P(null, null)], [T({ length: 10, angle: 30, dir: -1 })]));
    expect(r.points[1]!.x).toBeCloseTo(50.8 - 2 * 10 * Math.tan((30 * Math.PI) / 180), 9);
  });
  it('angle from length and diameter change', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 25.4, dx: 5.08 })]));
    expect(r.segments[0]!.taper!.angle).toBeCloseTo(deg(Math.atan(5.08 / (2 * 25.4))), 9); // 5.7106°
    expect(r.segments[0]!.taper!.angleSource).toBe('solved');
    expect(r.points[1]!.x).toBeCloseTo(25.08, 9);
  });
  it('length from diameter change and angle', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ dx: 12.7, angle: 45 })]));
    expect(r.segments[0]!.taper!.length).toBeCloseTo(6.35, 9);
    expect(r.points[1]!.z).toBeCloseTo(-6.35, 9);
  });
  it('diameter change from end diameters, Z from baseline dims (print style)', () => {
    const r = solveContour(prof([P(20, 0), P(30, -10)], [T({ angle: null })]));
    expect(r.status).toBe('green');
    expect(r.segments[0]!.taper!.dx).toBeCloseTo(10, 12);
    expect(r.segments[0]!.taper!.angle).toBeCloseTo(deg(Math.atan(10 / 20)), 9);
  });
  it('solves backward from the far end', () => {
    const r = solveContour(prof([P(null, null), P(30, -10)], [T({ length: 10, dx: 10 })]));
    expect(r.points[0]).toMatchObject({ z: 0 });
    expect(r.points[0]!.x).toBeCloseTo(20, 9);
  });
  it('mixed straight → taper → shoulder → straight, all from P0', () => {
    const r = solveContour(prof([P(20, 0), P(null, -10), P(30, -20), P(null, null), P(null, -35)], [S('straight'), T({}), S('shoulder', -5), S('straight')]));
    expect(r.status).toBe('green');
    expect(r.points.map((p) => [p.x, p.z])).toEqual([[20, 0], [20, -10], [30, -20], [25, -20], [25, -35]]);
  });
  it('amber: angle and length but no direction or end diameter — asks for the direction', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 10, angle: 20 })]));
    expect(r.status).toBe('amber');
    expect(r.messages.some((m) => /BIGGER or SMALLER/.test(m.text))).toBe(true);
    expect(r.points[1]!.z).toBe(-10);
    expect(r.points[1]!.x).toBeNull();
  });
  it('amber: only one of length / dx / angle is known', () => {
    expect(solveContour(prof([P(20, 0), P(null, null)], [T({ angle: 20, dir: 1 })])).status).toBe('amber');
  });
  it('red: direction contradicts the diameters', () => {
    expect(solveContour(prof([P(20, 0), P(30, -10)], [T({ dir: -1 })])).status).toBe('red');
  });
  it('red: length, dx and angle that do not agree', () => {
    expect(solveContour(prof([P(20, 0), P(null, null)], [T({ length: 10, dx: 10, angle: 30 })])).status).toBe('red');
  });
  it('accepts rounded print values that agree within .0005"', () => {
    // 15° over 1.000": exact dx = .53590; print says .536 (rounded)
    const r = solveContour(prof([P(25.4, 0), P(null, null)], [T({ length: 25.4, dx: 0.536 * 25.4, angle: 15 })]));
    expect(r.status).toBe('green');
    expect(r.messages.some((m) => /print rounding/.test(m.text))).toBe(true);
  });
  it('red: 0° (that is a straight) and 90° (that is a shoulder)', () => {
    expect(solveContour(prof([P(20, 0), P(null, -5)], [T({ angle: 0, dx: 1 })])).status).toBe('red');
    expect(solveContour(prof([P(20, 0), P(null, null)], [T({ length: 5, angle: 90, dir: 1 })])).status).toBe('red');
  });
  it('red: zero length, no diameter change, negative length, negative diameter', () => {
    expect(solveContour(prof([P(20, 0), P(25, 0)], [T({})])).status).toBe('red');
    expect(solveContour(prof([P(20, 0), P(20, -5)], [T({})])).status).toBe('red');
    expect(solveContour(prof([P(20, -5), P(25, 0)], [T({})])).status).toBe('red');
    expect(solveContour(prof([P(10, 0), P(null, null)], [T({ length: 10, angle: 60, dir: -1 })])).status).toBe('red');
  });
  it('v1 (Test 1.5) saved profiles still solve', () => {
    expect(solveContour({ ...prof([P(20, 0), P(null, -5)], [S('straight')]), schema: 1 as 2 }).status).toBe('green');
  });
  it('never NaN/Infinity from taper math', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 1e-3, angle: 89.999, dir: 1 })]));
    for (const p of r.points) for (const v of [p.x, p.z]) expect(v === null || Number.isFinite(v)).toBe(true);
  });
});
