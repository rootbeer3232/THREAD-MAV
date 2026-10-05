/** Storage abstraction. The app only talks to these interfaces so the backend can evolve. */

export const RECORD_VERSION = 1;

export interface SummaryLine {
  label: string;
  /** Primary value text exactly as shown to the user (units included). */
  value: string;
  /** Equivalent in the other system, as shown. */
  alt?: string;
}

export interface CalcRecord {
  /** Record schema version (see migrateRecord). */
  v: number;
  id: string;
  /** Calculator id, e.g. "thread", "sine". */
  calcId: string;
  /** Hash of calculator + inputs; identical calculations share one record. */
  signature: string;
  title: string;
  subtitle: string;
  /** Calculator-specific serialized inputs (enough to reopen and recompute). */
  inputs: unknown;
  /** Snapshot of the results as displayed at calculation time. */
  summary: SummaryLine[];
  /** Calculation-engine version that produced the snapshot. */
  engine: string;
  createdAt: number;
  updatedAt: number;
  saved: boolean;
  favorite: boolean;
  note: string;
}

export interface StorageBackend {
  readonly kind: 'indexeddb' | 'memory';
  readonly schemaVersion: number;
  getRecord(id: string): Promise<CalcRecord | undefined>;
  putRecord(rec: CalcRecord): Promise<void>;
  deleteRecords(ids: string[]): Promise<void>;
  allRecords(): Promise<CalcRecord[]>;
  getKV<T>(key: string): Promise<T | undefined>;
  setKV<T>(key: string, value: T): Promise<void>;
  deleteKV(key: string): Promise<void>;
  /** Removes every record and every KV entry. */
  clearAll(): Promise<void>;
}

export interface ExportBundle {
  app: 'Thread Mav';
  format: 'thread-mav-export';
  formatVersion: 1;
  exportedAt: string;
  schemaVersion: number;
  records: CalcRecord[];
  settings: unknown;
}
