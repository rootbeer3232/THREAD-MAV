import { describe, expect, it } from 'vitest';
import { convertLength, degToDms, dmsToDeg, dualFrom, MM_PER_INCH, toInch, toMm } from '../src/core/units';
import { fmtFixed, parseDecimal, sanitizeDecimalInput } from '../src/core/numeric';

describe('units', () => {
  it('uses exact 25.4', () => {
    expect(MM_PER_INCH).toBe(25.4);
    expect(toMm(1, 'in')).toBe(25.4);
    expect(toInch(25.4, 'mm')).toBe(1);
    expect(convertLength(2, 'in', 'mm')).toBeCloseTo(50.8, 12);
    expect(convertLength(50.8, 'mm', 'in')).toBeCloseTo(2, 12);
    expect(convertLength(3, 'in', 'in')).toBe(3);
  });
  it('dual values derive from the same underlying number', () => {
    const d = dualFrom(0.3344, 'in');
    expect(d.primary).toBe('in');
    expect(d.in).toBe(0.3344);
    expect(d.mm).toBeCloseTo(0.3344 * 25.4, 12);
    const m = dualFrom(8.5, 'mm');
    expect(m.mm).toBe(8.5);
    expect(m.in).toBeCloseTo(8.5 / 25.4, 12);
  });
  it('DMS conversions carry and round trip', () => {
    expect(dmsToDeg(15, 30, 0)).toBeCloseTo(15.5, 12);
    expect(degToDms(15.5)).toEqual({ degrees: 15, minutes: 30, seconds: 0 });
    // 29.99999999 deg must not show 59.99.. -> 60"
    expect(degToDms(29.99999999, 1)).toEqual({ degrees: 30, minutes: 0, seconds: 0 });
    const x = degToDms(12.345678, 2);
    expect(dmsToDeg(x.degrees, x.minutes, x.seconds)).toBeCloseTo(12.345678, 5);
  });
});

describe('numeric input', () => {
  it('parses machinist entries', () => {
    expect(parseDecimal('.005')).toBe(0.005);
    expect(parseDecimal('0.005')).toBe(0.005);
    expect(parseDecimal('5.')).toBe(5);
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('  .0320 ')).toBe(0.032);
    expect(parseDecimal('')).toBeNull();
    expect(parseDecimal('.')).toBeNull();
    expect(parseDecimal('1.2.3')).toBeNaN();
    expect(parseDecimal('abc')).toBeNaN();
    expect(parseDecimal('1e5')).toBeNaN();
  });
  it('sanitizes keystrokes', () => {
    expect(sanitizeDecimalInput('1..5')).toBe('1.5');
    expect(sanitizeDecimalInput('a1,5b')).toBe('1.5');
    expect(sanitizeDecimalInput('-3')).toBe('3');
    expect(sanitizeDecimalInput('-3', true)).toBe('-3');
    expect(sanitizeDecimalInput('.005')).toBe('.005');
  });
  it('never prints negative zero or NaN', () => {
    expect(fmtFixed(-0.00001, 4)).toBe('0.0000');
    expect(fmtFixed(Number.NaN, 4)).toBe('—');
    expect(fmtFixed(Infinity, 4)).toBe('—');
    expect(fmtFixed(1.29410, 4)).toBe('1.2941');
  });
});

import { applyFraction, sanitizeFractionInput } from '../src/core/numeric';
describe('fraction entry', () => {
  it('parses fractions and mixed numbers', () => {
    expect(parseDecimal('3/8')).toBe(0.375);
    expect(parseDecimal('1-1/2')).toBe(1.5);
    expect(parseDecimal('1 1/2')).toBe(1.5);
    expect(parseDecimal('11/16')).toBeCloseTo(0.6875, 12);
    expect(parseDecimal('2-5/16')).toBeCloseTo(2.3125, 12);
    expect(parseDecimal('-3/8')).toBe(-0.375);
    expect(parseDecimal(' 7/8 ')).toBe(0.875);
  });
  it('rejects malformed fractions instead of guessing', () => {
    for (const bad of ['1/0', '1/2/3', '1-/2', '/2', '3/', '1.5/2', '1--1/2', 'a/b', '1/ 2x']) expect(parseDecimal(bad)).toBeNaN();
  });
  it('plain decimals still parse as before', () => {
    expect(parseDecimal('.005')).toBe(0.005);
    expect(parseDecimal('1,5')).toBe(1.5);
    expect(parseDecimal('1-')).toBeNaN();
  });
  it('keystroke cleanup keeps fraction characters only', () => {
    expect(sanitizeFractionInput('1 1/2"')).toBe('1 1/2');
    expect(sanitizeFractionInput('-3/8')).toBe('3/8');
    expect(sanitizeFractionInput('-3/8', true)).toBe('-3/8');
    expect(sanitizeFractionInput('abc')).toBe('');
  });
  it('fraction chips build mixed numbers', () => {
    expect(applyFraction('', '3/8')).toBe('3/8');
    expect(applyFraction('1', '3/8')).toBe('1-3/8');
    expect(applyFraction('1-1/2', '3/8')).toBe('1-3/8');
    expect(applyFraction('1/2', '5/8')).toBe('5/8');
    expect(applyFraction('1.5', '1/4')).toBe('1/4');
    expect(applyFraction('12', '1/16')).toBe('12-1/16');
  });
  it('fractions equal their decimals exactly', () => {
    for (let n = 1; n < 64; n++) expect(parseDecimal(`${n}/64`)).toBe(n / 64);
  });
});
