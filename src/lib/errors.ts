/** A rule violation the user can understand and act on. */
export class DomainError extends Error {
  constructor(message: string, public readonly code: string = 'domain') {
    super(message);
    this.name = 'DomainError';
  }
}

export class StorageError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'StorageError';
  }
}

export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  return 'Something went wrong.';
}
