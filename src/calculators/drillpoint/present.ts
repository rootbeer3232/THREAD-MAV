import type { Presentation, ResultRow } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { DrillPointResult } from './engine';

export function presentDrillPoint(r: DrillPointResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const heroes: ResultRow[] = [{ label: 'Point depth (cone length)', dual: d(r.pointDepth), size: 'hero', extraDecimals: 1 }];
  if (r.totalDepth !== null) heroes.push({ label: 'Total drill depth to program', dual: d(r.totalDepth), size: 'hero' });
  const rows: ResultRow[] = [
    { label: 'Drill diameter', dual: d(r.diameter), size: 'normal' },
    { label: 'Point angle', text: `${r.includedAngleDeg}° included`, altText: `${r.halfAngleDeg}° per side`, size: 'normal' },
  ];
  if (r.holeDepth !== null) rows.push({ label: 'Full-diameter depth wanted', dual: d(r.holeDepth), size: 'normal' });
  return {
    title: 'Drill point depth',
    subtitle: `Ø ${r.unit === 'in' ? r.diameter.toFixed(4) + '"' : r.diameter.toFixed(3) + ' mm'} · ${r.includedAngleDeg}° point`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [{ title: 'Answer', rows: heroes }, { title: 'Drill', rows }],
    messages: [{ tone: 'info', text: 'Point depth = (D ÷ 2) ÷ tan(angle ÷ 2). For a through hole, drill to part thickness + point depth (plus any breakthrough clearance you want).' }],
  };
}
