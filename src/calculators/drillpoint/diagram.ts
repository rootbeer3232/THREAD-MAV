import { s } from '../../ui/dom';

/** Drill tip schematic; cone follows the real point angle (clamped 60°–170°). */
export function drillPointDiagram(includedDeg: number | null): SVGSVGElement {
  const half = (Math.min(170, Math.max(60, includedDeg ?? 118)) * Math.PI) / 360;
  const hw = 55;
  const depth = Math.min(95, hw / Math.tan(half));
  const top = 25;
  const cx = 200;
  const svg = s('svg', { viewBox: '0 0 400 190', class: 'sine-diagram', role: 'img', 'aria-label': 'Drill point depth' });
  const y1 = top + 75;
  const y2 = y1 + depth;
  svg.append(
    s('path', { d: `M ${cx - hw} ${top} V ${y1} L ${cx} ${y2} L ${cx + hw} ${y1} V ${top}`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: cx - hw - 14, y1: y1, x2: cx + hw + 14, y2: y1, stroke: 'var(--text-dim)', 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }),
    s('line', { x1: cx + hw + 26, y1: y1, x2: cx + hw + 26, y2: y2, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: cx + hw + 34, y: (y1 + y2) / 2 + 5, fill: 'var(--green)', 'font-size': 14, 'font-weight': 800 }, 'point depth'),
    s('line', { x1: cx - hw, y1: top - 10, x2: cx + hw, y2: top - 10, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: cx, y: top - 14, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'D'),
    s('text', { x: cx, y: y2 + 20, 'text-anchor': 'middle', fill: 'var(--text-dim)', 'font-size': 13, 'font-weight': 800 }, `${includedDeg ?? 118}° point`),
  );
  return svg;
}
