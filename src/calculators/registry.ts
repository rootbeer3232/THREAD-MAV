/**
 * Calculator registry. Adding a calculator = write engine + tests + presenter + ui,
 * then add one entry here (status 'ready' only after it passes the readiness rules).
 */
import type { AppContext, Screen } from '../app/context';

export type CategoryId = 'threads' | 'angles' | 'holes' | 'geometry' | 'cutting';

export const CATEGORIES: { id: CategoryId; name: string }[] = [
  { id: 'threads', name: 'Threads' },
  { id: 'angles', name: 'Angles & Setup' },
  { id: 'holes', name: 'Hole / Coordinate' },
  { id: 'geometry', name: 'Geometry' },
  { id: 'cutting', name: 'Cutting Data' },
];

export interface CalculatorEntry {
  id: string;
  name: string;
  blurb: string;
  category: CategoryId;
  /** 'ready' = implemented and validated; 'planned' = listed on the roadmap, NOT implemented. */
  status: 'ready' | 'planned';
  /** Route name for ready calculators. */
  route?: string;
  mount?: (ctx: AppContext, params: URLSearchParams) => Promise<Screen>;
}

const planned = (id: string, name: string, blurb: string, category: CategoryId): CalculatorEntry => ({ id, name, blurb, category, status: 'planned' });

export const CALCULATORS: CalculatorEntry[] = [
  { id: 'thread', name: 'Thread / 3-Wire', blurb: 'Unified, ISO metric & custom. Best wire, over-wires, pitch diameter.', category: 'threads', status: 'ready', route: 'thread' },
  { id: 'thread-chart', name: 'Thread Chart', blurb: 'Unified & metric sizes, basic dimensions, tap drill, % thread.', category: 'threads', status: 'ready', route: 'threadchart' },
  { id: 'drill-chart', name: 'Drill Chart', blurb: 'Fraction, number, letter, metric — find the nearest drill.', category: 'threads', status: 'ready', route: 'drillchart' },
  planned('thread-depth', 'Thread Depth / Compound Infeed', 'Lathe threading infeed helper', 'threads'),
  { id: 'sine', name: 'Sine Bar', blurb: 'Find stack height or angle. 5.000" preset or custom bar.', category: 'angles', status: 'ready', route: 'sine' },
  { id: 'taper', name: 'Taper', blurb: 'D, d, length, taper per inch/foot, angle — solve the missing one.', category: 'angles', status: 'ready', route: 'taper' },
  { id: 'triangle', name: 'Right Triangle', blurb: 'Any two knowns → rise, run, hypotenuse, angle.', category: 'angles', status: 'ready', route: 'triangle' },
  { id: 'boltcircle', name: 'Bolt Circle', blurb: 'X/Y position and angle of every hole. Copy the list.', category: 'holes', status: 'ready', route: 'boltcircle' },
  { id: 'drillpoint', name: 'Drill Point Depth', blurb: 'Point length and total depth to program.', category: 'holes', status: 'ready', route: 'drillpoint' },
  { id: 'cskcbore', name: 'Countersink / Counterbore', blurb: 'Cone depth and diameter, counterbore size and depth.', category: 'holes', status: 'ready', route: 'cskcbore' },
  planned('true-position', 'True Position', 'Coordinate deviation and position', 'holes'),
  planned('chamfer', 'Chamfer', 'Width, depth, angle relationships', 'geometry'),
  planned('rcs', 'Radius / Chord / Sagitta', 'Arc geometry', 'geometry'),
  planned('ball-pin', 'Ball / Pin Measurement', 'Measurement over ball/pin', 'geometry'),
  planned('shim', 'Shim / Spacer Stack', 'Practical shim combinations', 'geometry'),
  { id: 'speeds', name: 'Speeds & Feeds', blurb: 'Milling, turning, drilling: RPM, feed rate, SFM ↔ m/min.', category: 'cutting', status: 'ready', route: 'speeds' },
];

export const READY = CALCULATORS.filter((c) => c.status === 'ready');
