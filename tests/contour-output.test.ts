import { describe, expect, it } from 'vitest';
import { contourCoordinateText } from '../src/calculators/contour/present';
import { solveContour } from '../src/core/contour/engine';
import { CONTOUR_SCHEMA } from '../src/core/contour/types';

const I = 25.4;
const sol = solveContour({
  schema: CONTOUR_SCHEMA,
  side: 'od',
  points: [{ x: 1.5 * I, z: 0 }, { x: 2 * I, z: 0, radius: 0.25 * I }, { x: 2 * I, z: -2 * I }],
  segments: [{ kind: 'shoulder', value: null }, { kind: 'straight', value: null }],
});

describe('contour coordinate text (copy / send)', () => {
  it('lists points and the arc in the working unit', () => {
    const t = contourCoordinateText(sol, 'in', 4, 'od');
    expect(t).toContain('P1  X 1.5000  Z 0.0000');
    expect(t).toContain('P3  X 2.0000  Z -2.0000');
    expect(t).toContain('R0.2500 arc  start X 1.5000 Z 0.0000  end X 2.0000 Z -0.2500  center X 1.5000 Z -0.2500  convex CCW');
  });
  it('metric output uses mm', () => {
    expect(contourCoordinateText(sol, 'mm', 3, 'od')).toContain('P3  X 50.800  Z -50.800');
  });
  it('unknown values print as ? and never as numbers', () => {
    const a = solveContour({ schema: CONTOUR_SCHEMA, side: 'od', points: [{ x: 25.4, z: 0 }, { x: null, z: null }], segments: [{ kind: 'shoulder', value: null }] });
    expect(contourCoordinateText(a, 'in', 4, 'od')).toContain('P2  X ? ');
  });
});
