import type { Presentation, ResultRow } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { CounterboreResult, CountersinkResult } from './engine';

export function presentCountersink(r: CountersinkResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const tag = (k: 'depth' | 'dia' | 'hole') => (r.solvedFor === k ? ({ text: 'SOLVED', tone: 'verified' } as const) : ({ text: 'GIVEN', tone: 'geometry' } as const));
  const label = { depth: 'Countersink depth', dia: 'Countersink diameter', hole: 'Hole diameter' } as const;
  const value = { depth: r.depth, dia: r.csDia, hole: r.holeDia } as const;
  const rows: ResultRow[] = [
    { label: 'Countersink diameter (at surface)', dual: d(r.csDia), size: 'normal', tag: tag('dia') },
    { label: 'Hole diameter', dual: d(r.holeDia), size: 'normal', tag: tag('hole') },
    { label: 'Depth to hole diameter', dual: d(r.depth), size: 'normal', tag: tag('depth') },
    { label: 'Depth to the cone’s point', dual: d(r.depthToPoint), size: 'normal' },
    { label: 'Included angle', text: `${r.includedAngleDeg}°`, altText: `${r.halfAngleDeg}° per side`, size: 'normal' },
  ];
  return {
    title: 'Countersink',
    subtitle: `${r.includedAngleDeg}° included · solved for ${label[r.solvedFor].toLowerCase()}`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      { title: 'Answer', rows: [{ label: label[r.solvedFor], dual: d(value[r.solvedFor]), size: 'hero' }] },
      { title: 'Countersink', rows },
    ],
    messages: [
      { tone: 'info', text: 'Depth h = (D − d) ÷ (2·tan(α/2)). Depth to the point is for a full cone of diameter D. Check your countersink’s actual angle and any tip flat before cutting.' },
    ],
  };
}

export function presentCounterbore(r: CounterboreResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const rows: ResultRow[] = [];
  if (r.holeDia !== null) rows.push({ label: 'Through-hole diameter', dual: d(r.holeDia), size: 'normal' });
  if (r.ledge !== null) rows.push({ label: 'Ledge width under the head', dual: d(r.ledge), size: 'normal' });
  if (r.thickness !== null) rows.push({ label: 'Part thickness', dual: d(r.thickness), size: 'normal' });
  if (r.floor !== null) rows.push({ label: 'Material left under the counterbore', dual: d(r.floor), size: 'normal' });
  return {
    title: 'Counterbore',
    subtitle: 'Flat-bottom step for a screw head',
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      { title: 'Counterbore', rows: [{ label: 'Counterbore diameter', dual: d(r.cbDia), size: 'hero' }, { label: 'Counterbore depth', dual: d(r.cbDepth), size: 'hero' }] },
      ...(rows.length ? [{ title: 'Check', rows }] : []),
    ],
    messages: [{ tone: 'info', text: 'Diameter = head diameter + clearance. Depth = head height + clearance. Use the head dimensions from your fastener data or print.' }],
  };
}
