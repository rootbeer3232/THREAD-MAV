/** ThreadResult -> UI-independent Presentation (rows, badges, messages). */
import { dualFrom } from '../../core/units';
import { fmtLoose } from '../../core/format';
import type { Presentation, ResultRow, Tag } from '../../core/results';
import type { StatusFlag, ThreadResult } from './engine';

const BADGE_TONE: Record<StatusFlag, Tag['tone']> = {
  VERIFIED: 'verified',
  CUSTOM: 'custom',
  MANUAL: 'manual',
  'GEOMETRY ONLY': 'geometry',
  'STANDARD LIMITS NOT VERIFIED': 'warn',
};

export function presentThread(r: ThreadResult): Presentation {
  const u = r.unit;
  const d = (v: number) => dualFrom(v, u);
  const inp = r.inputs;
  const limitTag: Tag | undefined = r.limits
    ? r.limits.source === 'manual'
      ? { text: 'MANUAL', tone: 'manual' }
      : { text: 'VERIFIED', tone: 'verified' }
    : undefined;

  const sections: Presentation['sections'] = [];

  if (inp.external && r.overWires) {
    const targetTag: Tag | undefined =
      r.targetSource === 'manual-midpoint'
        ? { text: r.limits?.source === 'verified' ? 'MID-LIMITS' : 'MID MANUAL LIMITS', tone: r.limits?.source === 'verified' ? 'verified' : 'manual' }
        : r.targetSource === 'custom'
          ? { text: 'CUSTOM TARGET', tone: 'custom' }
          : undefined;
    const rows: ResultRow[] = [
      { label: 'Over wires — Target', dual: d(r.overWires.target), size: 'hero', ...(targetTag ? { tag: targetTag } : {}) },
    ];
    if (r.overWires.min !== null && r.overWires.max !== null) {
      rows.push(
        { label: 'Over wires — Minimum', dual: d(r.overWires.min), size: 'normal', ...(limitTag ? { tag: limitTag } : {}) },
        { label: 'Over wires — Maximum', dual: d(r.overWires.max), size: 'normal', ...(limitTag ? { tag: limitTag } : {}) },
      );
    } else {
      rows.push({
        label: 'Over wires — Min / Max',
        text: 'not available',
        size: 'normal',
        hint: 'No verified standard limits are loaded. Tap MANUAL LIMITS and enter the pitch-diameter limits from your print or standard.',
      });
    }
    sections.push({ title: 'Measurement over 3 wires', rows });

    if (r.measured) {
      const m = r.measured;
      const verdictText =
        m.verdict === 'within' ? 'WITHIN LIMITS' : m.verdict === 'below' ? 'BELOW MINIMUM' : m.verdict === 'above' ? 'ABOVE MAXIMUM' : 'no limits to compare';
      sections.push({
        title: 'Your measurement',
        rows: [
          { label: 'Measured over wires', dual: d(m.overWires), size: 'normal' },
          { label: 'Pitch diameter from reading', dual: d(m.pitchDia), size: 'hero' },
          { label: 'Deviation from target PD', dual: d(m.deviationFromTarget), size: 'normal', extraDecimals: 0 },
          {
            label: 'Against limits',
            text: verdictText,
            size: 'normal',
            ...(m.verdict !== 'no-limits' && limitTag ? { tag: limitTag } : {}),
          },
        ],
      });
    }

    sections.push({
      title: 'Wire',
      rows: [
        { label: 'Best wire (theoretical)', dual: d(r.bestWire), extraDecimals: 1, size: 'normal' },
        {
          label: 'Wire used in calculation',
          dual: d(r.wireUsed),
          extraDecimals: 1,
          size: 'normal',
          tag: r.wireSource === 'actual' ? { text: 'ACTUAL', tone: 'info' } : { text: 'BEST — NO ACTUAL ENTERED', tone: 'warn' },
        },
      ],
    });
  }

  const pdRows: ResultRow[] = [
    {
      label: 'Target pitch diameter',
      dual: d(r.targetPitchDia),
      size: 'normal',
      ...(r.targetSource === 'manual-midpoint'
        ? { tag: { text: 'MID-LIMITS', tone: r.limits?.source === 'verified' ? ('verified' as const) : ('manual' as const) } }
        : r.targetSource === 'custom'
          ? { tag: { text: 'CUSTOM', tone: 'custom' as const } }
          : { tag: { text: 'BASIC', tone: 'geometry' as const } }),
    },
  ];
  if (r.targetSource !== 'basic') pdRows.push({ label: 'Basic pitch diameter', dual: d(r.basicPitchDia), size: 'normal', tag: { text: 'GEOMETRY', tone: 'geometry' } });
  if (r.limits) {
    pdRows.push(
      { label: 'Pitch diameter — Minimum', dual: d(r.limits.min), size: 'normal', ...(limitTag ? { tag: limitTag } : {}) },
      { label: 'Pitch diameter — Maximum', dual: d(r.limits.max), size: 'normal', ...(limitTag ? { tag: limitTag } : {}) },
    );
  }
  sections.push({ title: 'Pitch diameter', rows: pdRows });

  const geo: ResultRow[] = [
    { label: 'Major diameter', dual: d(r.majorDia), size: 'normal' },
    { label: inp.external ? 'Minor diameter — basic (D − 1.0825P)' : 'Minor diameter D1 (D − 1.0825P)', dual: d(r.basicMinorDia), size: 'normal' },
  ];
  if (r.isoExternalMinorDia !== null) geo.push({ label: 'Ext. minor d3 (ISO, D − 1.2269P)', dual: d(r.isoExternalMinorDia), size: 'normal' });
  geo.push({ label: 'Thread depth — basic (5H/8)', dual: d(r.basicThreadDepth), size: 'normal' });
  if (r.isoExternalThreadDepth !== null) geo.push({ label: 'Ext. thread depth h3 (ISO)', dual: d(r.isoExternalThreadDepth), size: 'normal' });
  geo.push({ label: 'Pitch', dual: d(r.pitch), size: 'normal' });
  geo.push({ label: 'Threads per inch', text: fmtLoose(r.tpi, 3), size: 'normal' });
  geo.push({ label: 'Sharp-V height H', dual: d(r.sharpVHeight), size: 'normal' });
  sections.push({ title: 'Thread geometry (60°)', rows: geo });

  const messages: Presentation['messages'] = [];
  if (inp.system === 'custom') {
    messages.push({ tone: 'info', text: 'CUSTOM THREAD — computed from the dimensions you entered. No standard applies.' });
  } else if (!r.verifiedRecord) {
    messages.push({
      tone: 'warn',
      text: `STANDARD LIMITS NOT VERIFIED — Thread Mav has no verified tolerance record for ${inp.designation} class ${inp.classLabel}. Values above are pure geometry${r.limits ? ' plus your MANUAL limits' : ''}; they are not standard acceptance limits.`,
    });
  } else {
    const v = r.verifiedRecord;
    messages.push({ tone: 'info', text: `Limits per ${v.standard}-${v.edition}; verified by ${v.verifiedBy} on ${v.verifiedOn}.` });
  }
  if (!inp.external) {
    messages.push({ tone: 'info', text: 'The 3-wire over-wires measurement applies to external threads. Internal threads are checked with thread gages; enter limits manually if you need them recorded.' });
  }
  for (const a of r.advisories) messages.push({ tone: 'warn', text: a });
  if (inp.external) messages.push({ tone: 'info', text: '3-wire formula: 60° straight flanks, no lead-angle correction. Verify critical dimensions.' });

  return {
    title: inp.designation,
    subtitle: [inp.classLabel ? `Class ${inp.classLabel}` : 'Custom', inp.external ? 'External' : 'Internal'].join(' · '),
    badges: r.statuses.map((s) => ({ text: s, tone: BADGE_TONE[s] })),
    sections,
    messages,
  };
}
