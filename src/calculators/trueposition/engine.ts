/**
 * True position (positional tolerance, cylindrical zone):
 *   dx = actualX − nominalX,  dy = actualY − nominalY,  radial = √(dx² + dy²),  position = 2·radial (a DIAMETER)
 * MMC bonus (optional): hole = actual size − MMC size (MMC = smallest hole), pin = MMC size − actual size (MMC = largest pin).
 * Allowed position = tolerance + bonus. Pass when position ≤ allowed.
 */
import { type CalcIssue, type Result, failMany, ok } from '../../core/numeric';
import type { Unit } from '../../core/units';

export interface TruePositionInput {
  unit: Unit;
  nominalX: number;
  nominalY: number;
  actualX: number;
  actualY: number;
  /** Positional tolerance — the DIAMETER of the tolerance zone. */
  tolerance: number;
  /** null = RFS (no bonus). */
  mmc: { feature: 'hole' | 'pin'; mmcSize: number; actualSize: number } | null;
}

export interface TruePositionResult {
  unit: Unit;
  dx: number;
  dy: number;
  radial: number;
  position: number;
  tolerance: number;
  bonus: number;
  allowed: number;
  remaining: number;
  /** position ÷ allowed, as a percentage. */
  percentUsed: number;
  pass: boolean;
  /** MMC feature size is past MMC (out of its size limits direction), so the bonus was held at 0. */
  sizePastMmc: boolean;
  input: TruePositionInput;
}

export function solveTruePosition(i: TruePositionInput): Result<TruePositionResult> {
  const issues: CalcIssue[] = [];
  const chk = (v: number, field: string, label: string) => {
    if (!Number.isFinite(v)) issues.push({ field, message: `${label} isn’t a valid number.` });
  };
  chk(i.nominalX, 'nx', 'Nominal X');
  chk(i.nominalY, 'ny', 'Nominal Y');
  chk(i.actualX, 'ax', 'Actual X');
  chk(i.actualY, 'ay', 'Actual Y');
  if (!Number.isFinite(i.tolerance) || i.tolerance <= 0) issues.push({ field: 'tol', message: 'Position tolerance must be greater than zero.' });
  if (i.mmc) {
    if (!Number.isFinite(i.mmc.mmcSize) || i.mmc.mmcSize <= 0) issues.push({ field: 'mmc', message: 'MMC size must be greater than zero.' });
    if (!Number.isFinite(i.mmc.actualSize) || i.mmc.actualSize <= 0) issues.push({ field: 'asz', message: 'Actual size must be greater than zero.' });
  }
  if (issues.length) return failMany(issues);

  const dx = i.actualX - i.nominalX;
  const dy = i.actualY - i.nominalY;
  const radial = Math.hypot(dx, dy);
  const position = 2 * radial;
  let bonus = 0;
  let sizePastMmc = false;
  if (i.mmc) {
    const raw = i.mmc.feature === 'hole' ? i.mmc.actualSize - i.mmc.mmcSize : i.mmc.mmcSize - i.mmc.actualSize;
    if (raw < 0) sizePastMmc = true;
    else bonus = raw;
  }
  const allowed = i.tolerance + bonus;
  const eps = 1e-9 * Math.max(1, allowed);
  return ok({
    unit: i.unit,
    dx,
    dy,
    radial,
    position,
    tolerance: i.tolerance,
    bonus,
    allowed,
    remaining: allowed - position,
    percentUsed: (position / allowed) * 100,
    pass: position <= allowed + eps,
    sizePastMmc,
    input: i,
  });
}
