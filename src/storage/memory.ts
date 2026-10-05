import type { CalcRecord, StorageBackend } from './types';

/** In-memory backend: used by tests and as a last-resort fallback when IndexedDB is unavailable. */
export class MemoryBackend implements StorageBackend {
  readonly kind = 'memory' as const;
  readonly schemaVersion: number;
  private records = new Map<string, CalcRecord>();
  private kv = new Map<string, unknown>();
  constructor(schemaVersion = 1) {
    this.schemaVersion = schemaVersion;
  }
  async getRecord(id: string) {
    const r = this.records.get(id);
    return r ? structuredClone(r) : undefined;
  }
  async putRecord(rec: CalcRecord) {
    this.records.set(rec.id, structuredClone(rec));
  }
  async deleteRecords(ids: string[]) {
    ids.forEach((i) => this.records.delete(i));
  }
  async allRecords() {
    return [...this.records.values()].map((r) => structuredClone(r));
  }
  async getKV<T>(key: string) {
    return this.kv.has(key) ? (structuredClone(this.kv.get(key)) as T) : undefined;
  }
  async setKV<T>(key: string, value: T) {
    this.kv.set(key, structuredClone(value));
  }
  async deleteKV(key: string) {
    this.kv.delete(key);
  }
  async clearAll() {
    this.records.clear();
    this.kv.clear();
  }
}
