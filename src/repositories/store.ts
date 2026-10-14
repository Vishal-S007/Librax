import type { DatabaseEnvelope, LibraryData } from '@/types/models';
import { StorageError } from '@/lib/errors';
import { nowISO } from '@/lib/dates';
import type { StorageAdapter } from './adapter';
import { checkIntegrity } from './integrity';
import { parseEnvelope, SCHEMA_VERSION, emptyData } from './schema';

export const DB_KEY = 'librax:db';
export const CORRUPT_KEY = 'librax:db:corrupt-backup';

export type LoadStatus =
  | { state: 'ready'; seeded: boolean; migratedFrom?: number }
  | { state: 'corrupt'; reason: string }
  | { state: 'unavailable'; reason: string };

type Listener = () => void;

/**
 * Single source of truth for library data.
 *
 * Every mutation goes through `transact`, which works on a deep copy, validates
 * referential integrity, persists, and only then swaps the in-memory state.
 * If any step throws, neither memory nor storage changes — multi-record
 * operations (issue, return, reservation hand-off) are therefore atomic.
 */
export class LibraryStore {
  private data: LibraryData = emptyData();
  private listeners = new Set<Listener>();
  private envelopeMeta: Pick<DatabaseEnvelope, 'seededAt' | 'updatedAt'> = { updatedAt: nowISO() };
  status: LoadStatus = { state: 'ready', seeded: false };

  constructor(
    private readonly adapter: StorageAdapter,
    private readonly seed: () => LibraryData,
    private readonly key = DB_KEY,
  ) {}

  load(): LoadStatus {
    let raw: string | null;
    try {
      raw = this.adapter.read(this.key);
    } catch (e) {
      this.data = this.seed();
      this.status = { state: 'unavailable', reason: e instanceof Error ? e.message : 'Storage unavailable' };
      this.emit();
      return this.status;
    }
    if (raw == null) {
      this.data = this.seed();
      this.envelopeMeta = { seededAt: nowISO(), updatedAt: nowISO() };
      try {
        this.persist(this.data);
        this.status = { state: 'ready', seeded: true };
      } catch (e) {
        this.status = { state: 'unavailable', reason: e instanceof Error ? e.message : 'Storage unavailable' };
      }
      this.emit();
      return this.status;
    }
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      return this.markCorrupt(raw, 'Stored data is not valid JSON.');
    }
    const result = parseEnvelope(json);
    if (!result.ok) return this.markCorrupt(raw, result.reason);
    const problems = checkIntegrity(result.envelope.data);
    if (problems.length) return this.markCorrupt(raw, `Integrity check failed: ${problems[0]}`);
    this.data = result.envelope.data;
    this.envelopeMeta = { seededAt: result.envelope.seededAt, updatedAt: result.envelope.updatedAt };
    if (result.migratedFrom) {
      try { this.persist(this.data); } catch { /* keep in memory; next write retries */ }
    }
    this.status = { state: 'ready', seeded: false, migratedFrom: result.migratedFrom };
    this.emit();
    return this.status;
  }

  private markCorrupt(raw: string, reason: string): LoadStatus {
    try { this.adapter.write(CORRUPT_KEY, raw); } catch { /* best effort */ }
    this.data = emptyData();
    this.status = { state: 'corrupt', reason };
    this.emit();
    return this.status;
  }

  getState = (): LibraryData => this.data;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private emit() {
    for (const l of this.listeners) l();
  }

  private persist(data: LibraryData) {
    const updatedAt = nowISO();
    const envelope: DatabaseEnvelope = {
      app: 'librax',
      schemaVersion: SCHEMA_VERSION,
      seededAt: this.envelopeMeta.seededAt,
      updatedAt,
      data,
    };
    this.adapter.write(this.key, JSON.stringify(envelope));
    this.envelopeMeta.updatedAt = updatedAt;
  }

  /** Runs an atomic mutation. Throws DomainError / StorageError without changing anything on failure. */
  transact<T>(fn: (draft: LibraryData) => T): T {
    if (this.status.state === 'corrupt') throw new StorageError('Data needs recovery before changes can be saved.');
    const draft = structuredClone(this.data);
    const result = fn(draft);
    const problems = checkIntegrity(draft);
    if (problems.length) throw new StorageError(`Change rejected to protect data integrity: ${problems[0]}`);
    if (this.status.state !== 'unavailable') this.persist(draft);
    this.data = draft;
    this.emit();
    return result;
  }

  /** Replaces all data (restore / reset). Validates first. */
  replaceAll(next: LibraryData, opts: { seeded?: boolean } = {}) {
    const problems = checkIntegrity(next);
    if (problems.length) throw new StorageError(`Data rejected: ${problems[0]}`);
    if (opts.seeded) this.envelopeMeta.seededAt = nowISO();
    if (this.status.state !== 'unavailable') this.persist(next);
    this.data = next;
    this.status = { state: 'ready', seeded: !!opts.seeded };
    this.emit();
  }

  exportEnvelope(): DatabaseEnvelope {
    return {
      app: 'librax',
      schemaVersion: SCHEMA_VERSION,
      seededAt: this.envelopeMeta.seededAt,
      updatedAt: this.envelopeMeta.updatedAt,
      data: structuredClone(this.data),
    };
  }

  get meta() {
    return { ...this.envelopeMeta };
  }
}
