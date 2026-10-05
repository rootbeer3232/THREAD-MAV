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
  planned('thread-depth', 'Thread Depth / Compound Infeed', 'Lathe threading infeed helper', 'threads'),
  planned('tap-drill', 'Tap Drill / Percent Thread', 'Tap drill and percent thread', 'threads'),
  { id: 'sine', name: 'Sine Bar', blurb: 'Find stack height or angle. 5.000" preset or custom bar.', category: 'angles', status: 'ready', route: 'sine' },
  planned('taper', 'Taper', 'Diameters, length, taper per inch/foot, angles', 'angles'),
  planned('triangle', 'Triangle Solver', 'Right-triangle shop trig', 'angles'),
  planned('bolt-circle', 'Bolt Circle', 'X/Y coordinates for each hole', 'holes'),
  planned('drill-point', 'Drill Point Depth', 'Extra depth from drill point angle', 'holes'),
  planned('csk-cbore', 'Countersink / Counterbore', 'Diameters, angle, depth', 'holes'),
  planned('true-position', 'True Position', 'Coordinate deviation and position', 'holes'),
  planned('chamfer', 'Chamfer', 'Width, depth, angle relationships', 'geometry'),
  planned('rcs', 'Radius / Chord / Sagitta', 'Arc geometry', 'geometry'),
  planned('ball-pin', 'Ball / Pin Measurement', 'Measurement over ball/pin', 'geometry'),
  planned('shim', 'Shim / Spacer Stack', 'Practical shim combinations', 'geometry'),
  planned('feeds-speeds', 'Feeds & Speeds', 'RPM, IPM, chip load', 'cutting'),
  planned('sfm', 'Surface Speed', 'SFM / m/min / RPM / diameter', 'cutting'),
];

export const READY = CALCULATORS.filter((c) => c.status === 'ready');
