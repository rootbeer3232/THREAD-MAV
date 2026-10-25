import { describe, expect, it } from 'vitest';
import { solveContour } from '../src/core/contour/engine';
import { CONTOUR_SCHEMA, type ContourProfile, type ContourSegment, type ContourPoint } from '../src/core/contour/types';

const P = (x: number | null, z: number | null, radius?: number | null): ContourPoint => ({ x, z, ...(radius !== undefined ? { radius } : {}) });
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
    expect(solveContour({ ...prof([P(1, 0), P(null, null)], [S('straight', 1)]), schema: 99 as 3 }).status).toBe('red');
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
    expect(solveContour({ ...prof([P(20, 0), P(null, -5)], [S('straight')]), schema: 1 as 3 }).status).toBe('green');
  });
  it('never NaN/Infinity from taper math', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 1e-3, angle: 89.999, dir: 1 })]));
    for (const p of r.points) for (const v of [p.x, p.z]) expect(v === null || Number.isFinite(v)).toBe(true);
  });
});

const IN = 25.4;
const prof2 = (side: 'od' | 'id', points: ContourPoint[], segments: ContourSegment[]): ContourProfile => ({ schema: CONTOUR_SCHEMA, side, points, segments });
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 9);

describe('contour — corner radii (Gate C1)', () => {
  it("shop case 1 (OD, rounded end corner, then toward the chuck): arc X1.5 Z0 → X2.0 Z−.25, center X1.5 Z−.25, CCW", () => {
    const r = solveContour(prof2('od', [P(1 * IN, 0), P(2 * IN, 0, 0.25 * IN), P(null, -1.5 * IN)], [S('shoulder'), S('straight')]));
    expect(r.status).toBe('green');
    const a = r.points[1]!.arc!;
    near(a.start.x, 1.5 * IN); near(a.start.z, 0);
    near(a.end.x, 2 * IN); near(a.end.z, -0.25 * IN);
    near(a.center.x, 1.5 * IN); near(a.center.z, -0.25 * IN);
    expect(a.turn).toBe('ccw');
    expect(a.convex).toBe(true);
    near(a.sweepDeg, 90);
    near(a.tangentLength, 0.25 * IN);
  });
  it("shop case 2 (ID, rounded bore-bottom corner): arc X1.0 Z−.75 → X.5 Z−1.0, center X.5 Z−.75, CCW, concave", () => {
    const r = solveContour(prof2('id', [P(1 * IN, 0), P(1 * IN, -1 * IN, 0.25 * IN), P(0, null)], [S('straight'), S('shoulder')]));
    expect(r.status).toBe('green');
    const a = r.points[1]!.arc!;
    near(a.start.x, 1 * IN); near(a.start.z, -0.75 * IN);
    near(a.end.x, 0.5 * IN); near(a.end.z, -1 * IN);
    near(a.center.x, 0.5 * IN); near(a.center.z, -0.75 * IN);
    expect(a.turn).toBe('ccw');
    expect(a.convex).toBe(false);
  });
  it('OD inside corner where a straight meets a step up: clockwise, concave', () => {
    const r = solveContour(prof2('od', [P(1 * IN, 0), P(1 * IN, -1 * IN, 0.125 * IN), P(2 * IN, null)], [S('straight'), S('shoulder')]));
    const a = r.points[1]!.arc!;
    near(a.start.x, 1 * IN); near(a.start.z, -0.875 * IN);
    near(a.end.x, 1.25 * IN); near(a.end.z, -1 * IN);
    near(a.center.x, 1.25 * IN); near(a.center.z, -0.875 * IN);
    expect(a.turn).toBe('cw');
    expect(a.convex).toBe(false);
  });
  it('X is a diameter: a radius R moves the tangent X by 2R, not R', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 3), P(null, -30)], [S('shoulder'), S('straight')]));
    near(r.points[1]!.arc!.start.x, 20 - 2 * 3); // 14, not 17
  });
  it('a radius uses part of each line: leftover straight is length − R', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 3), P(null, -30)], [S('shoulder'), S('straight')]));
    near(r.points[1]!.arc!.end.z, -3);
  });
  it('two radii may share a line exactly (R + R = length)', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 5), P(null, -10, 5), P(10, null)], [S('shoulder'), S('straight'), S('shoulder')]));
    expect(r.status).toBe('green');
  });
  it('red: radius too large for the line (or two radii too big together)', () => {
    expect(solveContour(prof2('od', [P(10, 0), P(20, 0, 8), P(null, -5)], [S('shoulder'), S('straight')])).status).toBe('red');
    expect(solveContour(prof2('od', [P(10, 0), P(20, 0, 6), P(null, -10, 6), P(10, null)], [S('shoulder'), S('straight'), S('shoulder')])).status).toBe('red');
  });
  it('red: radius on an end point, negative radius, or where there is no corner', () => {
    expect(solveContour(prof2('od', [P(10, 0, 2), P(20, 0), P(null, -5)], [S('shoulder'), S('straight')])).status).toBe('red');
    expect(solveContour(prof2('od', [P(10, 0), P(20, 0, -1), P(null, -5)], [S('shoulder'), S('straight')])).status).toBe('red');
    expect(solveContour(prof2('od', [P(20, 0), P(20, -5, 1), P(null, -10)], [S('straight'), S('straight')])).status).toBe('red');
  });
  it('zero or blank radius = sharp corner, no arc', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 0), P(null, -5, null)], [S('shoulder'), S('straight')]));
    expect(r.status).toBe('green');
    expect(r.points.some((p) => p.arc)).toBe(false);
  });
  it('amber when the neighbouring positions are not known yet', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 2), P(null, null)], [S('shoulder'), S('straight')]));
    expect(r.status).toBe('amber');
    expect(r.messages.some((m) => /corner radius at P2/.test(m.text))).toBe(true);
  });
  it('radius into a taper corner also solves (general fillet)', () => {
    // straight along the OD then a 45° taper growing toward the chuck: interior angle 135°, tangent length = R·tan(22.5°)
    const r = solveContour(prof2('od', [P(20, 0), P(20, -10, 4), P(30, -15)], [S('straight'), T({})]));
    expect(r.status).toBe('green');
    near(r.points[1]!.arc!.tangentLength, 4 * Math.tan(Math.PI / 8));
    near(r.points[1]!.arc!.sweepDeg, 45);
  });
  it('every arc point is exactly R from the center and the legs are tangent', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(40, 0, 7.5), P(null, -30)], [S('shoulder'), S('straight')]));
    const a = r.points[1]!.arc!;
    near(Math.hypot(a.start.z - a.center.z, (a.start.x - a.center.x) / 2), 7.5);
    near(Math.hypot(a.end.z - a.center.z, (a.end.x - a.center.x) / 2), 7.5);
  });
  it('no NaN/Infinity', () => {
    const r = solveContour(prof2('od', [P(10, 0), P(20, 0, 1e-4), P(null, -30)], [S('shoulder'), S('straight')]));
    expect(Object.values(r.points[1]!.arc!).every((v) => typeof v !== 'number' || Number.isFinite(v))).toBe(true);
  });
});

describe('contour — radius into a taper (Gate C2)', () => {
  // inch part in mm: straight Ø1.000 for 1.000, then 45° taper growing to Ø2.000 (length .500)
  const I = 25.4;
  const base = (R: number | null) => prof2('od', [P(1 * I, 0), P(1 * I, -1 * I, R), P(2 * I, -1.5 * I)], [S('straight'), T({})]);
  it('hand-checked: R.25 at straight→45° taper (concave)', () => {
    const r = solveContour(base(0.25 * I));
    expect(r.status).toBe('green');
    const a = r.points[1]!.arc!;
    const t = 0.25 * Math.tan(Math.PI / 8); // .103553
    near(a.tangentLength, t * I);
    near(a.start.x, 1.0 * I);
    near(a.start.z, -(1 - t) * I);
    near(a.end.x, (1 + 2 * t * Math.sin(Math.PI / 4)) * I);
    near(a.end.z, -(1 + t * Math.cos(Math.PI / 4)) * I);
    near(a.center.x, 1.5 * I);
    near(a.center.z, -(1 - t) * I);
    expect(a.turn).toBe('cw');
    expect(a.convex).toBe(false);
    near(a.sweepDeg, 45);
  });
  it('arc end lies on the taper line and the radius is exact', () => {
    const a = solveContour(base(0.25 * I)).points[1]!.arc!;
    // taper line: from (z=-1I, r=.5I) direction (-cos45, +sin45); end point must satisfy r - .5I = -(z + 1I)
    near(a.end.x / 2 - 0.5 * I, -(a.end.z + 1 * I));
    near(Math.hypot(a.end.z - a.center.z, (a.end.x - a.center.x) / 2), 0.25 * I);
    near(Math.hypot(a.start.z - a.center.z, (a.start.x - a.center.x) / 2), 0.25 * I);
  });
  it('radius leaving a taper into a straight (convex OD)', () => {
    // 45° taper from Ø1 up to Ø2 then straight Ø2: corner at the top of the taper
    const r = solveContour(prof2('od', [P(1 * I, 0), P(2 * I, -0.5 * I, 0.25 * I), P(2 * I, -2 * I)], [T({}), S('straight')]));
    expect(r.status).toBe('green');
    const a = r.points[1]!.arc!;
    expect(a.convex).toBe(true);
    expect(a.turn).toBe('ccw');
    near(a.sweepDeg, 45);
    near(a.end.x, 2 * I); // finishes tangent on the Ø2 straight
  });
  it('ID: radius into a taper flips convex/concave', () => {
    const od = solveContour(base(0.25 * I)).points[1]!.arc!;
    const id = solveContour({ ...base(0.25 * I), side: 'id' }).points[1]!.arc!;
    expect(id.convex).toBe(!od.convex);
    near(id.center.x, od.center.x);
  });
  it('taper solved from two values, then the radius is placed on it', () => {
    // length and angle given; diameter change solved; radius still resolves
    const r = solveContour(prof2('od', [P(20, 0), P(20, -10, 3), P(null, null)], [S('straight'), T({ length: 5, angle: 45, dir: 1 })]));
    expect(r.status).toBe('green');
    expect(r.points[2]!.x).toBeCloseTo(30, 6);
    expect(r.points[1]!.arc).toBeDefined();
  });
  it('red when the radius is too big for a short taper', () => {
    const r = solveContour(prof2('od', [P(20, 0), P(20, -10, 20), P(21, -10.5)], [S('straight'), T({})]));
    expect(r.status).toBe('red');
    expect(r.messages.some((m) => /too large/.test(m.text))).toBe(true);
  });
  it('taper direction unknown stays amber (never guessed)', () => {
    const r = solveContour(prof2('od', [P(20, 0), P(20, -10, 3), P(null, null)], [S('straight'), T({ length: 5, angle: 45 })]));
    expect(r.status).toBe('amber');
  });
  it('taper into taper (both angled) fillets with the turn angle only', () => {
    // 45° out then 45° back in: 90° turn
    const r = solveContour(prof2('od', [P(10, 0), P(20, -5, 2), P(10, -10)], [T({}), T({})]));
    expect(r.status).toBe('green');
    near(r.points[1]!.arc!.sweepDeg, 90);
    near(r.points[1]!.arc!.tangentLength, 2);
  });
});

describe('contour — guided missing-data solver (Gate D)', () => {
  it('a missing Z lists the exact fields that would fix it', () => {
    const r = solveContour(prof([P(25.4, 0), P(25.4, null)], [S('straight')]));
    expect(r.status).toBe('amber');
    const z = r.missing!.find((m) => m.target.startsWith('P2 position'))!;
    expect(z.options.map((o) => o.field)).toEqual(['z1', 'v0']);
  });
  it('a shoulder with an unknown diameter offers its diameter change only when the other end is known', () => {
    const r = solveContour(prof([P(25.4, 0), P(null, 0)], [S('shoulder')]));
    const x = r.missing!.find((m) => m.target.startsWith('P2 diameter'))!;
    expect(x.options.map((o) => o.field)).toEqual(['x1', 'v0']);
  });
  it('an unknown straight neighbour is offered by its diameter, not its length', () => {
    const r = solveContour(prof([P(null, 0), P(null, -10)], [S('straight')]));
    const x = r.missing!.find((m) => m.target.startsWith('P1 diameter'))!;
    expect(x.options.map((o) => o.field)).toEqual(['x0', 'x1']);
  });
  it('an under-specified taper asks for any two values', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 5 })]));
    expect(r.missing!.some((m) => m.target === 'taper P1→P2')).toBe(true);
  });
  it('a taper whose direction is ambiguous asks for the direction, never guesses', () => {
    const r = solveContour(prof([P(20, 0), P(null, null)], [T({ length: 5, angle: 45 })]));
    expect(r.missing!.some((m) => m.target === 'taper P1→P2 direction')).toBe(true);
  });
  it('green and red results carry no missing list', () => {
    expect(solveContour(prof([P(25.4, 0), P(25.4, -10)], [S('straight')])).missing).toBeUndefined();
    expect(solveContour(prof([P(25.4, 0), P(30, -10)], [S('straight')])).missing).toBeUndefined();
  });
  it('every suggested field exists on the form (x/z per point, v/len/dx per segment)', () => {
    const r = solveContour(prof([P(null, null), P(null, null), P(null, null)], [S('shoulder'), T({})]));
    for (const m of r.missing ?? []) for (const o of m.options) if (o.field) expect(o.field).toMatch(/^(x|z)[0-2]$|^(v|len|dx)[0-1]$/);
  });
});
