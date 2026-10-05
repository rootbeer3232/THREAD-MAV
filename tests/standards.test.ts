import { describe, expect, it } from 'vitest';
import { lookupStandardLimits, recordProblems, type StandardLimitRecord } from '../src/calculators/thread/standards/gate';
import { VERIFIED_RECORDS } from '../src/calculators/thread/standards/records';
import { solveThread } from '../src/calculators/thread/engine';

/** TEST FIXTURE ONLY — fabricated numbers used to exercise the gate. Never shipped in records.ts. */
const fixture = (o: Partial<StandardLimitRecord> = {}): StandardLimitRecord => ({
  standard: 'ASME B1.1',
  edition: '2024',
  system: 'unified',
  majorDia: 0.375,
  pitchOrTpi: 16,
  classLabel: '2A',
  external: true,
  unit: 'in',
  pdMin: 0.3,
  pdMax: 0.31,
  provenance: 'fixture',
  verifiedBy: 'tester',
  verifiedOn: '2026-01-01',
  verified: true,
  ...o,
});
const q = { system: 'unified' as const, majorDia: 0.375, pitchOrTpi: 16, classLabel: '2A', external: true, unit: 'in' as const };

describe('standards gate (fail closed)', () => {
  it('ships with NO verified records', () => {
    expect(VERIFIED_RECORDS.length).toBe(0);
    expect(lookupStandardLimits(q, VERIFIED_RECORDS).status).toBe('not-verified');
  });
  it('accepts a fully verified, unique record', () => {
    expect(lookupStandardLimits(q, [fixture()]).status).toBe('verified');
  });
  it.each([
    ['wrong edition', { edition: '2001' }],
    ['no provenance', { provenance: '' }],
    ['no verifier', { verifiedBy: ' ' }],
    ['bad date', { verifiedOn: 'someday' }],
    ['not flagged verified', { verified: false }],
    ['min >= max', { pdMin: 0.31, pdMax: 0.3 }],
    ['NaN value', { pdMax: Number.NaN }],
    ['metric edition not allowed', { standard: 'ISO 965-1' as const, edition: '2013' }],
  ])('rejects: %s', (_n, o) => {
    expect(lookupStandardLimits(q, [fixture(o)]).status).toBe('not-verified');
    expect(recordProblems(fixture(o)).length).toBeGreaterThan(0);
  });
  it('rejects duplicate matching records', () => {
    expect(lookupStandardLimits(q, [fixture(), fixture()]).status).toBe('not-verified');
  });
  it('ignores non-matching records', () => {
    expect(lookupStandardLimits(q, [fixture({ classLabel: '3A' })]).status).toBe('not-verified');
  });
  it('engine uses verified limits only when the gate passes, manual overrides', () => {
    const inp = {
      system: 'unified' as const, unit: 'in' as const, designation: '3/8-16', majorDia: 0.375, pitch: 1 / 16,
      external: true, classLabel: '2A', actualWire: 0.036, targetPitchDia: null, manualLimits: null, measuredOverWires: null,
    };
    const v = solveThread(inp, [fixture()]);
    if (!v.ok) throw new Error('solve');
    expect(v.value.statuses).toContain('VERIFIED');
    expect(v.value.limits!.source).toBe('verified');
    const m = solveThread({ ...inp, manualLimits: { pdMin: 0.32, pdMax: 0.33 } }, [fixture()]);
    if (!m.ok) throw new Error('solve');
    expect(m.value.limits!.source).toBe('manual');
    const bad = solveThread(inp, [fixture({ verified: false })]);
    if (!bad.ok) throw new Error('solve');
    expect(bad.value.limits).toBeNull();
    expect(bad.value.statuses).not.toContain('VERIFIED');
  });
});
