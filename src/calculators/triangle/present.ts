import { fmtDeg, fmtDms, fmtLoose } from '../../core/format';
import type { Presentation, ResultRow } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { TriangleResult } from './engine';

const LABEL: Record<string, string> = { rise: 'Rise', run: 'Run', hyp: 'Hypotenuse', angle: 'angle' };

export function presentTriangle(r: TriangleResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const tag = (k: string) => (r.given.includes(k) ? ({ text: 'GIVEN', tone: 'geometry' } as const) : ({ text: 'SOLVED', tone: 'verified' } as const));
  const sides: ResultRow[] = [
    { label: 'Rise (opposite θ)', dual: d(r.rise), size: 'normal', tag: tag('rise') },
    { label: 'Run (adjacent to θ)', dual: d(r.run), size: 'normal', tag: tag('run') },
    { label: 'Hypotenuse', dual: d(r.hyp), size: 'normal', tag: tag('hyp') },
  ];
  return {
    title: 'Right Triangle',
    subtitle: `Given ${r.given.map((k) => LABEL[k]).join(' + ')}`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      {
        title: 'Angle θ',
        rows: [
          { label: 'Angle θ (from the run)', text: fmtDeg(r.angleDeg, 4), altText: fmtDms(r.angleDms), size: 'hero', tag: tag('angle') },
          { label: 'Complementary angle (90° − θ)', text: fmtDeg(r.complementDeg, 4), altText: fmtDms(r.complementDms), size: 'normal' },
        ],
      },
      { title: 'Sides', rows: sides },
      {
        title: 'Slope',
        rows: [
          { label: 'Rise per 1 of run (tan θ)', text: fmtLoose(r.slope, 5), size: 'normal' },
          { label: 'Grade', text: `${fmtLoose(r.gradePercent, 3)} %`, size: 'normal' },
        ],
      },
    ],
    messages: [{ tone: 'info', text: 'Right angle between run and rise. Rise = Hyp × sin θ · Run = Hyp × cos θ · tan θ = Rise ÷ Run' }],
  };
}
