import { fmtDeg, fmtLoose } from '../../core/format';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { BoltCircleResult } from './engine';

export function presentBoltCircle(r: BoltCircleResult): Presentation {
  const u = r.unit;
  const d = (v: number) => dualFrom(v, u);
  const i = r.input;
  const diaTxt = u === 'in' ? `${r.diameter.toFixed(4)}"` : `${r.diameter.toFixed(3)} mm`;
  const msgs: Presentation['messages'] = [
    { tone: 'info', text: `Angles are measured from the +X axis, ${i.clockwise ? 'clockwise' : 'counterclockwise'}, with hole 1 at ${fmtLoose(i.startDeg, 4)}°. Coordinates are relative to part zero; the circle center is at X ${fmtLoose(i.centerX, 4)}, Y ${fmtLoose(i.centerY, 4)} (${u}).` },
  ];
  return {
    title: `${r.holes.length}-hole bolt circle`,
    subtitle: `Ø ${diaTxt} · start ${fmtLoose(i.startDeg, 4)}° ${i.clockwise ? 'CW' : 'CCW'}`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      {
        title: 'Hole positions',
        rows: r.holes.map((h) => ({ label: `#${h.index}`, size: 'normal' as const, xy: { angle: fmtDeg(h.angleDeg, 4), x: d(h.x), y: d(h.y) } })),
      },
      {
        title: 'Circle',
        rows: [
          { label: 'Bolt circle diameter', dual: d(r.diameter), size: 'normal' },
          { label: 'Bolt circle radius', dual: d(r.radius), size: 'normal' },
          { label: 'Angle between holes', text: fmtDeg(r.stepDeg, 4), size: 'normal' },
          ...(r.holes.length > 1 ? [{ label: 'Distance between adjacent holes', dual: d(r.chord), size: 'normal' as const }] : []),
        ],
      },
    ],
    messages: msgs,
  };
}

/** Plain-text table of coordinates in the working unit, for copying into a program or notes. */
export function coordinateText(r: BoltCircleResult, dp: number): string {
  const f = (v: number) => v.toFixed(dp);
  const lines = [`${r.holes.length}-hole bolt circle, ⌀${f(r.diameter)} ${r.unit}`, '#  angle      X          Y'];
  for (const h of r.holes) lines.push(`${String(h.index).padEnd(2)} ${h.angleDeg.toFixed(4).padStart(9)}  ${f(h.x).padStart(10)} ${f(h.y).padStart(10)}`);
  return lines.join('\n');
}
