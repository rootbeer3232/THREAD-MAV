import { s } from '../../ui/dom';

/**
 * Sine bar schematic. Angle is drawn from the real value (clamped 4°–70° so the
 * picture stays legible); it is NOT to scale and says so by being a diagram only.
 */
export function sineDiagram(opts: { angleDeg: number | null; barLabel: string; stackLabel?: string | null }): SVGSVGElement {
  const W = 360;
  const H = 210;
  const plateY = 178;
  const r = 10; // roller radius
  const L = 262; // drawn center distance
  const x0 = 38;
  const raw = opts.angleDeg ?? 15;
  const ang = Math.min(70, Math.max(4, raw));
  const rad = (ang * Math.PI) / 180;
  const c1 = { x: x0, y: plateY - r };
  const c2 = { x: x0 + L * Math.cos(rad), y: plateY - r - L * Math.sin(rad) };

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, class: 'sine-diagram', role: 'img', 'aria-label': `Sine bar, ${opts.barLabel} center to center, with gage block stack under one roller` });

  // surface plate
  svg.append(s('rect', { x: 0, y: plateY, width: W, height: 12, fill: 'var(--surface-2)' }), s('line', { x1: 0, y1: plateY, x2: W, y2: plateY, stroke: 'var(--text-dim)', 'stroke-width': 2 }));

  // gage block stack under right roller
  const stackTop = c2.y + r;
  const stackW = 34;
  if (plateY - stackTop > 2) {
    const blocks = Math.max(1, Math.min(4, Math.round((plateY - stackTop) / 22)));
    const bh = (plateY - stackTop) / blocks;
    for (let i = 0; i < blocks; i++) {
      svg.append(s('rect', { x: c2.x - stackW / 2, y: stackTop + i * bh, width: stackW, height: bh, fill: i % 2 ? 'var(--surface-3)' : 'var(--surface-2)', stroke: 'var(--text)', 'stroke-width': 1.5 }));
    }
    // stack dimension (right side)
    const dx = c2.x + stackW / 2 + 14;
    svg.append(
      s('line', { x1: dx, y1: stackTop, x2: dx, y2: plateY, stroke: 'var(--blue)', 'stroke-width': 2 }),
      s('line', { x1: dx - 5, y1: stackTop, x2: dx + 5, y2: stackTop, stroke: 'var(--blue)', 'stroke-width': 2 }),
      s('line', { x1: dx - 5, y1: plateY, x2: dx + 5, y2: plateY, stroke: 'var(--blue)', 'stroke-width': 2 }),
      s('text', { x: dx + 8, y: (stackTop + plateY) / 2 + 5, fill: 'var(--blue)', 'font-size': 15, 'font-weight': 700 }, opts.stackLabel ?? 'STACK'),
    );
  }

  // bar body (rotated rect around center line through rollers)
  const g = s('g', { transform: `translate(${c1.x} ${c1.y}) rotate(${-ang})` });
  g.append(
    s('rect', { x: -r - 6, y: -r - 16, width: L + 2 * r + 12, height: 22, rx: 3, fill: 'var(--surface-3)', stroke: 'var(--text)', 'stroke-width': 2 }),
    s('text', { x: L / 2, y: -r - 24, 'text-anchor': 'middle', fill: 'var(--text)', 'font-size': 14, 'font-weight': 800, 'letter-spacing': '0.5' }, `${opts.barLabel} CENTER TO CENTER`),
    // dimension line along the bar axis
    s('line', { x1: 0, y1: r + 14, x2: L, y2: r + 14, stroke: 'var(--text-dim)', 'stroke-width': 1.5 }),
  );
  svg.append(g);

  // rollers
  for (const c of [c1, c2]) {
    svg.append(s('circle', { cx: c.x, cy: c.y, r, fill: 'var(--bg)', stroke: 'var(--text)', 'stroke-width': 2.5 }), s('circle', { cx: c.x, cy: c.y, r: 2, fill: 'var(--text)' }));
  }

  // angle arc at left roller contact
  const arcR = 70;
  const ax = c1.x + arcR;
  const bx = c1.x + arcR * Math.cos(rad);
  const by = c1.y - arcR * Math.sin(rad);
  svg.append(
    s('path', { d: `M ${ax} ${c1.y} A ${arcR} ${arcR} 0 0 0 ${bx} ${by}`, fill: 'none', stroke: 'var(--green)', 'stroke-width': 2.5 }),
    s('text', { x: c1.x + arcR + 8, y: c1.y - 6 - Math.min(20, arcR * Math.sin(rad) * 0.4), fill: 'var(--green)', 'font-size': 17, 'font-weight': 800 }, opts.angleDeg === null ? 'θ' : `${raw.toFixed(raw % 1 === 0 ? 0 : 2)}°`),
  );
  return svg;
}
