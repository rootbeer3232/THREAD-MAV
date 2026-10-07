import { s } from '../../ui/dom';

/** Right triangle schematic (right angle bottom-right). Angle is drawn from the real value, clamped 8°–80°. */
export function triangleDiagram(angleDeg: number | null): SVGSVGElement {
  const W = 400;
  const H = 190;
  const ang = Math.min(80, Math.max(8, angleDeg ?? 30));
  const rad = (ang * Math.PI) / 180;
  const base = 250 * Math.min(1, 140 / (250 * Math.tan(rad)));
  const run = Math.max(110, base);
  const rise = run * Math.tan(rad);
  const x0 = 60;
  const y0 = 160;
  const x1 = x0 + run;
  const y1 = y0 - rise;
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram', role: 'img', 'aria-label': 'Right triangle with rise, run, hypotenuse and angle theta' });
  svg.append(
    s('polygon', { points: `${x0},${y0} ${x1},${y0} ${x1},${y1}`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('path', { d: `M ${x1 - 16} ${y0} L ${x1 - 16} ${y0 - 16} L ${x1} ${y0 - 16}`, fill: 'none', stroke: 'var(--text-dim)', 'stroke-width': 2 }),
    s('path', { d: `M ${x0 + 52} ${y0} A 52 52 0 0 0 ${x0 + 52 * Math.cos(rad)} ${y0 - 52 * Math.sin(rad)}`, fill: 'none', stroke: 'var(--green)', 'stroke-width': 2.5 }),
    s('text', { x: x0 + 62, y: y0 - 8, fill: 'var(--green)', 'font-size': 18, 'font-weight': 800 }, 'θ'),
    s('text', { x: (x0 + x1) / 2, y: y0 + 22, 'text-anchor': 'middle', fill: 'var(--blue)', 'font-size': 15, 'font-weight': 800 }, 'RUN'),
    s('text', { x: x1 + 10, y: (y0 + y1) / 2 + 5, fill: 'var(--blue)', 'font-size': 15, 'font-weight': 800 }, 'RISE'),
    s('text', { x: (x0 + x1) / 2 - 12, y: (y0 + y1) / 2 - 8, 'text-anchor': 'end', fill: 'var(--text)', 'font-size': 15, 'font-weight': 800 }, 'HYP'),
  );
  return svg;
}
