import type { ContourSolution } from '../../core/contour/types';
import { s } from '../../ui/dom';

/**
 * Profile preview in the X-Z view: Z runs left→right (chuck on the LEFT, since Z is negative toward the chuck),
 * X (shown as radius) runs upward from the centerline. Only points that are actually solved are drawn; unknown
 * stretches are left as gaps, never guessed. Corner radii are drawn as true arcs.
 */
export function contourDiagram(sol: ContourSolution): SVGSVGElement | null {
  const W = 400;
  const H = 230;
  const pad = 30;
  const known = sol.points.map((p) => (p.x !== null && p.z !== null ? { z: p.z, r: p.x / 2 } : null));
  const xs: number[] = [0];
  const rs: number[] = [0];
  known.forEach((k) => k && (xs.push(k.z), rs.push(k.r)));
  sol.points.forEach((p) => p.arc && (xs.push(p.arc.start.z, p.arc.end.z), rs.push(p.arc.start.x / 2, p.arc.end.x / 2)));
  if (known.every((k) => !k)) return null;
  const zMin = Math.min(...xs);
  const zMax = Math.max(...xs);
  const rMax = Math.max(...rs);
  const spanZ = Math.max(zMax - zMin, 1e-9);
  const spanR = Math.max(rMax, 1e-9);
  const k = Math.min((W - 2 * pad) / spanZ, (H - 2 * pad) / spanR);
  const sx = (z: number) => pad + (z - zMin) * k;
  const sy = (r: number) => H - pad - r * k;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram contour-diagram', role: 'img', 'aria-label': 'Profile preview, X-Z view' });
  svg.append(
    s('line', { x1: 8, y1: sy(0), x2: W - 8, y2: sy(0), stroke: 'var(--border-strong)', 'stroke-width': 1.5, 'stroke-dasharray': '8 4 2 4' }),
    s('text', { x: W - 10, y: sy(0) - 5, 'text-anchor': 'end', fill: 'var(--text-dim)', 'font-size': 11, 'font-weight': 700 }, 'centerline'),
    s('text', { x: 10, y: 16, fill: 'var(--text-dim)', 'font-size': 11, 'font-weight': 700 }, '◄ chuck'),
  );
  if (zMax >= 0 && zMin <= 0) svg.append(s('line', { x1: sx(0), y1: 22, x2: sx(0), y2: sy(0), stroke: 'var(--blue)', 'stroke-width': 1, 'stroke-dasharray': '3 3' }), s('text', { x: sx(0) + 4, y: 28, fill: 'var(--blue)', 'font-size': 11, 'font-weight': 800 }, 'P0'));

  let d = '';
  let pen = false;
  sol.points.forEach((p, i) => {
    const kp = known[i];
    if (!kp) {
      pen = false;
      return;
    }
    if (p.arc) {
      const a = p.arc;
      const r = a.radius * k;
      const sweep = a.turn === 'ccw' ? 0 : 1; // screen y is flipped: visual CCW in X-Z = SVG sweep 0
      d += `${pen ? 'L' : 'M'}${sx(a.start.z).toFixed(2)} ${sy(a.start.x / 2).toFixed(2)}A${r.toFixed(2)} ${r.toFixed(2)} 0 0 ${sweep} ${sx(a.end.z).toFixed(2)} ${sy(a.end.x / 2).toFixed(2)}`;
    } else d += `${pen ? 'L' : 'M'}${sx(kp.z).toFixed(2)} ${sy(kp.r).toFixed(2)}`;
    pen = true;
  });
  svg.append(s('path', { d, fill: 'none', stroke: 'var(--green)', 'stroke-width': 3, 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }));
  known.forEach((kp, i) => {
    if (!kp) return;
    const sharp = sol.points[i]!.arc;
    svg.append(
      s('circle', { cx: sx(kp.z), cy: sy(kp.r), r: sharp ? 2.5 : 4, fill: sharp ? 'none' : 'var(--bg)', stroke: 'var(--text)', 'stroke-width': 1.5 }),
      s('text', { x: sx(kp.z) + 6, y: sy(kp.r) - 7, fill: 'var(--text)', 'font-size': 12, 'font-weight': 900 }, `P${i + 1}`),
    );
  });
  return svg;
}
