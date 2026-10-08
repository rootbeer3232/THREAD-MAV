import { fmtDeg, fmtDms } from '../../core/format';
import type { Presentation, ResultRow } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { ChamferResult } from './engine';

export function presentChamfer(r: ChamferResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const tag = (k: ChamferResult['given'][number]) => (r.given.includes(k) ? ({ text: 'GIVEN', tone: 'geometry' } as const) : ({ text: 'SOLVED', tone: 'verified' } as const));
  const sections: Presentation['sections'] = [];
  if (r.endFaceDia !== null) {
    sections.push({ title: 'End face', rows: [{ label: `Diameter at the end face (${r.side})`, dual: d(r.endFaceDia), size: 'hero' }] });
  }
  const rows: ResultRow[] = [
    { label: 'Axial length (Z)', dual: d(r.axial), size: 'normal', tag: tag('axial') },
    { label: 'Radial width, per side (X/side)', dual: d(r.radial), size: 'normal', tag: tag('radial') },
    { label: 'Diameter change (X in diameter)', dual: d(r.diameterChange), size: 'normal' },
    { label: 'Chamfer face length', dual: d(r.face), size: 'normal', tag: tag('face') },
  ];
  sections.push({ title: 'Chamfer', rows });
  sections.push({
    title: 'Angle',
    rows: [
      { label: 'Angle from the axis (centerline)', text: fmtDeg(r.angleFromAxis, 4), altText: fmtDms(r.angleFromAxisDms), size: 'hero', tag: tag('angle') },
      { label: 'Angle from the end face', text: fmtDeg(r.angleFromFace, 4), altText: fmtDms(r.angleFromFaceDms), size: 'normal' },
      { label: 'Included angle (as a cone)', text: fmtDeg(r.includedDeg, 4), size: 'normal' },
    ],
  });
  return {
    title: 'Chamfer',
    subtitle: `${fmtDeg(r.angleFromAxis, 2)} from the axis`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections,
    messages: [{ tone: 'info', text: 'Right-triangle relationship in half-section: axial length, radial width, face length. On a diameter-programmed lathe, the X move is the diameter change (2 × radial width).' }],
  };
}
