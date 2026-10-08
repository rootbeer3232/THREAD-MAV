import { s } from '../../ui/dom';

/** Half-section of a shaft end with a chamfer; angle drawn from the axis. */
export function chamferDiagram(angleFromAxis: number | null): SVGSVGElement {
  const ang = Math.min(80, Math.max(10, angleFromAxis ?? 45));
  const rad = (ang * Math.PI) / 180;
  const run = 90;
  const rise = Math.min(70, run * Math.tan(rad));
  const runAdj = rise / Math.tan(rad);
  const x0 = 70;
  const topY = 40;
  const botY = 140;
  const svg = s('svg', { viewBox: '0 0 400 180', class: 'sine-diagram', role: 'img', 'aria-label': 'Chamfer half-section showing axial length, radial width and angle from the axis' });
  const xe = 330;
  svg.append(
    s('path', { d: `M ${xe} ${botY} V ${topY + rise} L ${xe - runAdj} ${topY} H ${x0} V ${botY} Z`, fill: 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 2.5, 'stroke-linejoin': 'round' }),
    s('line', { x1: 40, y1: botY, x2: 370, y2: botY, stroke: 'var(--text-dim)', 'stroke-width': 1.5, 'stroke-dasharray': '8 5' }),
    s('text', { x: 46, y: botY + 18, fill: 'var(--text-dim)', 'font-size': 12, 'font-weight': 800 }, 'axis'),
    s('line', { x1: xe - runAdj, y1: topY - 12, x2: xe, y2: topY - 12, stroke: 'var(--green)', 'stroke-width': 2 }),
    s('text', { x: xe - runAdj / 2, y: topY - 18, 'text-anchor': 'middle', fill: 'var(--green)', 'font-size': 14, 'font-weight': 800 }, 'axial'),
    s('line', { x1: xe + 14, y1: topY, x2: xe + 14, y2: topY + rise, stroke: 'var(--blue)', 'stroke-width': 2 }),
    s('text', { x: xe + 20, y: topY + rise / 2 + 5, fill: 'var(--blue)', 'font-size': 14, 'font-weight': 800 }, 'radial'),
    s('text', { x: xe - runAdj - 16, y: topY + 30, fill: 'var(--text)', 'font-size': 14, 'font-weight': 800 }, `${angleFromAxis === null ? 'θ' : angleFromAxis.toFixed(angleFromAxis % 1 ? 1 : 0) + '°'} from axis`),
  );
  return svg;
}
