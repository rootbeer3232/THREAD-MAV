import { describe, expect, it } from 'vitest';
import { arcMidpoint, inspectionPoints, inspectionText } from '../src/core/contour/inspect';
import { solveContour } from '../src/core/contour/engine';
import { CONTOUR_SCHEMA, type ContourProfile } from '../src/core/contour/types';

const I = 25.4;
const od = (points: ContourProfile['points'], segments: ContourProfile['segments']) => solveContour({ schema: CONTOUR_SCHEMA, side: 'od', points, segments });

describe('inspection coordinates (Gate G1)', () => {
  const sol = od([{ x: 1.5 * I, z: 0 }, { x: 2 * I, z: 0, radius: 0.25 * I }, { x: 2 * I, z: -2 * I }], [{ kind: 'shoulder', value: null }, { kind: 'straight', value: null }]);
  it('radius corner gives start, midpoint, end and center; plain ends give the corner', () => {
    const p = inspectionPoints(sol)!;
    expect(p.map((q) => q.kind)).toEqual(['corner', 'arc-start', 'arc-mid', 'arc-end', 'arc-center', 'corner']);
    expect(p.map((q) => q.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(p[4]!.reference).toBe(true);
  });
  it('arc midpoint is exactly R from the center and halfway round (45° for a 90° arc)', () => {
    const a = sol.points[1]!.arc!;
    const m = arcMidpoint(a.center, a.start, a.end, a.radius);
    expect(Math.hypot(m.z - a.center.z, (m.x - a.center.x) / 2)).toBeCloseTo(a.radius, 9);
    // center X1.5 Z-.25, R.25: midpoint at 45° → r = .75+.25·sin45, z = -.25+.25·cos45... check by equal chord lengths
    const d1 = Math.hypot(m.z - a.start.z, (m.x - a.start.x) / 2);
    const d2 = Math.hypot(m.z - a.end.z, (m.x - a.end.x) / 2);
    expect(d1).toBeCloseTo(d2, 9);
    expect(m.x / I).toBeCloseTo(1.5 + 2 * 0.25 * Math.sin(Math.PI / 4), 9);
    expect(m.z / I).toBeCloseTo(-0.25 + 0.25 * Math.cos(Math.PI / 4), 9);
  });
  it('a taper without rounded ends adds its midpoint on the line', () => {
    const s = od([{ x: 1 * I, z: 0 }, { x: 2 * I, z: -0.5 * I }], [{ kind: 'taper', value: null, dir: 1, dx: null, length: null, angle: 45 }]);
    const p = inspectionPoints(s)!;
    const mid = p.find((q) => q.kind === 'taper-mid')!;
    expect(mid.x / I).toBeCloseTo(1.5, 9);
    expect(mid.z / I).toBeCloseTo(-0.25, 9);
  });
  it('fail-closed: no list unless the solution is green', () => {
    expect(inspectionPoints(od([{ x: 25.4, z: 0 }, { x: null, z: null }], [{ kind: 'straight', value: null }]))).toBeNull();
    expect(inspectionPoints(od([{ x: 25.4, z: 0 }, { x: 30, z: -5 }], [{ kind: 'straight', value: null }]))).toBeNull();
  });
  it('copy text is CSV in the working unit', () => {
    const t = inspectionText(inspectionPoints(sol)!, 'in', 4);
    expect(t.split('\n')[0]).toBe('#,feature,X (dia),Z');
    expect(t).toContain('2,P2 R arc start (tangent),1.5000,0.0000');
    expect(t).toContain('6,P3 corner,2.0000,-2.0000');
  });
});
