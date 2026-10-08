import { s } from '../../ui/dom';

/** Circular segment schematic: arc, chord, sagitta, radius. */
export function arcDiagram(angleDeg: number | null): SVGSVGElement {
  const th = (Math.min(180, Math.max(30, angleDeg ?? 100)) * Math.PI) / 180;
  const R = 80;
  const cx = 200;
  const cy = 140;
  const half = th / 2;
  const x1 = cx - R * Math.sin(half);
  const x2 = cx + R * Math.sin(half);
  const yc = cy - R * Math.cos(half);
  const top = cy - R;
  const svg = s('svg', { viewBox: '0 0 400 190', class: 'sine-diagram', role: 'img', 'aria-label': 'Arc with radius, chord and sagitta' });
  svg.append(
    s('path', { d: `M ${x1} ${yc} A ${R} ${R} 0 0 1 ${x2} ${yc} Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: cx, y1: cy, x2: x1, y2: yc, stroke: 'var(--text-dim)', 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }),
    s('line', { x1: cx, y1: cy, x2: x2, y2: yc, stroke: 'var(--text-dim)', 'stroke-width': 1.2, 'stroke-dasharray': '6 4' }),
    s('circle', { cx, cy, r: 3, fill: 'var(--text)' }),
    s('text', { x: cx + 8, y: cy + 4, fill: 'var(--text-dim)', 'font-size': 12, 'font-weight': 800 }, 'center'),
    s('text', { x: (cx + x2) / 2 + 6, y: (cy + yc) / 2 + 6, fill: 'var(--text)', 'font-size': 14, 'font-weight': 800 }, 'R'),
    s('text', { x: cx, y: yc + 18, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'chord'),
    s('line', { x1: cx, y1: top, x2: cx, y2: yc, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: cx + 8, y: (top + yc) / 2 + 4, fill: 'var(--green)', 'font-size': 14, 'font-weight': 800 }, 'sagitta'),
  );
  return svg;
}
