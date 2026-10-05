import type { Unit } from './units';

export interface Settings {
  defaultUnit: Unit;
  /** Default Unified class number: 1, 2 or 3 (A/B suffix follows external/internal). */
  defaultUnifiedClass: '1' | '2' | '3';
  defaultMetricExternal: string;
  defaultMetricInternal: string;
  /** 'actual': machinist enters the wire in hand. 'best': always use theoretical best wire. */
  wireMode: 'actual' | 'best';
  keepScreenOn: boolean;
  inchDecimals: 4 | 5 | 6;
  metricDecimals: 2 | 3 | 4;
}

export const DEFAULT_SETTINGS: Settings = {
  defaultUnit: 'in',
  defaultUnifiedClass: '2',
  defaultMetricExternal: '6g',
  defaultMetricInternal: '6H',
  wireMode: 'actual',
  keepScreenOn: true,
  inchDecimals: 4,
  metricDecimals: 3,
};
