import { fmtDeg, fmtDms, fmtLoose } from '../../core/format';
import type { Presentation, ResultRow } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { TaperResult } from './engine';

export function presentTaper(r: TaperResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const tag = (k: 'large' | 'small' | 'length') => (r.solved.includes(k) ? ({ text: 'SOLVED', tone: 'verified' } as const) : ({ text: 'GIVEN', tone: 'geometry' } as const));
  const heroes: ResultRow[] = [];
  for (const k of ['length', 'small', 'large'] as const) {
    if (r.solved.includes(k)) heroes.push({ label: { length: 'Taper length', small: 'Small diameter', large: 'Large diameter' }[k], dual: d({ length: r.length, small: r.small, large: r.large }[k]), size: 'hero' });
  }
  const inch = r.unit === 'in';
  const sections: Presentation['sections'] = [];
  if (heroes.length) sections.push({ title: 'Answer', rows: heroes });
  sections.push({
    title: 'Dimensions',
    rows: [
      { label: 'Large diameter', dual: d(r.large), size: 'normal', tag: tag('large') },
      { label: 'Small diameter', dual: d(r.small), size: 'normal', tag: tag('small') },
      { label: 'Taper length', dual: d(r.length), size: 'normal', tag: tag('length') },
      ...(r.setOver !== null && r.partLength !== null
        ? [{ label: `Tailstock set-over (part ${inch ? r.partLength.toFixed(3) + '"' : r.partLength.toFixed(2) + ' mm'})`, dual: d(r.setOver), size: 'normal' as const, extraDecimals: 1 }]
        : []),
    ],
  });
  sections.push({
    title: 'Taper',
    rows: [
      { label: inch ? 'Taper per inch' : 'Taper per mm', text: fmtLoose(r.perUnit, 6), size: 'normal' },
      inch
        ? { label: 'Taper per foot', text: `${fmtLoose(r.perFoot, 5)} in/ft`, altText: `${fmtLoose(r.per100, 4)} mm per 100 mm`, size: 'normal' as const }
        : { label: 'Taper per 100 mm', text: `${fmtLoose(r.per100, 4)} mm`, altText: `${fmtLoose(r.perUnit * 12, 5)} in/ft`, size: 'normal' as const },
      { label: 'Ratio', text: `1 : ${fmtLoose(r.ratio, 4)}`, size: 'normal' },
    ],
  });
  sections.push({
    title: 'Angle',
    rows: [
      { label: 'Included angle', text: fmtDeg(r.includedDeg, 4), altText: fmtDms(r.includedDms), size: 'hero' },
      { label: 'Angle per side (compound slide)', text: fmtDeg(r.perSideDeg, 4), altText: fmtDms(r.perSideDms), size: 'normal' },
    ],
  });
  return {
    title: 'Taper',
    subtitle: r.solved.includes('taper') ? 'Taper from D, d and length' : `Solved for ${r.solved.map((k) => ({ length: 'length', small: 'small diameter', large: 'large diameter', taper: 'taper' })[k]).join(', ')}`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections,
    messages: [{ tone: 'info', text: 'Taper = (D − d) ÷ L · angle per side = atan((D − d) ÷ 2L). Set the compound slide to the angle per side from the work axis.' }],
  };
}
