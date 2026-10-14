import type { Copy, CopyStatus, LibraryData } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId, nextSequence } from '@/lib/ids';
import { fromInputDate } from '@/lib/dates';
import { getBook, getCopy, log, type Ctx } from './common';
import { allocateCopy } from './reservations';
import type { CopyInput } from './validation';

export const COPY_STATUS_LABEL: Record<CopyStatus, string> = {
  available: 'Available',
  borrowed: 'Borrowed',
  on_hold: 'On hold',
  maintenance: 'In maintenance',
  lost: 'Lost',
  damaged: 'Damaged',
  withdrawn: 'Withdrawn',
};

/**
 * Manual status changes staff may make. "borrowed" and "on_hold" are managed only by the
 * circulation and reservation workflows so records never contradict each other.
 * "withdrawn" is terminal.
 */
export const COPY_TRANSITIONS: Record<CopyStatus, CopyStatus[]> = {
  available: ['maintenance', 'damaged', 'lost', 'withdrawn'],
  borrowed: [],
  on_hold: [],
  maintenance: ['available', 'damaged', 'withdrawn'],
  damaged: ['maintenance', 'available', 'withdrawn'],
  lost: ['available', 'withdrawn'],
  withdrawn: [],
};

export function canTransition(from: CopyStatus, to: CopyStatus): boolean {
  return COPY_TRANSITIONS[from].includes(to);
}

export function nextBarcode(d: LibraryData): string {
  return nextSequence(d.copies.map((c) => c.barcode), 'LBX-', 6);
}

function assertBarcodeFree(d: LibraryData, barcode: string, exceptId?: string) {
  const b = barcode.toUpperCase();
  if (d.copies.some((c) => c.barcode.toUpperCase() === b && c.id !== exceptId))
    throw new DomainError(`Barcode ${barcode} is already assigned to another copy.`, 'duplicate_barcode');
}

export function createCopy(d: LibraryData, bookId: string, input: CopyInput, ctx: Ctx): Copy {
  const book = getBook(d, bookId);
  if (book.status !== 'active') throw new DomainError('Restore the title before adding copies.', 'book_archived');
  const barcode = (input.barcode ?? nextBarcode(d)).toUpperCase();
  assertBarcodeFree(d, barcode);
  const copy: Copy = {
    id: newId('cp'),
    bookId,
    barcode,
    shelfLocation: input.shelfLocation,
    condition: input.condition,
    acquiredAt: fromInputDate(input.acquiredAt) ?? ctx.now,
    status: 'available',
    notes: input.notes,
    updatedAt: ctx.now,
  };
  d.copies.push(copy);
  log(d, ctx, 'copy.created', `Added copy ${barcode} of “${book.title}”`, { kind: 'copy', id: copy.id, label: barcode }, {
    shelf: copy.shelfLocation,
  });
  // A brand-new copy can immediately serve a waiting reservation.
  allocateCopy(d, copy, ctx);
  return copy;
}

export function updateCopy(d: LibraryData, id: string, input: CopyInput, ctx: Ctx): Copy {
  const copy = getCopy(d, id);
  const barcode = (input.barcode ?? copy.barcode).toUpperCase();
  assertBarcodeFree(d, barcode, id);
  const changes: string[] = [];
  if (barcode !== copy.barcode) changes.push(`barcode ${copy.barcode}→${barcode}`);
  if (input.shelfLocation !== copy.shelfLocation) changes.push(`shelf ${copy.shelfLocation}→${input.shelfLocation}`);
  if (input.condition !== copy.condition) changes.push(`condition ${copy.condition}→${input.condition}`);
  Object.assign(copy, {
    barcode,
    shelfLocation: input.shelfLocation,
    condition: input.condition,
    acquiredAt: fromInputDate(input.acquiredAt) ?? copy.acquiredAt,
    notes: input.notes,
    updatedAt: ctx.now,
  });
  log(d, ctx, 'copy.updated', `Updated copy ${barcode}`, { kind: 'copy', id, label: barcode }, { changes: changes.join('; ') || 'details' });
  return copy;
}

export function changeCopyStatus(d: LibraryData, id: string, to: CopyStatus, ctx: Ctx, note?: string): Copy {
  const copy = getCopy(d, id);
  const from = copy.status;
  if (!canTransition(from, to)) {
    const why = from === 'borrowed'
      ? 'Return the loan first.'
      : from === 'on_hold'
        ? 'Cancel the reservation holding this copy first.'
        : from === 'withdrawn'
          ? 'Withdrawn copies are permanently retired.'
          : '';
    throw new DomainError(`Cannot change ${COPY_STATUS_LABEL[from]} → ${COPY_STATUS_LABEL[to]}. ${why}`.trim(), 'invalid_transition');
  }
  copy.status = to;
  copy.updatedAt = ctx.now;
  if (note) copy.notes = note;
  log(d, ctx, 'copy.status', `Copy ${copy.barcode}: ${COPY_STATUS_LABEL[from]} → ${COPY_STATUS_LABEL[to]}`, {
    kind: 'copy', id, label: copy.barcode,
  }, { from, to, ...(note ? { note } : {}) });
  if (to === 'available') allocateCopy(d, copy, ctx);
  return copy;
}
