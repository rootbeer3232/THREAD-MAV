import { dualFrom } from '../../core/units';
import type { ContourSolution, Source } from '../../core/contour/types';
import type { Presentation, ResultRow } from '../../core/results';

const SRC: Record<Source, string> = { given: 'given', solved: 'solved', unknown: 'unknown' };

/** Contour solution (mm internally) -> Presentation. Coordinates are only shown for GREEN/AMBER results. */
export function presentContour(sol: ContourSolution, side: 'od' | 'id'): Presentation {
  const msgs: Presentation['messages'] = sol.messages
    .filter((m) => m.level !== 'info')
    .map((m) => ({ tone: m.level === 'red' ? ('warn' as const) : ('warn' as const), text: m.level === 'red' ? `STOP — ${m.text}` : m.text }));
  const info: Presentation['messages'] = [
    { tone: 'info', text: 'X = diameter. Z is measured from program zero (P0), negative toward the chuck. Straight steps, shoulders and tapers so far — radii are coming.' },
  ];

  const level = sol.status;
  const statusText = level === 'green' ? 'SOLVED — all dimensions determined' : level === 'amber' ? 'MORE INFORMATION NEEDED' : 'STOP — conflicting or impossible geometry';

  if (level === 'red') {
    return { title: `Contour IQ — ${side.toUpperCase()}`, subtitle: 'Not solved', badges: [], status: { level, text: statusText }, sections: [], messages: [...msgs, ...info] };
  }

  const dual = (mm: number) => dualFrom(mm, 'mm');
  const coordRows: ResultRow[] = sol.points.map((p, i) => ({
    label: `P${i + 1}`,
    size: 'normal' as const,
    xy: {
      angle: `X ${SRC[p.xSource]} · Z ${SRC[p.zSource]}`,
      x: dual(p.x ?? Number.NaN),
      y: dual(p.z ?? Number.NaN),
    },
  }));
  const known = sol.points.map((p) => p.x !== null || p.z !== null);
  const rows = coordRows.filter((_, i) => known[i]);

  const tagOf = (src: Source) => (src === 'unknown' ? undefined : { text: src === 'given' ? 'GIVEN' : 'SOLVED', tone: src === 'given' ? ('geometry' as const) : ('verified' as const) });
  const segRows: ResultRow[] = sol.segments.flatMap((s, i): ResultRow[] => {
    const head = `P${i + 1} → P${i + 2}`;
    if (s.kind === 'taper' && s.taper) {
      const t = s.taper;
      const rows: ResultRow[] = [];
      const withTag = (r: ResultRow, src: Source): ResultRow => {
        const tag = tagOf(src);
        return tag ? { ...r, tag } : r;
      };
      rows.push(withTag({ label: `${head}  taper — axial length`, ...(t.length !== null ? { dual: dual(t.length) } : { text: 'unknown' }), size: 'normal' }, t.lengthSource));
      if (t.dx !== null) {
        rows.push(withTag({ label: `${head}  taper — diameter change (X)`, dual: dual(t.dx), size: 'normal' }, t.dxSource));
        rows.push({ label: `${head}  taper — change per side (radius)`, dual: dual(t.dx / 2), size: 'normal' });
      } else rows.push({ label: `${head}  taper — diameter change (X)`, text: 'unknown', size: 'normal' });
      rows.push(
        withTag(
          {
            label: `${head}  taper — angle from the axis`,
            ...(t.angle !== null ? { text: `${t.angle.toFixed(4)}°`, altText: `${(90 - t.angle).toFixed(4)}° from the end face` } : { text: 'unknown' }),
            size: 'normal',
          },
          t.angleSource,
        ),
      );
      return rows;
    }
    return [
      {
        label: `${head}  ${s.kind === 'straight' ? 'straight (length)' : 'shoulder (diameter change)'}`,
        ...(s.value !== null ? { dual: dual(s.value) } : { text: 'unknown' }),
        ...(tagOf(s.source) ? { tag: tagOf(s.source)! } : {}),
        size: 'normal' as const,
      },
    ];
  });

  return {
    title: `Contour IQ — ${side.toUpperCase()}`,
    subtitle: `${sol.points.length} points · ${sol.segments.length} segments · X diameter, Z from P0`,
    badges: [{ text: level === 'green' ? 'SOLVED' : 'PARTIAL', tone: level === 'green' ? 'verified' : 'warn' }],
    status: { level, text: statusText },
    sections: [
      { title: 'Coordinates', xyCols: ['X (dia)', 'Z'], rows },
      { title: 'Segments', rows: segRows },
    ],
    messages: [...msgs, ...info],
  };
}
