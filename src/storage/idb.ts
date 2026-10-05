import type { CalcRecord, StorageBackend } from './types';
import { migrateSchema } from './migrations';

export const DB_NAME = 'thread-mav';
/** Bump when object stores/indexes change; add a step in migrations.ts. */
export const DB_SCHEMA_VERSION = 1;

function req<T>(r: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'));
  });
}

export class IdbBackend implements StorageBackend {
  readonly kind = 'indexeddb' as const;
  readonly schemaVersion: number;
  private constructor(private db: IDBDatabase) {
    this.schemaVersion = db.version;
  }

  static open(name = DB_NAME): Promise<IdbBackend> {
    return new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB unavailable'));
      const open = indexedDB.open(name, DB_SCHEMA_VERSION);
      open.onupgradeneeded = (ev) => {
        migrateSchema(open.result, ev.oldVersion, DB_SCHEMA_VERSION, open.transaction!);
      };
      open.onblocked = () => reject(new Error('Database open blocked by another tab'));
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        db.onversionchange = () => db.close();
        resolve(new IdbBackend(db));
      };
    });
  }

  private store(name: 'records' | 'kv', mode: IDBTransactionMode) {
    const tx = this.db.transaction(name, mode);
    return { tx, os: tx.objectStore(name) };
  }

  async getRecord(id: string) {
    const { os } = this.store('records', 'readonly');
    return (await req(os.get(id))) as CalcRecord | undefined;
  }
  async putRecord(rec: CalcRecord) {
    const { tx, os } = this.store('records', 'readwrite');
    os.put(rec);
    await txDone(tx);
  }
  async deleteRecords(ids: string[]) {
    const { tx, os } = this.store('records', 'readwrite');
    ids.forEach((i) => os.delete(i));
    await txDone(tx);
  }
  async allRecords() {
    const { os } = this.store('records', 'readonly');
    return (await req(os.getAll())) as CalcRecord[];
  }
  async getKV<T>(key: string) {
    const { os } = this.store('kv', 'readonly');
    const row = (await req(os.get(key))) as { key: string; value: T } | undefined;
    return row?.value;
  }
  async setKV<T>(key: string, value: T) {
    const { tx, os } = this.store('kv', 'readwrite');
    os.put({ key, value });
    await txDone(tx);
  }
  async deleteKV(key: string) {
    const { tx, os } = this.store('kv', 'readwrite');
    os.delete(key);
    await txDone(tx);
  }
  async clearAll() {
    const tx = this.db.transaction(['records', 'kv'], 'readwrite');
    tx.objectStore('records').clear();
    tx.objectStore('kv').clear();
    await txDone(tx);
  }
}
