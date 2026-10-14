import { describe, expect, it } from 'vitest';
import { MemoryAdapter } from '@/repositories/adapter';
import { CORRUPT_KEY, DB_KEY, LibraryStore } from '@/repositories/store';
import { parseEnvelope, SCHEMA_VERSION } from '@/repositories/schema';
import { checkIntegrity } from '@/repositories/integrity';
import { createLibrary } from '@/app/library';
import { SessionStore } from '@/services/session';
import { NOW, seed, tiny } from './helpers';

describe('storage layer', () => {
  it('seeds once on first load and persists a versioned envelope', () => {
    const a = new MemoryAdapter();
    let calls = 0;
    const store = new LibraryStore(a, () => { calls++; return tiny(); });
    expect(store.load().state).toBe('ready');
    const raw = JSON.parse(a.read(DB_KEY)!);
    expect(raw.schemaVersion).toBe(SCHEMA_VERSION);
    expect(raw.app).toBe('librax');
    const again = new LibraryStore(a, () => { calls++; return tiny(); });
    again.load();
    expect(calls).toBe(1);
    expect(again.getState().books).toHaveLength(1);
  });

  it('persists transactions across reloads', () => {
    const a = new MemoryAdapter();
    const s1 = new LibraryStore(a, tiny);
    s1.load();
    s1.transact((d) => { d.books[0]!.title = 'Renamed'; });
    const s2 = new LibraryStore(a, tiny);
    s2.load();
    expect(s2.getState().books[0]!.title).toBe('Renamed');
  });

  it('rolls back completely when a transaction throws', () => {
    const a = new MemoryAdapter();
    const s = new LibraryStore(a, tiny);
    s.load();
    const before = a.read(DB_KEY);
    expect(() => s.transact((d) => { d.books[0]!.title = 'X'; throw new Error('boom'); })).toThrow('boom');
    expect(s.getState().books[0]!.title).toBe('Rule Testing');
    expect(a.read(DB_KEY)).toBe(before);
  });

  it('rejects changes that would break referential integrity', () => {
    const s = new LibraryStore(new MemoryAdapter(), tiny);
    s.load();
    expect(() => s.transact((d) => { d.copies[0]!.bookId = 'missing'; })).toThrow(/integrity/);
    expect(s.getState().copies[0]!.bookId).toBe('b1');
  });

  it('keeps memory state unchanged when the storage write fails', () => {
    const a = new MemoryAdapter();
    const s = new LibraryStore(a, tiny);
    s.load();
    a.failWrites = true;
    expect(() => s.transact((d) => { d.books[0]!.title = 'Y'; })).toThrow(/write failure/);
    expect(s.getState().books[0]!.title).toBe('Rule Testing');
  });

  it('detects corrupted JSON, preserves it, and refuses writes until recovered', () => {
    const a = new MemoryAdapter();
    a.write(DB_KEY, '{not json');
    const s = new LibraryStore(a, tiny);
    const st = s.load();
    expect(st.state).toBe('corrupt');
    expect(a.read(CORRUPT_KEY)).toBe('{not json');
    expect(() => s.transact(() => undefined)).toThrow(/recovery/);
    s.replaceAll(tiny());
    expect(s.status.state).toBe('ready');
  });

  it('rejects envelopes from a newer schema and runs migrations for older ones', () => {
    const env = { app: 'librax', schemaVersion: 99, updatedAt: new Date().toISOString(), data: tiny() };
    expect(parseEnvelope(env).ok).toBe(false);
    const old = { app: 'librax', schemaVersion: 1, updatedAt: new Date().toISOString(), legacy: { b: tiny() } };
    const res = parseEnvelope(old, { 1: (o) => ({ ...o, data: (o.legacy as { b: unknown }).b }) }, 2);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.migratedFrom).toBe(1);
  });

  it('rejects non-LIBRAX JSON', () => {
    expect(parseEnvelope({ hello: 'world' }).ok).toBe(false);
    expect(parseEnvelope([]).ok).toBe(false);
  });
});

describe('seed data', () => {
  it('builds a consistent, rich demonstration library', () => {
    const d = seed();
    expect(checkIntegrity(d)).toEqual([]);
    expect(d.books.length).toBeGreaterThanOrEqual(30);
    expect(d.members.length).toBeGreaterThanOrEqual(15);
    expect(new Set(d.books.map((b) => b.category)).size).toBeGreaterThan(5);
    expect(d.loans.filter((l) => !l.returnedAt).length).toBeGreaterThan(3);
    expect(d.loans.filter((l) => l.returnedAt).length).toBeGreaterThan(20);
    expect(d.loans.filter((l) => !l.returnedAt && l.dueAt < NOW).length).toBeGreaterThan(0);
    expect(d.reservations.some((r) => r.status === 'fulfilled')).toBe(true);
    expect(d.reservations.some((r) => r.status === 'waiting')).toBe(true);
    expect(d.reservations.some((r) => r.status === 'ready')).toBe(true);
    expect(d.fines.length).toBeGreaterThan(0);
    expect(d.notifications.length).toBeGreaterThan(0);
    expect(d.activity.length).toBeGreaterThan(0);
  });

  it('gives the demo student an overdue loan, a ready hold and a queued reservation', () => {
    const d = seed();
    const riya = 'mem_seed_01';
    const now = NOW;
    expect(d.loans.some((l) => l.memberId === riya && !l.returnedAt && l.dueAt < now)).toBe(true);
    expect(d.reservations.some((r) => r.memberId === riya && r.status === 'ready')).toBe(true);
    expect(d.reservations.some((r) => r.memberId === riya && r.status === 'waiting')).toBe(true);
  });

  it('is repeatable: the same structure on every build', () => {
    const a = seed();
    const b = seed();
    expect(a.books.map((x) => x.isbn)).toEqual(b.books.map((x) => x.isbn));
    expect(a.copies.map((x) => `${x.barcode}:${x.status}`)).toEqual(b.copies.map((x) => `${x.barcode}:${x.status}`));
    expect(a.loans.length).toBe(b.loans.length);
  });

  it('reset replaces data instead of duplicating it', () => {
    const lib = createLibrary(new MemoryAdapter(), { seed: tiny, session: new SessionStore() });
    lib.store.load();
    lib.resetDemo();
    lib.resetDemo();
    expect(lib.store.getState().books).toHaveLength(1);
  });
});

describe('seed robustness', () => {
  it('builds a consistent library on any date, including month and year boundaries', async () => {
    const { buildSeed } = await import('@/seed/seed');
    for (const iso of ['2026-01-01T00:30:00.000Z', '2026-03-31T23:00:00.000Z', '2027-02-28T12:00:00.000Z', '2026-12-31T18:45:00.000Z']) {
      const d = buildSeed(new Date(iso));
      expect(checkIntegrity(d)).toEqual([]);
      expect(d.reservations.some((r) => r.memberId === 'mem_seed_01' && r.status === 'waiting')).toBe(true);
    }
  });
});
