import { type FormatOptions, fmtLoose } from '../../core/format';
import type { Presentation, ResultRow, ResultSection } from '../../core/results';
import { MM_PER_INCH } from '../../core/units';
import type { SpeedsResult } from './engine';

const NAMES = { mill: 'Milling', turn: 'Turning', drill: 'Drilling' } as const;

const fmtRpm = (n: number) => (n >= 100 ? Math.round(n).toLocaleString('en-US') : n.toFixed(1));

export function presentSpeeds(r: SpeedsResult, _o: FormatOptions): Presentation {
  const i = r.input;
  const u = i.unit;
  const len = (inch: number) => ({ in: inch, mm: inch * MM_PER_INCH, primary: u });
  const diaTxt = u === 'in' ? `Ø ${r.diameterIn.toFixed(4)}"` : `Ø ${i.diameter.toFixed(2)} mm`;
  const speedTxt = u === 'in' ? `${fmtLoose(r.sfm, 1)} SFM` : `${fmtLoose(r.mpm, 1)} m/min`;

  const sections: ResultSection[] = [];

  sections.push({
    title: 'Spindle',
    rows: [
      {
        label: r.limited ? 'Spindle speed (limited)' : 'Spindle speed',
        text: `${fmtRpm(r.rpm)} RPM`,
        ...(r.limited ? { altText: `ideal ${fmtRpm(r.rpmIdeal)} RPM`, tag: { text: 'SPINDLE LIMIT', tone: 'warn' as const } } : {}),
        size: 'hero',
      },
    ],
  });

  if (r.feedRateIpm !== null) {
    sections.push({
      title: 'Feed',
      rows: [
        {
          label: i.process === 'mill' ? 'Table feed rate' : 'Feed rate',
          dual: { in: r.feedRateIpm, mm: r.feedRateIpm * MM_PER_INCH, primary: u },
          fmt: { a: 2, b: 1 },
          syms: [' in/min', ' mm/min'],
          heroCaps: ['IN / MIN', 'MM / MIN'],
          size: 'hero',
        },
      ],
    });
  }

  const surface: ResultRow[] = [
    { label: r.limited ? 'Surface speed (at limit)' : 'Surface speed', dual: { in: r.sfm, mm: r.mpm, primary: u }, fmt: { a: 1, b: 1 }, syms: ['SFM', 'm/min'], size: 'normal' },
  ];
  if (r.limited) surface.push({ label: 'Ideal surface speed', dual: { in: r.sfmIdeal, mm: r.sfmIdeal * 0.3048, primary: u }, fmt: { a: 1, b: 1 }, syms: ['SFM', 'm/min'], size: 'normal' });
  sections.push({ title: 'Surface speed', cols: [{ t: 'SFM', s: 'ft/min' }, { t: 'm/min', s: 'METRIC' }], rows: surface });

  const feedRows: ResultRow[] = [{ label: i.process === 'mill' ? 'Tool diameter' : i.process === 'turn' ? 'Work diameter' : 'Drill diameter', dual: len(r.diameterIn), size: 'normal' }];
  if (r.feedPerToothIn !== null) feedRows.push({ label: 'Chip load per tooth', dual: len(r.feedPerToothIn), size: 'normal', extraDecimals: 1 });
  if (r.feedPerRevIn !== null) feedRows.push({ label: 'Feed per revolution', dual: len(r.feedPerRevIn), size: 'normal', extraDecimals: 1 });
  if (i.process === 'mill' && i.flutes) feedRows.push({ label: 'Flutes', text: String(i.flutes), size: 'normal' });
  sections.push({ title: 'Tool & feed', rows: feedRows });

  const messages: Presentation['messages'] = [
    { tone: 'info', text: 'Surface speed and chip load come from YOUR tool and material data. Thread Mav only does the arithmetic — it does not recommend cutting parameters.' },
    { tone: 'info', text: 'RPM = SFM × 12 ÷ (π × Ø in)' + (r.feedRateIpm !== null ? `   ·   Feed = RPM × ${i.process === 'mill' ? 'flutes × chip load' : 'feed per rev'}` : '') },
    ...r.advisories.map((a) => ({ tone: 'warn' as const, text: a })),
  ];

  return {
    title: `${NAMES[i.process]} speeds & feeds`,
    subtitle: `${diaTxt} · ${speedTxt}`,
    badges: [{ text: 'CALCULATED', tone: 'geometry' }],
    sections,
    messages,
  };
}
