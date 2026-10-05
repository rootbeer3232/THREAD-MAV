/**
 * Versioned storage migrations. NEVER drop or rewrite user data in a migration
 * without copying it first — saved calculations, favorites and notes must survive upgrades.
 *
 * Two layers:
 *  1. Database schema (object stores/indexes): migrateSchema, keyed by IndexedDB version.
 *  2. Record shape: migrateRecord, keyed by CalcRecord.v — applied lazily on read.
 */
import { type CalcRecord, RECORD_VERSION } from './types';

type SchemaStep = (db: IDBDatabase, tx: IDBTransaction) => void;

/** steps[n] upgrades the database from version n-1 to n. */
const schemaSteps: Record<number, SchemaStep> = {
  1: (db) => {
    const records = db.createObjectStore('records', { keyPath: 'id' });
    records.createIndex('updatedAt', 'updatedAt');
    records.createIndex('signature', 'signature');
    db.createObjectStore('kv', { keyPath: 'key' });
  },
};

export function migrateSchema(db: IDBDatabase, oldVersion: number, newVersion: number, tx: IDBTransaction): void {
  for (let v = oldVersion + 1; v <= newVersion; v++) {
    const step = schemaSteps[v];
    if (!step) throw new Error(`Missing schema migration to v${v}`);
    step(db, tx);
  }
}

/** Upgrade an older stored record to the current shape. Unknown/newer records pass through untouched. */
export function migrateRecord(raw: CalcRecord): CalcRecord {
  const r = { ...raw };
  if (typeof r.v !== 'number') r.v = 0;
  // v0 → v1: ensure every field the app relies on exists.
  if (r.v < 1) {
    r.saved = r.saved ?? true;
    r.favorite = r.favorite ?? false;
    r.note = r.note ?? '';
    r.summary = r.summary ?? [];
    r.subtitle = r.subtitle ?? '';
    r.engine = r.engine ?? 'legacy';
    r.v = 1;
  }
  if (r.v > RECORD_VERSION) return raw; // written by a newer build: leave alone
  return r;
}
