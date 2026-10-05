import { describe, expect, it } from 'vitest';
import {
  basicMinorDiameter,
  basicPitchDiameter,
  basicThreadDepth,
  isoExternalMinorDiameter,
  sharpVHeight,
} from '../src/calculators/thread/geometry';
import { bestWire, overWiresFromPitchDia, pitchDiaFromOverWires, wireFit } from '../src/calculators/thread/wire';
import { solveThread, type ThreadInputs } from '../src/calculators/thread/engine';
import { buildThreadInputs, defaultForm, type ThreadForm } from '../src/calculators/thread/form';
import { parseDesignation, parseUnifiedSize } from '../src/calculators/thread/unified';
import { DEFAULT_SETTINGS } from '../src/core/settings-model';

const base = (o: Partial<ThreadInputs> = {}): ThreadInputs => ({
  system: 'unified',
  unit: 'in',
  designation: '3/8-16 UNC',
  majorDia: 0.375,
  pitch: 1 / 16,
  external: true,
  classLabel: '2A',
  actualWire: null,
  targetPitchDia: null,
  manualLimits: null,
  measuredOverWires: null,
  ...o,
});

describe('60° geometry', () => {
  it('H = 0.866025·P', () => expect(sharpVHeight(1)).toBeCloseTo(0.8660254038, 10));
  it('3/8-16 basic PD = .375 − .6495/16 = 0.334 4...', () => {
    expect(basicPitchDiameter(0.375, 1 / 16)).toBeCloseTo(0.375 - 0.649519053 / 16, 9);
    expect(basicPitchDiameter(0.375, 1 / 16)).toBeCloseTo(0.3344, 4);
  });
  it('M10x1.5 basic PD = 9.026, D1 = 8.376, d3 = 8.160', () => {
    expect(basicPitchDiameter(10, 1.5)).toBeCloseTo(9.026, 3);
    expect(basicMinorDiameter(10, 1.5)).toBeCloseTo(8.376, 3);
    expect(isoExternalMinorDiameter(10, 1.5)).toBeCloseTo(8.160, 3);
  });
  it('thread depth 5H/8 = 0.541266·P', () => expect(basicThreadDepth(1)).toBeCloseTo(0.5412658774, 9));
});

describe('three-wire', () => {
  it('best wire = 0.57735·P', () => expect(bestWire(1)).toBeCloseTo(0.5773502692, 10));
  it('M = E + 3W − 0.866025P', () => {
    const E = 0.3344,
      W = 0.036,
      P = 1 / 16;
    expect(overWiresFromPitchDia(E, W, P)).toBeCloseTo(E + 3 * W - 0.8660254038 * P, 10);
  });
  it('known handbook case: 1/4-20 best wire .02887, M = E + 3W − .04330', () => {
    const P = 0.05;
    const W = bestWire(P);
    expect(W).toBeCloseTo(0.028868, 6);
    // E basic 1/4-20 = .25 − .6495/20 = .217524
    const E = basicPitchDiameter(0.25, P);
    expect(overWiresFromPitchDia(E, W, P)).toBeCloseTo(E + 3 * W - 0.04330127, 7);
  });
  it('best wire contacts exactly at the pitch line', () => {
    for (const P of [0.0625, 0.05, 1.5, 0.8]) {
      const f = wireFit(bestWire(P), P);
      expect(f.contactOffset).toBeCloseTo(0, 12);
      expect(f.contactsFlank).toBe(true);
      expect(f.anvilBearsOnWire).toBe(true);
    }
  });
  it('round trip PD → M → PD', () => {
    const P = 1.5;
    const M = overWiresFromPitchDia(9.026, 0.866, P);
    expect(pitchDiaFromOverWires(M, 0.866, P)).toBeCloseTo(9.026, 12);
  });
  it('wire-fit boundaries match derived limits (≈0.289P … 1.010P, practical ≥ 0.505P)', () => {
    const f = wireFit(0.5, 1);
    expect(f.minContactWire).toBeCloseTo(0.288675, 5);
    expect(f.maxContactWire).toBeCloseTo(1.010363, 5);
    expect(f.minPracticalWire).toBeCloseTo(0.505181, 5);
    expect(wireFit(0.2, 1).contactsFlank).toBe(false);
    expect(wireFit(1.2, 1).contactsFlank).toBe(false);
    expect(wireFit(0.52, 1).anvilBearsOnWire).toBe(true);
    expect(wireFit(0.45, 1).anvilBearsOnWire).toBe(false);
  });
});

describe('solveThread — unified', () => {
  it('3/8-16 external, best wire, geometry only', () => {
    const r = solveThread(base());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const v = r.value;
    expect(v.wireSource).toBe('best');
    expect(v.bestWire).toBeCloseTo(0.036084, 5);
    expect(v.targetPitchDia).toBeCloseTo(v.basicPitchDia, 12);
    expect(v.overWires!.target).toBeCloseTo(v.basicPitchDia + 3 * v.wireUsed - (Math.sqrt(3) / 2) / 16, 9);
    expect(v.overWires!.min).toBeNull();
    expect(v.statuses).toContain('GEOMETRY ONLY');
    expect(v.statuses).toContain('STANDARD LIMITS NOT VERIFIED');
    expect(v.statuses).not.toContain('VERIFIED');
    expect(v.tpi).toBeCloseTo(16, 9);
  });
  it('uses the ACTUAL wire when entered', () => {
    const best = solveThread(base());
    const act = solveThread(base({ actualWire: 0.036 }));
    if (!best.ok || !act.ok) throw new Error('should solve');
    expect(act.value.wireSource).toBe('actual');
    expect(act.value.wireUsed).toBe(0.036);
    expect(act.value.overWires!.target).toBeCloseTo(act.value.basicPitchDia + 3 * 0.036 - (Math.sqrt(3) / 2) / 16, 10);
    expect(act.value.overWires!.target).not.toBeCloseTo(best.value.overWires!.target, 6);
  });
  it('manual limits → MANUAL status, midpoint target, min/max over wires', () => {
    const r = solveThread(base({ actualWire: 0.036, manualLimits: { pdMin: 0.3297, pdMax: 0.3333 } }));
    if (!r.ok) throw new Error('should solve');
    const v = r.value;
    expect(v.statuses).toContain('MANUAL');
    expect(v.limits!.source).toBe('manual');
    expect(v.targetSource).toBe('manual-midpoint');
    expect(v.targetPitchDia).toBeCloseTo(0.3315, 12);
    expect(v.overWires!.min!).toBeCloseTo(0.3297 + 3 * 0.036 - (Math.sqrt(3) / 2) / 16, 9);
    expect(v.overWires!.max!).toBeCloseTo(0.3333 + 3 * 0.036 - (Math.sqrt(3) / 2) / 16, 9);
    expect(v.overWires!.min!).toBeLessThan(v.overWires!.target);
    expect(v.overWires!.target).toBeLessThan(v.overWires!.max!);
    expect(v.statuses).not.toContain('GEOMETRY ONLY');
  });
  it('measured over wires → pitch diameter and verdict vs manual limits', () => {
    const lim = { pdMin: 0.3297, pdMax: 0.3333 };
    const W = 0.036;
    const mAt = (e: number) => overWiresFromPitchDia(e, W, 1 / 16);
    const within = solveThread(base({ actualWire: W, manualLimits: lim, measuredOverWires: mAt(0.331) }));
    const low = solveThread(base({ actualWire: W, manualLimits: lim, measuredOverWires: mAt(0.329) }));
    const high = solveThread(base({ actualWire: W, manualLimits: lim, measuredOverWires: mAt(0.334) }));
    const none = solveThread(base({ actualWire: W, measuredOverWires: mAt(0.331) }));
    if (!within.ok || !low.ok || !high.ok || !none.ok) throw new Error('should solve');
    expect(within.value.measured!.verdict).toBe('within');
    expect(within.value.measured!.pitchDia).toBeCloseTo(0.331, 10);
    expect(low.value.measured!.verdict).toBe('below');
    expect(high.value.measured!.verdict).toBe('above');
    expect(none.value.measured!.verdict).toBe('no-limits');
  });
  it('internal threads: no 3-wire results, geometry still given', () => {
    const r = solveThread(base({ external: false, classLabel: '2B' }));
    if (!r.ok) throw new Error('should solve');
    expect(r.value.overWires).toBeNull();
    expect(r.value.basicMinorDia).toBeCloseTo(0.375 - 1.0825318 / 16, 7);
  });
});

describe('solveThread — metric & custom', () => {
  it('M10×1.5 external best wire 0.866 mm', () => {
    const r = solveThread(base({ system: 'metric', unit: 'mm', majorDia: 10, pitch: 1.5, classLabel: '6g', designation: 'M10 × 1.5' }));
    if (!r.ok) throw new Error('should solve');
    expect(r.value.bestWire).toBeCloseTo(0.866025, 5);
    expect(r.value.basicPitchDia).toBeCloseTo(9.026, 3);
    expect(r.value.overWires!.target).toBeCloseTo(9.026 + 3 * 0.866025 - 0.866025 * 1.5, 3);
    expect(r.value.isoExternalMinorDia).toBeCloseTo(8.160, 3);
    expect(r.value.tpi).toBeCloseTo(25.4 / 1.5, 9);
  });
  it('custom with target PD override and CUSTOM status', () => {
    const r = solveThread(base({ system: 'custom', unit: 'in', classLabel: '', targetPitchDia: 0.335 }));
    if (!r.ok) throw new Error('should solve');
    expect(r.value.targetSource).toBe('custom');
    expect(r.value.targetPitchDia).toBe(0.335);
    expect(r.value.statuses).toContain('CUSTOM');
    expect(r.value.statuses).not.toContain('STANDARD LIMITS NOT VERIFIED');
    expect(r.value.standards.status).toBe('n/a');
  });
});

describe('solveThread — invalid input and impossible geometry', () => {
  const bad = (o: Partial<ThreadInputs>) => {
    const r = solveThread(base(o));
    expect(r.ok).toBe(false);
    return r.ok ? [] : r.issues;
  };
  it('zero / negative / NaN', () => {
    bad({ majorDia: 0 });
    bad({ majorDia: -1 });
    bad({ pitch: 0 });
    bad({ pitch: Number.NaN });
  });
  it('pitch too coarse for diameter', () => {
    const i = bad({ majorDia: 0.1, pitch: 0.2 });
    expect(i[0]!.message).toMatch(/too coarse/);
  });
  it('wire that does not seat on flanks', () => {
    expect(bad({ actualWire: 0.01 })[0]!.field).toBe('wire');
    expect(bad({ actualWire: 0.2 })[0]!.field).toBe('wire');
    expect(bad({ actualWire: -0.036 })[0]!.field).toBe('wire');
  });
  it('small-but-seating wire gives an advisory, not a result', () => {
    const r = solveThread(base({ actualWire: 0.0305 })); // 0.488P: seats, anvil may touch crest
    if (!r.ok) throw new Error('should solve');
    expect(r.value.advisories.some((a) => /anvil/.test(a))).toBe(true);
  });
  it('manual limits sanity', () => {
    expect(bad({ manualLimits: { pdMin: 0.334, pdMax: 0.330 } })[0]!.field).toBe('limitMin');
    expect(bad({ manualLimits: { pdMin: 0.3, pdMax: 0.4 } })[0]!.field).toBe('limitMax');
    expect(bad({ manualLimits: { pdMin: -1, pdMax: 0.33 } })[0]!.field).toBe('limitMin');
  });
  it('impossible measured reading', () => {
    expect(bad({ measuredOverWires: 0.01 })[0]!.field).toBe('measured');
  });
  it('never returns NaN/Infinity in a successful result', () => {
    const r = solveThread(base({ actualWire: 0.036, manualLimits: { pdMin: 0.3297, pdMax: 0.3333 } }));
    if (!r.ok) throw new Error('should solve');
    const nums: number[] = [];
    const walk = (o: unknown): void => {
      if (typeof o === 'number') nums.push(o);
      else if (o && typeof o === 'object') Object.values(o).forEach(walk);
    };
    walk(r.value);
    expect(nums.every(Number.isFinite)).toBe(true);
  });
});

describe('form → inputs', () => {
  const f = (o: Partial<ThreadForm>): ThreadForm => ({ ...defaultForm('unified', DEFAULT_SETTINGS), ...o });
  it('converts TPI to pitch and understands leading decimals', () => {
    const r = buildThreadInputs(f({ majorText: '.375', pitchText: '16', wireText: '.036' }));
    if (!r.ok) throw new Error('should build');
    expect(r.value.pitch).toBeCloseTo(0.0625, 12);
    expect(r.value.actualWire).toBe(0.036);
    expect(r.value.designation).toBe('3/8-16 UNC');
    expect(r.value.classLabel).toBe('2A');
  });
  it('metric', () => {
    const r = buildThreadInputs({ ...defaultForm('metric', DEFAULT_SETTINGS), majorText: '10', pitchText: '1.5' });
    if (!r.ok) throw new Error('should build');
    expect(r.value.unit).toBe('mm');
    expect(r.value.designation).toBe('M10 × 1.5');
  });
  it('custom TPI in mm units converts with 25.4', () => {
    const r = buildThreadInputs({ ...defaultForm('custom', DEFAULT_SETTINGS), unit: 'mm', pitchMode: 'tpi', majorText: '20', pitchText: '12.7' });
    if (!r.ok) throw new Error('should build');
    expect(r.value.pitch).toBeCloseTo(2, 12);
  });
  it('field-level messages for blank / malformed / half-entered limits', () => {
    const r = buildThreadInputs(f({ majorText: '', pitchText: '1.2.3', limitMinText: '.33' }));
    expect(r.ok).toBe(false);
    if (r.ok) return;
    const fields = r.issues.map((i) => i.field);
    expect(fields).toContain('major');
    expect(fields).toContain('pitch');
  });
  it('half-entered manual limits are rejected', () => {
    const r = buildThreadInputs(f({ majorText: '.375', pitchText: '16', limitMinText: '.33' }));
    expect(r.ok).toBe(false);
  });
});

describe('designation parsing', () => {
  it('parses unified quick entry', () => {
    expect(parseDesignation('3/8-16')).toMatchObject({ system: 'unified', major: 0.375, tpi: 16 });
    expect(parseDesignation('#10-32')).toMatchObject({ major: 0.19, tpi: 32 });
    expect(parseDesignation('1-1/8-7 UNC')).toMatchObject({ major: 1.125, tpi: 7 });
    expect(parseDesignation('.375-16')).toMatchObject({ major: 0.375, tpi: 16 });
    expect(parseDesignation('5/16-18 UNC')).toMatchObject({ major: 0.3125, tpi: 18 });
  });
  it('parses metric quick entry', () => {
    expect(parseDesignation('M10x1.5')).toMatchObject({ system: 'metric', major: 10, pitch: 1.5 });
    expect(parseDesignation('m8 × 1')).toMatchObject({ major: 8, pitch: 1 });
    expect(parseDesignation('M12')).toMatchObject({ major: 12, pitch: 1.75 });
  });
  it('returns null for junk', () => {
    expect(parseDesignation('')).toBeNull();
    expect(parseDesignation('hello')).toBeNull();
    expect(parseDesignation('3/8')).toBeNull();
    expect(parseDesignation('3/0-16')).toBeNull();
    expect(parseUnifiedSize('#99')).toBeNull();
  });
});
