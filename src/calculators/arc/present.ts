import { fmtDeg, fmtDms } from '../../core/format';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { ArcResult } from './engine';

export function presentArc(r: ArcResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const tag = (k: ArcResult['given'][number]) => (r.given.includes(k) ? ({ text: 'GIVEN', tone: 'geometry' } as const) : ({ text: 'SOLVED', tone: 'verified' } as const));
  const names = { radius: 'Radius', chord: 'Chord', sagitta: 'Sagitta', angle: 'Central angle' } as const;
  const solvedLengths = (['radius', 'chord', 'sagitta'] as const).filter((k) => !r.given.includes(k));
  const heroes = solvedLengths.map((k) => ({ label: names[k], dual: d({ radius: r.radius, chord: r.chord, sagitta: r.sagitta }[k]), size: 'hero' as const }));
  return {
    title: 'Radius / chord / sagitta',
    subtitle: `R ${r.unit === 'in' ? r.radius.toFixed(4) + '"' : r.radius.toFixed(3) + ' mm'} · ${fmtDeg(r.angleDeg, 2)} arc`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      ...(heroes.length ? [{ title: 'Answer', rows: heroes }] : []),
      {
        title: 'Arc',
        rows: [
          { label: 'Radius', dual: d(r.radius), size: 'normal', tag: tag('radius') },
          { label: 'Diameter', dual: d(r.diameter), size: 'normal' },
          { label: 'Chord (straight across)', dual: d(r.chord), size: 'normal', tag: tag('chord') },
          { label: 'Sagitta (height of the arc)', dual: d(r.sagitta), size: 'normal', tag: tag('sagitta') },
          { label: 'Arc length (along the curve)', dual: d(r.arcLength), size: 'normal' },
          { label: 'Chord to circle center', dual: d(r.centerToChord), size: 'normal' },
          { label: 'Central angle', text: fmtDeg(r.angleDeg, 4), altText: fmtDms(r.angleDms), size: 'normal', tag: tag('angle') },
        ],
      },
    ],
    messages: [{ tone: 'info', text: 'R = c² ÷ 8s + s ÷ 2 · chord = 2R·sin(θ/2) · sagitta = R·(1 − cos(θ/2)). Arcs up to a semicircle (180°).' }],
  };
}
