/** ISO metric helper lists. Convenience only — no tolerance data. */

export interface MetricSize {
  d: number; // nominal major diameter, mm
  pitch: number; // coarse pitch, mm
}

/** Standard coarse-pitch series (ISO 261 coarse). */
export const COARSE_METRIC: MetricSize[] = [
  { d: 1.6, pitch: 0.35 },
  { d: 2, pitch: 0.4 },
  { d: 2.5, pitch: 0.45 },
  { d: 3, pitch: 0.5 },
  { d: 3.5, pitch: 0.6 },
  { d: 4, pitch: 0.7 },
  { d: 5, pitch: 0.8 },
  { d: 6, pitch: 1 },
  { d: 8, pitch: 1.25 },
  { d: 10, pitch: 1.5 },
  { d: 12, pitch: 1.75 },
  { d: 14, pitch: 2 },
  { d: 16, pitch: 2 },
  { d: 18, pitch: 2.5 },
  { d: 20, pitch: 2.5 },
  { d: 22, pitch: 2.5 },
  { d: 24, pitch: 3 },
  { d: 27, pitch: 3 },
  { d: 30, pitch: 3.5 },
  { d: 33, pitch: 3.5 },
  { d: 36, pitch: 4 },
  { d: 39, pitch: 4 },
  { d: 42, pitch: 4.5 },
  { d: 45, pitch: 4.5 },
  { d: 48, pitch: 5 },
  { d: 52, pitch: 5 },
  { d: 56, pitch: 5.5 },
  { d: 60, pitch: 5.5 },
  { d: 64, pitch: 6 },
];

/** Commonly used fine pitches per diameter (convenience chips; any pitch may be typed). */
export const FINE_METRIC_PITCHES: Record<string, number[]> = {
  '6': [0.75],
  '8': [1, 0.75],
  '10': [1.25, 1, 0.75],
  '12': [1.5, 1.25, 1],
  '14': [1.5, 1.25, 1],
  '16': [1.5, 1],
  '18': [2, 1.5, 1],
  '20': [2, 1.5, 1],
  '22': [2, 1.5, 1],
  '24': [2, 1.5, 1],
  '27': [2, 1.5, 1],
  '30': [3, 2, 1.5, 1],
};

export const METRIC_CLASSES_EXTERNAL = ['4g', '6g', '6e', '6f', '4h', '6h', '8g'] as const;
export const METRIC_CLASSES_INTERNAL = ['5H', '6H', '7H', '6G'] as const;

export function metricPitchChoices(d: number): { pitch: number; fine: boolean }[] {
  const out: { pitch: number; fine: boolean }[] = [];
  const coarse = COARSE_METRIC.find((m) => Math.abs(m.d - d) < 1e-9);
  if (coarse) out.push({ pitch: coarse.pitch, fine: false });
  for (const p of FINE_METRIC_PITCHES[String(d)] ?? []) out.push({ pitch: p, fine: true });
  return out;
}
