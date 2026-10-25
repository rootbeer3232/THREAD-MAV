import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { TruePositionResult } from './engine';

export function presentTruePosition(r: TruePositionResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const mmc = r.input.mmc;
  const msgs: Presentation['messages'] = [
    { tone: 'info', text: 'Position is the DIAMETER of the circle around the true location: 2 × √(ΔX² + ΔY²). Tolerance is read as a cylindrical zone (Ø), not ± on each axis.' },
  ];
  if (r.sizePastMmc) msgs.unshift({ tone: 'warn', text: 'The actual size is past the MMC limit (outside its size tolerance), so no bonus was added. Check the size first.' });
  const dp = (v: number) => (r.unit === 'in' ? v.toFixed(4) : v.toFixed(3));
  return {
    title: 'True position',
    subtitle: `Ø ${dp(r.tolerance)} ${r.unit === 'in' ? 'in' : 'mm'} ${mmc ? `at MMC (${mmc.feature})` : 'RFS'}`,
    badges: [{ text: r.pass ? 'IN TOLERANCE' : 'OUT OF TOLERANCE', tone: r.pass ? 'verified' : 'warn' }],
    status: { level: r.pass ? 'green' : 'red', text: r.pass ? `IN TOLERANCE — ${r.percentUsed.toFixed(1)}% of the zone used` : `OUT OF TOLERANCE — ${r.percentUsed.toFixed(1)}% of the zone` },
    sections: [
      { title: 'Result', rows: [{ label: 'True position (Ø)', dual: d(r.position), size: 'hero' }, { label: r.pass ? 'Left in the zone' : 'Over by', dual: d(Math.abs(r.remaining)), size: 'normal' }, { label: 'Zone used', text: `${r.percentUsed.toFixed(1)}%`, size: 'normal' }] },
      {
        title: 'Deviation',
        rows: [
          { label: 'ΔX (actual − nominal)', dual: d(r.dx), size: 'normal' },
          { label: 'ΔY (actual − nominal)', dual: d(r.dy), size: 'normal' },
          { label: 'Radial offset', dual: d(r.radial), size: 'normal' },
        ],
      },
      {
        title: 'Tolerance',
        rows: [
          { label: 'Stated tolerance (Ø)', dual: d(r.tolerance), size: 'normal' },
          ...(mmc ? [{ label: 'MMC bonus', dual: d(r.bonus), size: 'normal' as const }] : []),
          { label: 'Allowed position (Ø)', dual: d(r.allowed), size: 'normal' },
        ],
      },
    ],
    messages: msgs,
  };
}
