/**
 * Gate G1 — inspection coordinates. Turns a SOLVED (green) contour into a numbered list of points a person can
 * check on the finished part (X = diameter, Z from P0, internal mm). Nothing is produced unless every value is known.
 *   · plain corners and ends → the corner itself
 *   · radius corners        → arc start, arc midpoint (on the arc), arc end, and the center (reference only — it is not on the part)
 *   · tapers                → their end points (already corners) plus a midpoint on the taper line
 */
import type { ContourSolution, XZ } from './types';

export type InspectKind = 'corner' | 'arc-start' | 'arc-mid' | 'arc-end' | 'arc-center' | 'taper-mid';

export interface InspectPoint {
  n: number;
  kind: InspectKind;
  label: string;
  x: number;
  z: number;
  /** Not a point on the part (arc centers) — for reference only. */
  reference: boolean;
}

export const INSPECT_KIND_TEXT: Record<InspectKind, string> = {
  corner: 'corner',
  'arc-start': 'arc start (tangent)',
  'arc-mid': 'arc midpoint',
  'arc-end': 'arc end (tangent)',
  'arc-center': 'arc center (reference)',
  'taper-mid': 'taper midpoint',
};

/** Midpoint of the arc itself: center + R · unit(bisector of the two radius vectors), in (z, r = X/2) space. */
export function arcMidpoint(center: XZ, start: XZ, end: XZ, radius: number): XZ {
  const v1 = { z: start.z - center.z, r: (start.x - center.x) / 2 };
  const v2 = { z: end.z - center.z, r: (end.x - center.x) / 2 };
  const sz = v1.z + v2.z;
  const sr = v1.r + v2.r;
  const len = Math.hypot(sz, sr);
  return { x: 2 * (center.x / 2 + (sr / len) * radius), z: center.z + (sz / len) * radius };
}

export function inspectionPoints(sol: ContourSolution): InspectPoint[] | null {
  if (sol.status !== 'green') return null;
  const out: InspectPoint[] = [];
  const add = (kind: InspectKind, label: string, x: number, z: number) => out.push({ n: out.length + 1, kind, label, x, z, reference: kind === 'arc-center' });
  for (let i = 0; i < sol.points.length; i++) {
    const p = sol.points[i]!;
    if (p.x === null || p.z === null) return null;
    if (p.arc) {
      const a = p.arc;
      const m = arcMidpoint(a.center, a.start, a.end, a.radius);
      add('arc-start', `P${i + 1} R`, a.start.x, a.start.z);
      add('arc-mid', `P${i + 1} R`, m.x, m.z);
      add('arc-end', `P${i + 1} R`, a.end.x, a.end.z);
      add('arc-center', `P${i + 1} R`, a.center.x, a.center.z);
    } else add('corner', `P${i + 1}`, p.x, p.z);
    const seg = sol.segments[i];
    const q = sol.points[i + 1];
    if (seg?.kind === 'taper' && q && q.x !== null && q.z !== null) {
      // midpoint of the taper TANGENT-to-TANGENT span would depend on arcs; use the sharp-corner line midpoint only when neither end is rounded
      if (!p.arc && !q.arc) add('taper-mid', `P${i + 1}→P${i + 2}`, (p.x + q.x) / 2, (p.z + q.z) / 2);
    }
  }
  return out;
}

export function inspectionText(pts: InspectPoint[], unit: 'in' | 'mm', dp: number): string {
  const c = (mm: number) => (unit === 'in' ? mm / 25.4 : mm).toFixed(dp);
  return ['#,feature,X (dia),Z', ...pts.map((p) => `${p.n},${p.label} ${INSPECT_KIND_TEXT[p.kind]},${c(p.x)},${c(p.z)}`)].join('\n');
}
