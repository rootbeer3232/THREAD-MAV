import { s } from '../../ui/dom';

/** Tapered section schematic: large end left, small end right. */
export function taperDiagram(): SVGSVGElement {
  const svg = s('svg', { viewBox: '0 0 400 170', class: 'sine-diagram', role: 'img', 'aria-label': 'Taper with large diameter, small diameter and length' });
  svg.append(
    s('polygon', { points: '50,35 350,65 350,105 50,135', fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: 50, y1: 85, x2: 350, y2: 85, stroke: 'var(--text-dim)', 'stroke-width': 1.2, 'stroke-dasharray': '8 5' }),
    s('line', { x1: 34, y1: 35, x2: 34, y2: 135, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: 28, y: 90, 'text-anchor': 'end', fill: 'var(--blue)', 'font-size': 15, 'font-weight': 800 }, 'D'),
    s('line', { x1: 366, y1: 65, x2: 366, y2: 105, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: 374, y: 90, fill: 'var(--blue)', 'font-size': 15, 'font-weight': 800 }, 'd'),
    s('line', { x1: 50, y1: 152, x2: 350, y2: 152, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: 200, y: 168, 'text-anchor': 'middle', fill: 'var(--green)', 'font-size': 15, 'font-weight': 800 }, 'L'),
    s('path', { d: 'M 120 51 A 70 70 0 0 1 120 85', fill: 'none', stroke: 'var(--green)', 'stroke-width': 2 }),
  );
  return svg;
}
