import { fmtLoose } from '../../core/format';
import type { Presentation } from '../../core/results';
import { dualFrom } from '../../core/units';
import type { ThreadDepthResult } from './engine';

export function presentThreadDepth(r: ThreadDepthResult): Presentation {
  const d = (v: number) => dualFrom(v, r.unit);
  const dp = (v: number) => (r.unit === 'in' ? v.toFixed(4) : v.toFixed(3));
  const hasX = r.finalX !== null;
  const msgs: Presentation['messages'] = [
    { tone: 'info', text: 'Passes follow the constant-area rule (cumulative depth = first pass × √pass number), the same idea Haas G76 uses, so each cut removes about the same chip area. Add spring passes at the final depth as your tool and material need.' },
    { tone: 'info', text: `Compound feed: slide travel = depth ÷ cos(${fmtLoose(r.input.angleDeg, 3)}°); the tool also moves in Z by depth × tan(${fmtLoose(r.input.angleDeg, 3)}°) from touch-off. Set the compound ${fmtLoose(r.input.angleDeg, 3)}° off the cross-slide, feeding along the leading flank. For G76 use K = thread height and the first-pass depth below; check the exact letters on your control.` },
  ];
  if (r.derivedFromFirst) msgs.unshift({ tone: 'info', text: `${r.passes.length} passes needed. The first pass was adjusted to ${dp(r.firstPass)} ${r.unit === 'in' ? 'in' : 'mm'} so the last pass lands exactly on full depth.` });
  return {
    title: `${r.external ? 'External' : 'Internal'} thread infeed`,
    subtitle: `${r.passes.length} passes · depth ${dp(r.totalDepth)} ${r.unit === 'in' ? 'in' : 'mm'} (radius)`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections: [
      {
        title: 'Thread depth',
        rows: [
          { label: 'Thread depth (radius)', dual: d(r.totalDepth), size: 'hero' },
          { label: 'Diameter change (2 × depth)', dual: d(r.diaChange), size: 'normal' },
          { label: 'First pass', dual: d(r.firstPass), size: 'normal' },
          ...(hasX ? [{ label: r.external ? 'Final root diameter' : 'Final major diameter (bore)', dual: d(r.finalX!), size: 'normal' as const }] : []),
        ],
      },
      {
        title: 'Compound infeed',
        xyCols: [hasX ? 'X (dia)' : 'Depth (radius)', 'Compound travel'],
        rows: r.passes.map((p) => ({ label: `Pass ${p.n}`, size: 'normal' as const, xy: { angle: `cut ${dp(p.cut)}`, x: d(hasX ? p.x! : p.depth), y: d(p.compound) } })),
      },
      {
        title: 'Depth and Z shift',
        xyCols: ['Depth (radius)', 'Z shift'],
        rows: r.passes.map((p) => ({ label: `Pass ${p.n}`, size: 'normal' as const, xy: { angle: '', x: d(p.depth), y: d(p.zShift) } })),
      },
    ],
    messages: msgs,
  };
}
