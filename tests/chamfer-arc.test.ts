import { describe, expect, it } from 'vitest';
import { solveChamfer, type ChamferInput } from '../src/calculators/chamfer/engine';
import { solveArc, type ArcInput } from '../src/calculators/arc/engine';

const Ch = (o: Partial<ChamferInput>): ChamferInput => ({ unit: 'in', axial: null, radial: null, face: null, angleDeg: null, angleRef: 'axis', partDia: null, side: 'external', ...o });
const chv = (i: ChamferInput) => {
  const r = solveChamfer(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};
const Ar = (o: Partial<ArcInput>): ArcInput => ({ unit: 'in', radius: null, chord: null, sagitta: null, angleDeg: null, ...o });
const arv = (i: ArcInput) => {
  const r = solveArc(i);
  if (!r.ok) throw new Error(r.issues.map((x) => x.message).join('; '));
  return r.value;
};

describe('chamfer', () => {
  it('.060 × 45°: axial .060, radial .060, diameter change .120, face .0849', () => {
    const v = chv(Ch({ axial: 0.06, angleDeg: 45 }));
    expect(v.radial).toBeCloseTo(0.06, 12);
    expect(v.diameterChange).toBeCloseTo(0.12, 12);
    expect(v.face).toBeCloseTo(0.06 * Math.SQRT2, 12);
    expect(v.includedDeg).toBeCloseTo(90, 10);
  });
  it('30° from the face is 60° from the axis', () => {
    const fromFace = chv(Ch({ axial: 0.1, angleDeg: 30, angleRef: 'face' }));
    const fromAxis = chv(Ch({ axial: 0.1, angleDeg: 60, angleRef: 'axis' }));
    expect(fromFace.radial).toBeCloseTo(fromAxis.radial, 12);
    expect(fromFace.angleFromAxis).toBeCloseTo(60, 10);
    expect(fromFace.angleFromFace).toBeCloseTo(30, 10);
    expect(fromFace.radial).toBeCloseTo(0.1 * Math.tan((60 * Math.PI) / 180), 12);
  });
  it('every pairing agrees', () => {
    const base = chv(Ch({ axial: 0.05, radial: 0.03 }));
    for (const c of [Ch({ axial: 0.05, face: base.face }), Ch({ radial: 0.03, face: base.face }), Ch({ radial: 0.03, angleDeg: base.angleFromAxis }), Ch({ face: base.face, angleDeg: base.angleFromAxis })]) {
      const v = chv(c);
      expect(v.axial).toBeCloseTo(0.05, 9);
      expect(v.radial).toBeCloseTo(0.03, 9);
    }
  });
  it('end-face diameter, external and internal', () => {
    expect(chv(Ch({ axial: 0.06, angleDeg: 45, partDia: 1 })).endFaceDia).toBeCloseTo(0.88, 12);
    expect(chv(Ch({ axial: 0.06, angleDeg: 45, partDia: 1, side: 'internal' })).endFaceDia).toBeCloseTo(1.12, 12);
  });
  it('rejects bad input in shop words', () => {
    for (const bad of [Ch({}), Ch({ axial: 0.05 }), Ch({ axial: 0.05, radial: 0.05, face: 0.07 }), Ch({ axial: 0, radial: 0.05 }), Ch({ axial: 0.05, angleDeg: 90 }), Ch({ axial: 0.05, angleDeg: 0 }), Ch({ axial: 0.5, partDia: 0.6, angleDeg: 80 }), Ch({ radial: 0.1, face: 0.05 }), Ch({ axial: Number.NaN, radial: 1 })]) {
      expect(solveChamfer(bad).ok).toBe(false);
    }
    const r = solveChamfer(Ch({ radial: 0.1, face: 0.05 }));
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/radial width|chamfer face/);
  });
});

describe('radius / chord / sagitta', () => {
  it('R5 c6 → s1, θ 73.74°, arc 6.435', () => {
    const v = arv(Ar({ radius: 5, chord: 6 }));
    expect(v.sagitta).toBeCloseTo(1, 12);
    expect(v.angleDeg).toBeCloseTo(73.7398, 4);
    expect(v.arcLength).toBeCloseTo(6.4350, 3);
    expect(v.centerToChord).toBeCloseTo(4, 12);
  });
  it('c6 s1 → R5; R5 s1 → c6', () => {
    expect(arv(Ar({ chord: 6, sagitta: 1 })).radius).toBeCloseTo(5, 12);
    expect(arv(Ar({ radius: 5, sagitta: 1 })).chord).toBeCloseTo(6, 10);
  });
  it('R10 θ90 → chord 14.1421, sagitta 2.9289', () => {
    const v = arv(Ar({ radius: 10, angleDeg: 90 }));
    expect(v.chord).toBeCloseTo(14.142136, 5);
    expect(v.sagitta).toBeCloseTo(2.928932, 5);
  });
  it('every pairing agrees for one arc', () => {
    const b = arv(Ar({ radius: 8, chord: 10 }));
    for (const c of [Ar({ radius: 8, sagitta: b.sagitta }), Ar({ chord: 10, sagitta: b.sagitta }), Ar({ radius: 8, angleDeg: b.angleDeg }), Ar({ chord: 10, angleDeg: b.angleDeg }), Ar({ sagitta: b.sagitta, angleDeg: b.angleDeg })]) {
      const v = arv(c);
      expect(v.radius).toBeCloseTo(8, 8);
      expect(v.chord).toBeCloseTo(10, 8);
      expect(v.sagitta).toBeCloseTo(b.sagitta, 8);
    }
  });
  it('semicircle: R5 c10 → s5, 180°', () => {
    const v = arv(Ar({ radius: 5, chord: 10 }));
    expect(v.sagitta).toBeCloseTo(5, 10);
    expect(v.angleDeg).toBeCloseTo(180, 8);
  });
  it('explains impossible geometry', () => {
    for (const bad of [Ar({ radius: 5, chord: 11 }), Ar({ radius: 5, sagitta: 6 }), Ar({ chord: 6, sagitta: 4 }), Ar({ radius: 5, angleDeg: 200 })]) {
      expect(solveArc(bad).ok).toBe(false);
    }
    const r = solveArc(Ar({ radius: 5, chord: 11 }));
    if (!r.ok) expect(r.issues[0]!.message).toMatch(/Impossible geometry/);
  });
  it('rejects too few / many / invalid', () => {
    for (const bad of [Ar({}), Ar({ radius: 5 }), Ar({ radius: 5, chord: 6, sagitta: 1 }), Ar({ radius: 0, chord: 6 }), Ar({ radius: -5, chord: 6 }), Ar({ radius: Number.NaN, chord: 6 })]) {
      expect(solveArc(bad).ok).toBe(false);
    }
  });
});
