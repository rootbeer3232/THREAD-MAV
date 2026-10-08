import { s } from '../../ui/dom';

/** Bolt circle schematic: holes numbered, hole 1 highlighted, +X axis shown. */
export function boltCircleDiagram(holes: number | null, startDeg: number, clockwise: boolean): SVGSVGElement {
  const W = 400;
  const H = 210;
  const cx = 200;
  const cy = 105;
  const R = 78;
  const n = holes && holes >= 1 && holes <= 360 ? holes : 6;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram', role: 'img', 'aria-label': `Bolt circle with ${n} holes` });
  svg.append(
    s('line', { x1: cx - R - 28, y1: cy, x2: cx + R + 40, y2: cy, stroke: 'var(--border-strong)', 'stroke-width': 1.5 }),
    s('line', { x1: cx, y1: cy - R - 22, x2: cx, y2: cy + R + 22, stroke: 'var(--border-strong)', 'stroke-width': 1.5 }),
    s('text', { x: cx + R + 44, y: cy + 5, fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, '+X'),
    s('text', { x: cx + 6, y: cy - R - 26, fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, '+Y'),
    s('circle', { cx, cy, r: R, fill: 'none', stroke: 'var(--text-dim)', 'stroke-width': 1.5, 'stroke-dasharray': '5 4' }),
  );
  const holeR = n > 24 ? 3 : n > 12 ? 5 : 9;
  const dir = clockwise ? -1 : 1;
  for (let k = 0; k < n; k++) {
    const a = ((startDeg + dir * k * (360 / n)) * Math.PI) / 180;
    const x = cx + R * Math.cos(a);
    const y = cy - R * Math.sin(a);
    svg.append(s('circle', { cx: x, cy: y, r: holeR, fill: k === 0 ? 'var(--green)' : 'var(--bg)', stroke: k === 0 ? 'var(--green)' : 'var(--text)', 'stroke-width': 2 }));
    if (n <= 12) svg.append(s('text', { x, y: y + 4, 'text-anchor': 'middle', fill: k === 0 ? 'var(--green-ink)' : 'var(--text)', 'font-size': 11, 'font-weight': 900 }, String(k + 1)));
  }
  svg.append(s('circle', { cx, cy, r: 3, fill: 'var(--text)' }));
  return svg;
}
