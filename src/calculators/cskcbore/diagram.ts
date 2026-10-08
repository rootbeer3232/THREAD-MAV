import { s } from '../../ui/dom';

/** Cross-section schematics. Countersink cone follows the real included angle (clamped 40°–140°). */
export function countersinkDiagram(includedDeg: number | null): SVGSVGElement {
  const W = 400;
  const H = 190;
  const half = (Math.min(140, Math.max(40, includedDeg ?? 90)) * Math.PI) / 360;
  const top = 50;
  const bottom = 160;
  const holeHalf = 22;
  const cx = 200;
  const depth = Math.min(80, (60 / Math.tan(half)) | 0 || 40);
  const csHalf = holeHalf + Math.tan(half) * depth;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram', role: 'img', 'aria-label': 'Countersink cross-section' });
  const left = cx - csHalf;
  const right = cx + csHalf;
  svg.append(
    s('path', { d: `M 30 ${top} H ${left} L ${cx - holeHalf} ${top + depth} V ${bottom} H 30 Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('path', { d: `M 370 ${top} H ${right} L ${cx + holeHalf} ${top + depth} V ${bottom} H 370 Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: left, y1: top - 14, x2: right, y2: top - 14, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: cx, y: top - 20, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'D'),
    s('line', { x1: cx - holeHalf, y1: bottom + 14, x2: cx + holeHalf, y2: bottom + 14, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: cx, y: bottom + 28, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'd'),
    s('line', { x1: right + 16, y1: top, x2: right + 16, y2: top + depth, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: right + 24, y: top + depth / 2 + 5, fill: 'var(--green)', 'font-size': 14, 'font-weight': 800 }, 'h'),
    s('text', { x: cx, y: top + depth + 26, 'text-anchor': 'middle', fill: 'var(--text-dim)', 'font-size': 13, 'font-weight': 800 }, `${includedDeg ?? 90}° included`),
  );
  return svg;
}

export function counterboreDiagram(): SVGSVGElement {
  const W = 400;
  const H = 190;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram', role: 'img', 'aria-label': 'Counterbore cross-section' });
  const cx = 200;
  const top = 40;
  const step = 85;
  const bottom = 160;
  svg.append(
    s('path', { d: `M 30 ${top} H ${cx - 60} V ${step} H ${cx - 24} V ${bottom} H 30 Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('path', { d: `M 370 ${top} H ${cx + 60} V ${step} H ${cx + 24} V ${bottom} H 370 Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: cx - 60, y1: top - 12, x2: cx + 60, y2: top - 12, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: cx, y: top - 18, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'D'),
    s('line', { x1: cx - 24, y1: bottom + 14, x2: cx + 24, y2: bottom + 14, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: cx, y: bottom + 28, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'd'),
    s('line', { x1: cx + 78, y1: top, x2: cx + 78, y2: step, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: cx + 86, y: (top + step) / 2 + 5, fill: 'var(--green)', 'font-size': 14, 'font-weight': 800 }, 'depth'),
    s('line', { x1: 345, y1: top, x2: 345, y2: bottom, stroke: 'var(--text-dim)', 'stroke-width': 1.5 }),
    s('text', { x: 350, y: (top + bottom) / 2, fill: 'var(--text-dim)', 'font-size': 12, 'font-weight': 800 }, 'T'),
  );
  return svg;
}
