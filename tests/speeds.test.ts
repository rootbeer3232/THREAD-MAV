import { describe, expect, it } from 'vitest';
import { solveSpeeds, type SpeedsInput } from '../src/calculators/speeds/engine';

const base = (o: Partial<SpeedsInput> = {}): SpeedsInput => ({
  process: 'mill', unit: 'in', diameter: 0.5, basis: 'speed', surfaceSpeed: 100, rpm: null, feed: null, flutes: 4, maxRpm: null, ...o,
});
const val = (i: SpeedsInput) => {
  const r = solveSpeeds(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('speeds & feeds', () => {
  it('RPM = SFM×12/(π D): 1/2" at 100 SFM = 763.94', () => expect(val(base()).rpm).toBeCloseTo(763.9437, 3));
  it('metric: 10 mm at 100 m/min = 3183.1 RPM, 328.08 SFM', () => {
    const v = val(base({ unit: 'mm', diameter: 10, surfaceSpeed: 100 }));
    expect(v.rpm).toBeCloseTo(3183.0989, 3);
    expect(v.sfm).toBeCloseTo(328.084, 2);
    expect(v.mpm).toBeCloseTo(100, 9);
  });
  it('milling feed rate = RPM × flutes × chip load', () => {
    const v = val(base({ diameter: 0.5, surfaceSpeed: 400, feed: 0.002, flutes: 4 }));
    expect(v.feedRateIpm).toBeCloseTo(v.rpm * 4 * 0.002, 9);
    expect(v.feedPerToothIn).toBe(0.002);
  });
  it('turning: 2" at 300 SFM, .010 IPR', () => {
    const v = val(base({ process: 'turn', diameter: 2, surfaceSpeed: 300, feed: 0.01, flutes: null }));
    expect(v.rpm).toBeCloseTo(572.9578, 3);
    expect(v.feedRateIpm).toBeCloseTo(5.729578, 4);
    expect(v.feedPerToothIn).toBeNull();
  });
  it('starting from RPM gives SFM and m/min', () => {
    const v = val(base({ basis: 'rpm', rpm: 1000, surfaceSpeed: null, diameter: 1 }));
    expect(v.sfm).toBeCloseTo((Math.PI * 1000) / 12, 9);
    expect(v.mpm).toBeCloseTo(v.sfm * 0.3048, 9);
  });
  it('metric feed converts to in/min consistently', () => {
    const v = val(base({ unit: 'mm', diameter: 10, surfaceSpeed: 100, feed: 0.05, flutes: 2 }));
    expect(v.feedRateIpm! * 25.4).toBeCloseTo(v.rpm * 2 * 0.05, 6);
  });
  it('spindle limit clamps RPM and reports the real surface speed', () => {
    const v = val(base({ diameter: 0.125, surfaceSpeed: 400, maxRpm: 8000, feed: 0.001 }));
    expect(v.rpmIdeal).toBeGreaterThan(8000);
    expect(v.limited).toBe(true);
    expect(v.rpm).toBe(8000);
    expect(v.sfm).toBeCloseTo((Math.PI * 0.125 * 8000) / 12, 9);
    expect(v.feedRateIpm).toBeCloseTo(8000 * 4 * 0.001, 9);
    expect(v.advisories.length).toBe(1);
  });
  it('rejects bad input with plain messages', () => {
    for (const bad of [
      base({ diameter: 0 }), base({ diameter: -1 }), base({ diameter: Number.NaN }),
      base({ surfaceSpeed: null }), base({ basis: 'rpm', rpm: null, surfaceSpeed: null }),
      base({ feed: 0.002, flutes: 0 }), base({ feed: 0.002, flutes: 2.5 }), base({ feed: -0.1 }), base({ maxRpm: -5 }),
    ]) {
      const r = solveSpeeds(bad);
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.issues[0]!.message.length).toBeGreaterThan(8);
    }
  });
  it('never returns NaN or Infinity', () => {
    const v = val(base({ feed: 0.003 }));
    expect([v.rpm, v.sfm, v.mpm, v.feedRateIpm!].every(Number.isFinite)).toBe(true);
  });
});
