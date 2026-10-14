import { StorageError } from '@/lib/errors';

/**
 * Minimal key-value persistence contract. A future HTTP/IndexedDB adapter can
 * implement the same interface without screens needing to change.
 */
export interface StorageAdapter {
  read(key: string): string | null;
  write(key: string, value: string): void;
  remove(key: string): void;
}

export class LocalStorageAdapter implements StorageAdapter {
  read(key: string): string | null {
    try {
      return window.localStorage.getItem(key);
    } catch (e) {
      throw new StorageError('Browser storage is unavailable (private mode or blocked site data?).', e);
    }
  }
  write(key: string, value: string): void {
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      const quota = e instanceof DOMException && (e.name === 'QuotaExceededError' || e.code === 22);
      throw new StorageError(
        quota ? 'Browser storage is full. Export a backup and remove old records.' : 'Could not save to browser storage.',
        e,
      );
    }
  }
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* ignore */
    }
  }
}

export class MemoryAdapter implements StorageAdapter {
  private map = new Map<string, string>();
  failWrites = false;
  read(key: string) {
    return this.map.get(key) ?? null;
  }
  write(key: string, value: string) {
    if (this.failWrites) throw new StorageError('Simulated write failure');
    this.map.set(key, value);
  }
  remove(key: string) {
    this.map.delete(key);
  }
}
