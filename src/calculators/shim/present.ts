import type { Presentation, ResultRow, ResultSection } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { ShimResult, ShimStack } from './engine';

export function presentShims(r: ShimResult): Presentation {
  const u = r.unit;
  const d = (v: number) => dualFrom(v, u);
  const th = (v: number) => (u === 'in' ? `${v.toFixed(4)}"` : `${v.toFixed(3)} mm`);
  const targetTxt = th(r.target);

  const stackSection = (title: string, s: ShimStack, hero: string): ResultSection => {
    const rows: ResultRow[] = [{ label: hero, dual: d(s.total), size: 'hero' }];
    if (Math.abs(s.difference) > r.resolution / 2) rows.push({ label: s.difference < 0 ? 'Short of the target by' : 'Over the target by', dual: d(Math.abs(s.difference)), size: 'normal', tag: { text: s.difference < 0 ? 'UNDER' : 'OVER', tone: 'warn' } });
    for (const l of s.lines) rows.push({ label: `${l.count} × ${th(l.thickness)}`, dual: d(l.count * l.thickness), size: 'normal' });
    rows.push({ label: 'Shims in the stack', text: String(s.shimCount), size: 'normal' });
    return { title, rows };
  };

  const sections: ResultSection[] = [];
  if (r.exact) sections.push(stackSection('Stack for the exact thickness', r.exact, 'Stack thickness'));
  else {
    if (r.under) sections.push(stackSection('Closest stack UNDER', r.under, 'Stack thickness (under)'));
    if (r.over) sections.push(stackSection('Closest stack OVER', r.over, 'Stack thickness (over)'));
  }
  return {
    title: 'Shim stack',
    subtitle: `Target ${targetTxt}`,
    badges: [r.exact ? { text: 'EXACT', tone: 'verified' } : { text: 'NO EXACT STACK', tone: 'warn' }],
    sections,
    messages: [
      ...r.advisories.map((a) => ({ tone: 'warn' as const, text: a })),
      { tone: 'info', text: 'Uses the fewest shims from the sizes you listed. Measure the finished stack — shims vary and compress.' },
    ],
  };
}
