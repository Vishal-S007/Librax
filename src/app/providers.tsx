import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { LibraryData, Session } from '@/types/models';
import type { Library } from './library';
import type { LoadStatus } from '@/repositories/store';
import { nowISO } from '@/lib/dates';

const LibraryContext = createContext<Library | null>(null);

export function LibraryProvider({ library, children }: { library: Library; children: ReactNode }) {
  // Run reminders/hold-expiry on start and every minute; writes only when something is due.
  useEffect(() => {
    const run = () => { try { library.maintenance(); } catch { /* surfaced elsewhere */ } };
    run();
    const t = window.setInterval(run, 60_000);
    // Keep tabs in sync: another tab writing the same key reloads our copy.
    const onStorage = (e: StorageEvent) => { if (e.key === 'librax:db') library.store.load(); if (e.key === 'librax:session') library.session.load(); };
    window.addEventListener('storage', onStorage);
    return () => { window.clearInterval(t); window.removeEventListener('storage', onStorage); };
  }, [library]);
  return <LibraryContext.Provider value={library}>{children}</LibraryContext.Provider>;
}

export function useLibrary(): Library {
  const lib = useContext(LibraryContext);
  if (!lib) throw new Error('useLibrary must be used inside LibraryProvider');
  return lib;
}

/** Whole data snapshot. The reference changes only after a committed transaction. */
export function useData(): LibraryData {
  const lib = useLibrary();
  return useSyncExternalStore(lib.store.subscribe, lib.store.getState);
}

export function useLoadStatus(): LoadStatus {
  const lib = useLibrary();
  useSyncExternalStore(lib.store.subscribe, lib.store.getState);
  return lib.store.status;
}

export function useSession(): Session | null {
  const lib = useLibrary();
  return useSyncExternalStore(lib.session.subscribe, lib.session.get);
}

/** Current time, refreshed every minute so due/overdue labels stay correct. */
export function useNow(): string {
  const [now, setNow] = useState(nowISO);
  useEffect(() => {
    const t = window.setInterval(() => setNow(nowISO()), 60_000);
    return () => window.clearInterval(t);
  }, []);
  return now;
}
