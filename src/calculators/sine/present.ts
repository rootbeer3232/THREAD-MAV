import { type FormatOptions, fmtDeg, fmtDms, fmtLength } from '../../core/format';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { SineResult } from './engine';

export function presentSine(r: SineResult, o: FormatOptions): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const barText = r.unit === 'in' ? `${r.barLength.toFixed(3)}"` : `${r.barLength.toFixed(2)} mm`;
  const angleRow = (size: 'hero' | 'normal') => ({
    label: 'Angle',
    text: fmtDeg(r.angleDeg, 4),
    altText: fmtDms(r.angleDms),
    size,
  });
  const rows =
    r.mode === 'stack'
      ? [{ label: 'Gage-block stack height', dual: d(r.stackHeight), size: 'hero' as const }, angleRow('normal')]
      : [angleRow('hero'), { label: 'Gage-block stack height', dual: d(r.stackHeight), size: 'normal' as const }];
  return {
    title: `Sine Bar — ${barText}`,
    subtitle: r.mode === 'stack' ? `Find stack height @ ${fmtDeg(r.angleDeg, 4)}` : `Find angle from ${fmtLength(r.stackHeight, r.unit, o)} ${r.unit} stack`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      { title: r.mode === 'stack' ? 'Setup' : 'Angle', rows },
      { title: 'Sine bar', rows: [{ label: 'Roller center-to-center', dual: d(r.barLength), size: 'normal' }] },
    ],
    messages: [
      { tone: 'info', text: r.mode === 'stack' ? 'Stack = L × sin θ' : 'θ = asin( stack ÷ L )' },
      ...r.advisories.map((a) => ({ tone: 'warn' as const, text: a })),
    ],
  };
}
