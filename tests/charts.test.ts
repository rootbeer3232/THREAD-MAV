import { describe, expect, it } from 'vitest';
import {
  ALL_DRILLS, FRACTION_DRILLS, INCH_DRILLS, LETTER_DRILL_LIST, METRIC_DRILLS, NUMBER_DRILL_LIST,
  drillForPercent, fractionName, nearestDrills, percentThread, tapDrillSet,
} from '../src/calculators/charts/drills';
import { METRIC_ROWS, UNIFIED_ROWS } from '../src/calculators/charts/threads';

describe('drill data', () => {
  it('has complete series', () => {
    expect(NUMBER_DRILL_LIST.length).toBe(80);
    expect(LETTER_DRILL_LIST.length).toBe(26);
    expect(FRACTION_DRILLS.length).toBe(96);
  });
  it('number drills (listed #80→#1) strictly grow in size; letters strictly grow', () => {
    for (let i = 1; i < NUMBER_DRILL_LIST.length; i++) expect(NUMBER_DRILL_LIST[i]!.inch).toBeGreaterThan(NUMBER_DRILL_LIST[i - 1]!.inch);
    for (let i = 1; i < LETTER_DRILL_LIST.length; i++) expect(LETTER_DRILL_LIST[i]!.inch).toBeGreaterThan(LETTER_DRILL_LIST[i - 1]!.inch);
  });
  it('end points: #80 .0135, #1 .228, A 5.94 mm, Z 10.49 mm', () => {
    expect(NUMBER_DRILL_LIST[0]!.inch).toBe(0.0135);
    expect(NUMBER_DRILL_LIST[79]!.inch).toBe(0.228);
    expect(LETTER_DRILL_LIST[0]!.mm).toBeCloseTo(5.94, 2);
    expect(LETTER_DRILL_LIST[25]!.mm).toBeCloseTo(10.49, 2);
    expect(NUMBER_DRILL_LIST[79]!.inch).toBeLessThan(LETTER_DRILL_LIST[0]!.inch); // #1 < A
  });
  it('fraction names reduce and use mixed numbers', () => {
    expect(fractionName(8)).toBe('1/8');
    expect(fractionName(27)).toBe('27/64');
    expect(fractionName(72)).toBe('1-1/8');
    expect(fractionName(64)).toBe('1');
  });
  it('metric drills are exact mm and sorted pool has no NaN', () => {
    expect(METRIC_DRILLS.find((d) => d.name === '8.5 mm')!.mm).toBe(8.5);
    expect(ALL_DRILLS.every((d) => Number.isFinite(d.inch) && d.inch > 0 && Math.abs(d.mm - d.inch * 25.4) < 1e-12)).toBe(true);
  });
});

describe('nearest drill search', () => {
  it('finds #7 for .201 and E for .25 (ties list both)', () => {
    expect(nearestDrills(0.201, 1)[0]!.drill.name).toBe('#7');
    const hit = nearestDrills(0.25, 3).map((h) => h.drill.name);
    expect(hit).toContain('1/4');
    expect(hit).toContain('E');
  });
  it('reports signed differences in both units', () => {
    const h = nearestDrills(0.2, 1, INCH_DRILLS)[0]!;
    expect(Math.abs(h.diffInch)).toBeCloseTo(0.001, 9); // #8 (.199) and #7 (.201) tie
    expect(Math.abs(h.diffMm)).toBeCloseTo(0.0254, 9);
  });
});

describe('percent thread', () => {
  it('100% drill = D − 1.299P, and inverse', () => {
    expect(drillForPercent(0.25, 1 / 20, 100)).toBeCloseTo(0.25 - 1.299038 / 20, 6);
    expect(percentThread(0.25, 1 / 20, drillForPercent(0.25, 1 / 20, 75))).toBeCloseTo(75, 9);
  });
  it('1/4-20 with #7 ≈ 75%', () => expect(percentThread(0.25, 1 / 20, 0.201)).toBeCloseTo(75.4, 1));
  it('M10×1.5 with 8.5 mm ≈ 77%', () => expect(percentThread(10, 1.5, 8.5)).toBeCloseTo(77.0, 0));
});

describe('tap drill selection (geometry, nearest to 75%) matches the classic pairings', () => {
  const pick = (label: string) => UNIFIED_ROWS.find((r) => r.designation.startsWith(label))!.tapDrills!.best.drill.name;
  it.each([
    ['1/4-20 ', '#7'],
    ['3/8-16 ', '5/16'],
    ['5/16-18 ', 'F'],
    ['10-32'.replace('10', '#10'), '#21'],
    ['#10-24', '#25'],
    ['1/2-13 ', '27/64'],
    ['#8-32', '#29'],
  ])('%s → %s', (des, drill) => expect(pick(des)).toBe(drill));
  it('M10×1.5 → 8.5 mm, M8×1.25 → 6.8 mm, M6×1 → 5 mm', () => {
    const m = (d: string) => METRIC_ROWS.find((r) => r.designation === d)!.tapDrills!.best.drill.name;
    expect(m('M10 × 1.5')).toBe('8.5 mm');
    expect(m('M8 × 1.25')).toBe('6.8 mm');
    expect(m('M6 × 1')).toBe('5 mm');
  });
  it('neighbours bracket the best percent', () => {
    const s = tapDrillSet(0.25, 1 / 20, INCH_DRILLS)!;
    if (s.tight) expect(s.tight.percent).toBeGreaterThan(s.best.percent);
    if (s.loose) expect(s.loose.percent).toBeLessThan(s.best.percent);
  });
});

describe('thread chart rows', () => {
  it('are finite and consistent', () => {
    expect(UNIFIED_ROWS.length).toBeGreaterThan(60);
    expect(METRIC_ROWS.length).toBeGreaterThan(40);
    for (const r of [...UNIFIED_ROWS, ...METRIC_ROWS]) {
      expect([r.basicPD, r.basicMinor, r.depth, r.bestWire, r.tpi].every(Number.isFinite)).toBe(true);
      expect(r.basicPD).toBeLessThan(r.major);
      expect(r.basicMinor).toBeLessThan(r.basicPD);
    }
    expect(new Set([...UNIFIED_ROWS, ...METRIC_ROWS].map((r) => r.id)).size).toBe(UNIFIED_ROWS.length + METRIC_ROWS.length);
  });
});
