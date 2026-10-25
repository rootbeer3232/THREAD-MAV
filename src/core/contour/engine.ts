/**
 * Contour IQ solver — straight geometry only (Gate B1).
 * Pure and deterministic. Solves ONLY values that are mathematically determined by the entered
 * ones, and says plainly when something is missing (amber) or contradictory/impossible (red).
 */
import {
  CONTOUR_SCHEMA_MIN,
  CONTOUR_SCHEMA,
  CONTOUR_TOL_MM,
  CONTOUR_TRIG_TOL_MM,
  type SolvedArc,
  type SolvedTaper,
  type TaperDir,
  type ContourMessage,
  type ContourProfile,
  type ContourSolution,
  type Known,
  type MissingItem,
  type Source,
  type Status,
} from './types';

const near = (a: number, b: number) => Math.abs(a - b) <= CONTOUR_TOL_MM;
const label = (i: number) => `P${i + 1}`;

export function solveContour(profile: ContourProfile): ContourSolution {
  const messages: ContourMessage[] = [];
  const n = profile.points.length;

  // ---------- structural validation ----------
  if (!(profile.schema >= CONTOUR_SCHEMA_MIN && profile.schema <= CONTOUR_SCHEMA)) {
    return fail('This profile was saved by a different version and cannot be solved safely.');
  }
  if (n < 2 || profile.segments.length !== n - 1) {
    return fail('A profile needs at least two points joined by one segment.');
  }
  const bad = [...profile.points.flatMap((p) => [p.x, p.z]), ...profile.segments.flatMap((s) => [s.value, s.length ?? null, s.dx ?? null, s.angle ?? null])].some((v) => v !== null && !Number.isFinite(v));
  if (bad) return fail('A value is not a valid number.');

  const X: Known[] = profile.points.map((p) => p.x);
  const Z: Known[] = profile.points.map((p) => p.z);
  const V: Known[] = profile.segments.map((s) => s.value);
  // taper working values (index = segment); only meaningful where kind === 'taper'
  const Len: Known[] = profile.segments.map((s) => (s.kind === 'taper' ? (s.length ?? null) : null));
  const Dx: Known[] = profile.segments.map((s) => (s.kind === 'taper' ? (s.dx ?? null) : null));
  const Ang: Known[] = profile.segments.map((s) => (s.kind === 'taper' ? (s.angle ?? null) : null));
  const Dir: TaperDir[] = profile.segments.map((s) => (s.kind === 'taper' ? (s.dir ?? null) : null));
  const Mag: Known[] = profile.segments.map(() => null);
  const lenGiven = Len.map((v) => v !== null);
  const dxGiven = Dx.map((v) => v !== null);
  const angGiven = Ang.map((v) => v !== null);
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
      } else if (seg.kind === 'taper') {
        // axial length from Z (same bookkeeping as a straight)
        if (Len[i] !== null) {
          if (Z[a] !== null) put(Z, b, Z[a]! - Len[i]!, `Position ${label(b)} (Z)`);
          if (Z[b] !== null) put(Z, a, Z[b]! + Len[i]!, `Position ${label(a)} (Z)`);
        } else if (Z[a] !== null && Z[b] !== null) {
          Len[i] = Z[a]! - Z[b]!;
          changed = true;
        }
        // signed diameter change from X (same bookkeeping as a shoulder)
        if (Dx[i] !== null) {
          if (X[a] !== null) put(X, b, X[a]! + Dx[i]!, `Diameter ${label(b)}`);
          if (X[b] !== null) put(X, a, X[b]! - Dx[i]!, `Diameter ${label(a)}`);
        } else if (X[a] !== null && X[b] !== null) {
          Dx[i] = X[b]! - X[a]!;
          changed = true;
        }
        // direction follows the sign of the diameter change
        if (Dx[i] !== null && Math.abs(Dx[i]!) > CONTOUR_TOL_MM) {
          const sd: 1 | -1 = Dx[i]! > 0 ? 1 : -1;
          if (Dir[i] === null) {
            Dir[i] = sd;
            changed = true;
          } else if (Dir[i] !== sd) {
            red(`Taper ${name}: the diameter ${sd > 0 ? 'grows' : 'shrinks'} toward the chuck by the numbers, but you set it to ${Dir[i]! > 0 ? 'grow' : 'shrink'}. Check the direction.`);
          }
        }
        // trig relationship: |dx| = 2 · L · tan(angle from axis) — any two give the third
        const mag: Known = Dx[i] !== null ? Math.abs(Dx[i]!) : (Mag[i] ?? null);
        const tanA = Ang[i] !== null && Ang[i]! > 0 && Ang[i]! < 90 ? Math.tan((Ang[i]! * Math.PI) / 180) : null;
        if (Len[i] !== null && Len[i]! > 0 && mag !== null && mag > CONTOUR_TOL_MM && Ang[i] === null) {
          Ang[i] = (Math.atan(mag / (2 * Len[i]!)) * 180) / Math.PI;
          changed = true;
        } else if (Len[i] !== null && tanA !== null && mag === null) {
          Mag[i] = 2 * Len[i]! * tanA;
          changed = true;
        } else if (mag !== null && mag > CONTOUR_TOL_MM && tanA !== null && Len[i] === null) {
          Len[i] = mag / (2 * tanA);
          changed = true;
        }
        if (Mag[i] !== null && Dx[i] === null && Dir[i] !== null) {
          Dx[i] = Dir[i]! * Mag[i]!;
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

  // ---------- corner radii (Gate C1): tangent points and arc centers ----------
  const arcs: (SolvedArc | undefined)[] = new Array(n).fill(undefined);
  const radiusNeeds: string[] = [];
  profile.points.forEach((pt, i) => {
    const R = pt.radius ?? null;
    if (R === null || R === 0) return;
    const at = label(i);
    if (R < 0 || !Number.isFinite(R)) return red(`Corner radius at ${at} must be greater than zero (leave it blank for a sharp corner).`);
    if (i === 0 || i === n - 1) return red(`${at} is an end of the profile — a corner radius needs a line on both sides of the point.`);
    const A = [Z[i - 1] ?? null, X[i - 1] ?? null, Z[i] ?? null, X[i] ?? null, Z[i + 1] ?? null, X[i + 1] ?? null];
    if (A.some((v) => v === null)) {
      radiusNeeds.push(`corner radius at ${at}: positions of ${label(i - 1)}, ${at} and ${label(i + 1)} must be known first`);
      return;
    }
    // physical plane: (z, r) with r = X / 2 — X is a diameter, so every radial distance is HALF the X change
    const pa = { z: A[0]!, r: A[1]! / 2 };
    const pc = { z: A[2]!, r: A[3]! / 2 };
    const pb = { z: A[4]!, r: A[5]! / 2 };
    const l1 = Math.hypot(pc.z - pa.z, pc.r - pa.r);
    const l2 = Math.hypot(pb.z - pc.z, pb.r - pc.r);
    if (l1 <= CONTOUR_TOL_MM || l2 <= CONTOUR_TOL_MM) return; // zero-length neighbour: reported elsewhere
    const d1 = { z: (pc.z - pa.z) / l1, r: (pc.r - pa.r) / l1 };
    const d2 = { z: (pb.z - pc.z) / l2, r: (pb.r - pc.r) / l2 };
    const cross = d1.z * d2.r - d1.r * d2.z;
    const dot = d1.z * d2.z + d1.r * d2.r;
    const phi = Math.atan2(Math.abs(cross), dot); // turn angle at the corner
    if (phi < 1e-9) return red(`There is no corner at ${at} to round — the two lines run straight on.`);
    if (phi > Math.PI - 1e-9) return red(`The profile doubles back on itself at ${at}, so a radius can’t be fitted.`);
    const t = R * Math.tan(phi / 2);
    const t1 = { z: pc.z - d1.z * t, r: pc.r - d1.r * t };
    const t2 = { z: pc.z + d2.z * t, r: pc.r + d2.r * t };
    const left = cross > 0;
    const nrm = left ? { z: -d1.r, r: d1.z } : { z: d1.r, r: -d1.z };
    const ctr = { z: t1.z + nrm.z * R, r: t1.r + nrm.r * R };
    // material is on the LEFT of travel for an OD profile and on the RIGHT for an ID profile
    const centerOnMaterialSide = profile.side === 'od' ? left : !left;
    const arc: SolvedArc = {
      radius: R,
      tangentLength: t,
      start: { x: 2 * t1.r, z: t1.z },
      end: { x: 2 * t2.r, z: t2.z },
      center: { x: 2 * ctr.r, z: ctr.z },
      turn: left ? 'ccw' : 'cw',
      convex: centerOnMaterialSide,
      sweepDeg: (phi * 180) / Math.PI,
    };
    if (![arc.start.x, arc.start.z, arc.end.x, arc.end.z, arc.center.x, arc.center.z, t].every(Number.isFinite)) return red(`The radius at ${at} could not be solved.`);
    arcs[i] = arc;
  });
  // the tangent lengths taken from a line by the radii at its two ends must fit on that line
  profile.segments.forEach((_seg, i) => {
    const used = (arcs[i]?.tangentLength ?? 0) + (arcs[i + 1]?.tangentLength ?? 0);
    if (used <= CONTOUR_TOL_MM) return;
    if (X[i] === null || Z[i] === null || X[i + 1] === null || Z[i + 1] === null) return;
    const have = Math.hypot(Z[i + 1]! - Z[i]!, (X[i + 1]! - X[i]!) / 2);
    if (used > have + CONTOUR_TOL_MM) {
      red(`The radius is too large for the line ${label(i)}→${label(i + 1)}: the arc${arcs[i] && arcs[i + 1] ? 's' : ''} need${arcs[i] && arcs[i + 1] ? '' : 's'} ${fmt(used)} of it but the line is only ${fmt(have)} long. Use a smaller radius or check the dimensions.`);
    }
  });

  profile.segments.forEach((seg, i) => {
    if (seg.kind !== 'taper') return;
    const name = `${label(i)}→${label(i + 1)}`;
    const L = Len[i] ?? null;
    const dx = Dx[i] ?? null;
    const ang = Ang[i] ?? null;
    if (L !== null && L <= CONTOUR_TOL_MM) red(L < -CONTOUR_TOL_MM ? `Taper ${name} would run away from the chuck (negative length). Check the Z values.` : `Taper ${name} has zero length.`);
    if (dx !== null && Math.abs(dx) <= CONTOUR_TOL_MM) red(`Taper ${name} has no diameter change — use a straight instead.`);
    if (ang !== null && ang <= 0) red(`Taper ${name}: an angle of 0° is a straight — use a straight segment.`);
    if (ang !== null && ang >= 90) red(`Taper ${name}: an angle of 90° from the axis is a shoulder — use a shoulder segment.`);
    // over-determined: length, diameter change and angle must agree (within print rounding)
    const mag: Known = dx !== null ? Math.abs(dx) : (Mag[i] ?? null);
    if (L !== null && L > 0 && ang !== null && ang > 0 && ang < 90 && mag !== null) {
      const expect = 2 * L * Math.tan((ang * Math.PI) / 180);
      const diff = Math.abs(expect - mag);
      if (diff > CONTOUR_TRIG_TOL_MM) {
        red(`Taper ${name}: length, diameter change and angle don’t agree — that angle over that length gives a ${fmt(expect)} diameter change, not ${fmt(mag)}. Check the print.`);
      } else if (diff > CONTOUR_TOL_MM && lenGiven[i] && dxGiven[i] && angGiven[i]) {
        messages.push({ level: 'info', text: `Taper ${name}: the three values agree within print rounding (${fmt(diff)}).` });
      }
    }
  });

  // ---------- assemble ----------
  const src = (known: boolean, value: Known): Source => (value === null ? 'unknown' : known ? 'given' : 'solved');
  const points = X.map((x, i) => ({ x, z: Z[i]!, xSource: src(xGiven[i]!, x), zSource: src(zGiven[i]!, Z[i]!), ...(arcs[i] ? { arc: arcs[i] } : {}) }));
  const segments = profile.segments.map((s, i) => {
    const base = { kind: s.kind, value: V[i] ?? null, source: src(vGiven[i] ?? false, V[i] ?? null) };
    if (s.kind !== 'taper') return base;
    const dxv = Dx[i] ?? null;
    const taper: SolvedTaper = {
      length: Len[i] ?? null,
      dx: dxv,
      angle: Ang[i] ?? null,
      dir: Dir[i] ?? null,
      lengthSource: src(lenGiven[i] ?? false, Len[i] ?? null),
      dxSource: src(dxGiven[i] ?? false, dxv),
      angleSource: src(angGiven[i] ?? false, Ang[i] ?? null),
    };
    return { ...base, taper };
  });

  let status: Status = 'green';
  let missing: MissingItem[] | undefined;
  if (conflicted) status = 'red';
  else {
    const needs: string[] = [];
    points.forEach((p, i) => {
      if (p.x === null) needs.push(`${label(i)} diameter (X)`);
      if (p.z === null) needs.push(`${label(i)} position from P0 (Z)`);
    });
    profile.segments.forEach((seg, i) => {
      if (seg.kind !== 'taper') return;
      const known = [Len[i], Dx[i] ?? Mag[i], Ang[i]].filter((v) => v !== null).length;
      if (known < 2) needs.push(`taper ${label(i)}→${label(i + 1)}: give any two of length, diameter change and angle`);
      else if (Dx[i] === null && Dir[i] === null) needs.push(`taper ${label(i)}→${label(i + 1)}: whether the diameter gets BIGGER or SMALLER toward the chuck`);
    });
    needs.push(...radiusNeeds);
    if (needs.length) {
      status = 'amber';
      missing = buildMissing();
      messages.push({
        level: 'amber',
        text: `More information needed — not enough is known to solve: ${needs.join(', ')}. Enter any of these, or the length / diameter change of the segment next to it.`,
      });
    }
  }
  if (status === 'green') messages.push({ level: 'info', text: 'All values are determined and consistent.' });
  return { status, points, segments, messages, ...(missing ? { missing } : {}) };

  /** Gate D: for every unknown, list the shortest things the user could type to resolve it. */
  function buildMissing(): MissingItem[] {
    const out: MissingItem[] = [];
    const neighbours = (i: number) => [i - 1, i].filter((j) => j >= 0 && j < n - 1).map((j) => ({ j, other: j === i ? i + 1 : i - 1, seg: profile.segments[j]! }));
    for (let i = 0; i < n; i++) {
      if (X[i] === null) {
        const options: MissingItem['options'] = [{ text: `type the diameter of ${label(i)}`, field: `x${i}` }];
        for (const { j, other, seg } of neighbours(i)) {
          const name = `${label(Math.min(i, other))}→${label(Math.max(i, other))}`;
          if (seg.kind === 'straight' && X[other] === null) options.push({ text: `the diameter of ${label(other)} (a straight keeps one diameter)`, field: `x${other}` });
          else if (seg.kind === 'shoulder' && X[other] !== null && V[j] === null) options.push({ text: `the diameter change of shoulder ${name}`, field: `v${j}` });
          else if (seg.kind === 'taper' && X[other] !== null && Dx[j] === null) options.push({ text: `the diameter change of taper ${name}${Dir[j] === null ? ' (or its direction)' : ''}`, field: `dx${j}` });
        }
        out.push({ target: `${label(i)} diameter (X)`, options });
      }
      if (Z[i] === null) {
        const options: MissingItem['options'] = [{ text: `type the Z position of ${label(i)}`, field: `z${i}` }];
        for (const { j, other, seg } of neighbours(i)) {
          const name = `${label(Math.min(i, other))}→${label(Math.max(i, other))}`;
          if (Z[other] === null) continue;
          if (seg.kind === 'straight' && V[j] === null) options.push({ text: `the length of straight ${name}`, field: `v${j}` });
          else if (seg.kind === 'taper' && Len[j] === null) options.push({ text: `the axial length of taper ${name}`, field: `len${j}` });
        }
        out.push({ target: `${label(i)} position from P0 (Z)`, options });
      }
    }
    profile.segments.forEach((seg, i) => {
      if (seg.kind !== 'taper') return;
      const known = [Len[i], Dx[i] ?? Mag[i], Ang[i]].filter((v) => v !== null).length;
      const name = `${label(i)}→${label(i + 1)}`;
      if (known < 2) out.push({ target: `taper ${name}`, options: [{ text: 'any two of: axial length, diameter change, angle', field: `len${i}` }] });
      else if (Dx[i] === null && Dir[i] === null) out.push({ target: `taper ${name} direction`, options: [{ text: 'set BIGGER or SMALLER toward the chuck (the numbers alone cannot show which)' }] });
    });
    return out;
  }

  function fail(text: string): ContourSolution {
    return { status: 'red', points: [], segments: [], messages: [{ level: 'red', text }] };
  }
}

function fmt(mm: number): string {
  return `${Number(mm.toFixed(6))} mm`;
}
