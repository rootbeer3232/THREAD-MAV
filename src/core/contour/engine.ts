/**
 * Contour IQ solver — straight geometry only (Gate B1).
 * Pure and deterministic. Solves ONLY values that are mathematically determined by the entered
 * ones, and says plainly when something is missing (amber) or contradictory/impossible (red).
 */
import {
  CONTOUR_SCHEMA,
  CONTOUR_TOL_MM,
  type ContourMessage,
  type ContourProfile,
  type ContourSolution,
  type Known,
  type Source,
  type Status,
} from './types';

const near = (a: number, b: number) => Math.abs(a - b) <= CONTOUR_TOL_MM;
const label = (i: number) => `P${i + 1}`;

export function solveContour(profile: ContourProfile): ContourSolution {
  const messages: ContourMessage[] = [];
  const n = profile.points.length;

  // ---------- structural validation ----------
  if (profile.schema !== CONTOUR_SCHEMA) {
    return fail('This profile was saved by a different version and cannot be solved safely.');
  }
  if (n < 2 || profile.segments.length !== n - 1) {
    return fail('A profile needs at least two points joined by one segment.');
  }
  const bad = [...profile.points.flatMap((p) => [p.x, p.z]), ...profile.segments.map((s) => s.value)].some((v) => v !== null && !Number.isFinite(v));
  if (bad) return fail('A value is not a valid number.');

  const X: Known[] = profile.points.map((p) => p.x);
  const Z: Known[] = profile.points.map((p) => p.z);
  const V: Known[] = profile.segments.map((s) => s.value);
  const xGiven = X.map((v) => v !== null);
  const zGiven = Z.map((v) => v !== null);
  const vGiven = V.map((v) => v !== null);
  let conflicted = false;
  const seen = new Set<string>();
  const red = (text: string, key = text) => {
    conflicted = true;
    if (seen.has(key)) return;
    seen.add(key);
    messages.push({ level: 'red', text });
  };

  let changed = false;
  /** Set a value if unknown; if already known, it must agree. */
  const put = (arr: Known[], i: number, v: number, what: string) => {
    if (arr[i] === null) {
      arr[i] = v;
      changed = true;
    } else if (!near(arr[i]!, v)) {
      const pair = [arr[i]!, v].sort((p, q) => p - q);
      red(`${what} conflicts: one dimension says ${fmt(arr[i]!)} and another requires ${fmt(v)}. Check the print.`, `${what}|${pair[0]!.toFixed(6)}|${pair[1]!.toFixed(6)}`);
    }
  };

  for (let pass = 0; pass < (n + 2) * 4; pass++) {
    changed = false;
    for (let i = 0; i < n - 1; i++) {
      const a = i;
      const b = i + 1;
      const seg = profile.segments[i]!;
      const name = `${label(a)}→${label(b)}`;
      if (seg.kind === 'straight') {
        // diameter is constant along a straight
        if (X[a] !== null) put(X, b, X[a]!, `Diameter of straight ${name}`);
        if (X[b] !== null) put(X, a, X[b]!, `Diameter of straight ${name}`);
        // length = Z[a] − Z[b]  (profile runs toward the chuck)
        if (V[i] !== null) {
          if (Z[a] !== null) put(Z, b, Z[a]! - V[i]!, `Position ${label(b)} (Z)`);
          if (Z[b] !== null) put(Z, a, Z[b]! + V[i]!, `Position ${label(a)} (Z)`);
        } else if (Z[a] !== null && Z[b] !== null) {
          V[i] = Z[a]! - Z[b]!;
          changed = true;
        }
      } else {
        // shoulder: Z is constant across it
        if (Z[a] !== null) put(Z, b, Z[a]!, `Position of shoulder ${name} (Z)`);
        if (Z[b] !== null) put(Z, a, Z[b]!, `Position of shoulder ${name} (Z)`);
        // diameter change = X[b] − X[a]
        if (V[i] !== null) {
          if (X[a] !== null) put(X, b, X[a]! + V[i]!, `Diameter ${label(b)}`);
          if (X[b] !== null) put(X, a, X[b]! - V[i]!, `Diameter ${label(a)}`);
        } else if (X[a] !== null && X[b] !== null) {
          V[i] = X[b]! - X[a]!;
          changed = true;
        }
      }
    }
    if (!changed) break;
  }

  // ---------- physical sanity (applies to given AND solved values) ----------
  for (let i = 0; i < n; i++) {
    if (X[i] !== null && X[i]! < -CONTOUR_TOL_MM) red(`${label(i)} has a negative diameter (${fmt(X[i]!)}). Diameters can’t be negative.`);
  }
  profile.segments.forEach((seg, i) => {
    const v = V[i] ?? null;
    if (v === null) return;
    const name = `${label(i)}→${label(i + 1)}`;
    if (seg.kind === 'straight' && v <= CONTOUR_TOL_MM) {
      red(
        v < -CONTOUR_TOL_MM
          ? `Straight ${name} would run away from the chuck (negative length). The profile must run toward the chuck — check the Z values.`
          : `Straight ${name} has zero length. Give it a length or separate Z values.`,
      );
    }
    if (seg.kind === 'shoulder' && Math.abs(v) <= CONTOUR_TOL_MM) {
      red(`Shoulder ${name} has no diameter change — it isn’t a shoulder. Check the diameters.`);
    }
  });

  // ---------- assemble ----------
  const src = (known: boolean, value: Known): Source => (value === null ? 'unknown' : known ? 'given' : 'solved');
  const points = X.map((x, i) => ({ x, z: Z[i]!, xSource: src(xGiven[i]!, x), zSource: src(zGiven[i]!, Z[i]!) }));
  const segments = profile.segments.map((s, i) => ({ kind: s.kind, value: V[i]!, source: src(vGiven[i]!, V[i]!) }));

  let status: Status = 'green';
  if (conflicted) status = 'red';
  else {
    const needs: string[] = [];
    points.forEach((p, i) => {
      if (p.x === null) needs.push(`${label(i)} diameter (X)`);
      if (p.z === null) needs.push(`${label(i)} position from P0 (Z)`);
    });
    if (needs.length) {
      status = 'amber';
      messages.push({
        level: 'amber',
        text: `More information needed — not enough is known to solve: ${needs.join(', ')}. Enter any of these, or the length / diameter change of the segment next to it.`,
      });
    }
  }
  if (status === 'green') messages.push({ level: 'info', text: 'All values are determined and consistent.' });
  return { status, points, segments, messages };

  function fail(text: string): ContourSolution {
    return { status: 'red', points: [], segments: [], messages: [{ level: 'red', text }] };
  }
}

function fmt(mm: number): string {
  return `${Number(mm.toFixed(6))} mm`;
}
