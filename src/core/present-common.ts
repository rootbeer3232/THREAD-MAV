import { type FormatOptions, fmtDual } from './format';
import { fmtFixed } from './numeric';
import type { Presentation, ResultRow } from './results';
import type { SummaryLine } from '../storage/types';

/** One-line text for a row, e.g. "0.3344 in  (8.4938 mm)". */
export function rowText(r: ResultRow, o: FormatOptions): { value: string; alt?: string } {
  if (r.xy) {
    const x = fmtDual(r.xy.x, o);
    const y = fmtDual(r.xy.y, o);
    const p = r.xy.x.primary === 'in';
    return { value: p ? `X ${x.inch}  Y ${y.inch} in` : `X ${x.mm}  Y ${y.mm} mm`, alt: p ? `X ${x.mm}  Y ${y.mm} mm` : `X ${x.inch}  Y ${y.inch} in` };
  }
  if (r.dual && r.fmt) {
    const a = `${fmtFixed(r.dual.in, r.fmt.a)} ${r.syms?.[0] ?? ''}`.trim();
    const b = `${fmtFixed(r.dual.mm, r.fmt.b)} ${r.syms?.[1] ?? ''}`.trim();
    return r.dual.primary === 'in' ? { value: a, alt: b } : { value: b, alt: a };
  }
  if (r.dual) {
    const t = fmtDual(r.dual, o, r.extraDecimals ?? 0);
    return r.dual.primary === 'in'
      ? { value: `${t.inch} in`, alt: `${t.mm} mm` }
      : { value: `${t.mm} mm`, alt: `${t.inch} in` };
  }
  return r.altText ? { value: r.text ?? '', alt: r.altText } : { value: r.text ?? '' };
}

export function toSummary(p: Presentation, o: FormatOptions): SummaryLine[] {
  const out: SummaryLine[] = [];
  for (const sec of p.sections) {
    for (const r of sec.rows) {
      if (r.size === 'sub' && !r.dual && !r.text) continue;
      const t = rowText(r, o);
      if (!t.value) continue;
      const line: SummaryLine = { label: r.label, value: r.tag ? `${t.value} [${r.tag.text}]` : t.value };
      if (t.alt) line.alt = t.alt;
      out.push(line);
    }
  }
  return out;
}

export function toShareText(p: Presentation, o: FormatOptions, note: string, versionLabel: string): string {
  const lines: string[] = [`THREAD MAV — ${p.title}`, p.subtitle];
  if (p.badges.length) lines.push(`Status: ${p.badges.map((b) => b.text).join(' · ')}`);
  for (const sec of p.sections) {
    lines.push('');
    if (sec.title) lines.push(sec.title.toUpperCase());
    for (const r of sec.rows) {
      const t = rowText(r, o);
      if (!t.value) continue;
      const tag = r.tag ? ` [${r.tag.text}]` : '';
      lines.push(`${r.label}: ${t.value}${t.alt ? ` (${t.alt})` : ''}${tag}`);
    }
  }
  if (p.messages.length) {
    lines.push('');
    for (const m of p.messages) lines.push(`• ${m.text}`);
  }
  if (note.trim()) lines.push('', `NOTE: ${note.trim()}`);
  lines.push('', `${versionLabel} — verify critical dimensions against the print and shop procedures.`);
  return lines.join('\n');
}
