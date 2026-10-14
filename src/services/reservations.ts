import type { Copy, LibraryData, Reservation } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { addDaysISO, fmtDate } from '@/lib/dates';
import { activeLoans, getBook, getMember, log, notify, type Ctx } from './common';

/**
 * QUEUE POLICY
 * - Reservations for a title form a first-come, first-served queue ordered by `createdAt`.
 * - When a copy becomes free (return, cancellation, expiry, repair), it is offered to the
 *   oldest "waiting" reservation whose member is still active. The copy goes "on hold",
 *   the reservation becomes "ready" and the member has `pickupDays` to collect it.
 * - A ready reservation that is not collected by its pickup deadline expires and the copy
 *   moves on to the next person in the queue (or back to the shelf).
 * - If a copy is on the shelf when a reservation is placed and nobody is queued, the copy is
 *   placed on hold immediately.
 */

export function queueFor(d: LibraryData, bookId: string): Reservation[] {
  return d.reservations
    .filter((r) => r.bookId === bookId && r.status === 'waiting')
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

export function queuePosition(d: LibraryData, r: Reservation): number | null {
  if (r.status !== 'waiting') return null;
  return queueFor(d, r.bookId).findIndex((x) => x.id === r.id) + 1;
}

export function isOpen(r: Reservation) {
  return r.status === 'waiting' || r.status === 'ready';
}

/** Offers a just-freed copy to the queue. Sets the copy status accordingly. */
export function allocateCopy(d: LibraryData, copy: Copy, ctx: Ctx): Reservation | undefined {
  const book = getBook(d, copy.bookId);
  const next = queueFor(d, copy.bookId).find((r) => d.members.find((m) => m.id === r.memberId)?.status === 'active');
  copy.updatedAt = ctx.now;
  if (!next || book.status !== 'active') {
    copy.status = 'available';
    return undefined;
  }
  copy.status = 'on_hold';
  next.status = 'ready';
  next.copyId = copy.id;
  next.readyAt = ctx.now;
  next.pickupBy = addDaysISO(ctx.now, d.settings.pickupDays);
  notify(d, ctx, {
    recipient: next.memberId,
    kind: 'reservation_ready',
    title: 'Your reserved book is ready',
    body: `“${book.title}” is on hold for you until ${fmtDate(next.pickupBy)}. Collect it at the circulation desk.`,
    link: { kind: 'book', id: book.id },
    dedupeKey: `ready:${next.id}`,
  });
  log(d, ctx, 'reservation.ready', `Held copy ${copy.barcode} for reservation of “${book.title}”`, {
    kind: 'reservation', id: next.id, label: book.title,
  }, { copy: copy.barcode, member: getMember(d, next.memberId).name });
  return next;
}

export function placeReservation(d: LibraryData, input: { memberId: string; bookId: string }, ctx: Ctx): Reservation {
  const member = getMember(d, input.memberId);
  const book = getBook(d, input.bookId);
  if (member.status !== 'active') throw new DomainError('This membership is not active.', 'member_inactive');
  if (book.status !== 'active') throw new DomainError('This title is archived and cannot be reserved.', 'book_archived');
  if (d.reservations.some((r) => r.memberId === member.id && r.bookId === book.id && isOpen(r)))
    throw new DomainError('You already have an open reservation for this title.', 'duplicate_reservation');
  if (activeLoans(d, member.id).some((l) => l.bookId === book.id))
    throw new DomainError('You already have this title on loan.', 'already_borrowed');
  const usable = d.copies.filter((c) => c.bookId === book.id && c.status !== 'withdrawn' && c.status !== 'lost');
  if (usable.length === 0) throw new DomainError('No circulating copies exist for this title yet.', 'no_copies');

  const r: Reservation = { id: newId('rsv'), bookId: book.id, memberId: member.id, createdAt: ctx.now, status: 'waiting' };
  d.reservations.push(r);
  log(d, ctx, 'reservation.created', `Reservation placed for “${book.title}”`, { kind: 'reservation', id: r.id, label: book.title }, {
    member: member.name,
  });

  const shelfCopy = d.copies.find((c) => c.bookId === book.id && c.status === 'available');
  if (shelfCopy && queueFor(d, book.id)[0]?.id === r.id) {
    allocateCopy(d, shelfCopy, ctx);
  } else {
    notify(d, ctx, {
      recipient: member.id,
      kind: 'reservation_placed',
      title: 'Reservation confirmed',
      body: `You are #${queuePosition(d, r)} in the queue for “${book.title}”. We will notify you when a copy is held for you.`,
      link: { kind: 'book', id: book.id },
    });
  }
  return r;
}

/** Moves a copy that was held for a now-closed reservation to the next in line (or the shelf). */
function passOnHeldCopy(d: LibraryData, copyId: string | undefined, ctx: Ctx) {
  const copy = copyId ? d.copies.find((c) => c.id === copyId) : undefined;
  if (copy && copy.status === 'on_hold') allocateCopy(d, copy, ctx);
}

export function cancelReservation(d: LibraryData, id: string, ctx: Ctx, reason = 'Cancelled'): Reservation {
  const r = d.reservations.find((x) => x.id === id);
  if (!r) throw new DomainError('Reservation not found.', 'not_found');
  if (!isOpen(r)) throw new DomainError('Only waiting or ready reservations can be cancelled.', 'not_open');
  const book = getBook(d, r.bookId);
  const heldCopyId = r.status === 'ready' ? r.copyId : undefined;
  r.status = 'cancelled';
  r.closedAt = ctx.now;
  r.copyId = undefined;
  passOnHeldCopy(d, heldCopyId, ctx);
  notify(d, ctx, {
    recipient: r.memberId,
    kind: 'reservation_cancelled',
    title: 'Reservation cancelled',
    body: `Your reservation for “${book.title}” was cancelled. ${reason !== 'Cancelled' ? reason : ''}`.trim(),
    link: { kind: 'book', id: book.id },
  });
  log(d, ctx, 'reservation.cancelled', `Cancelled reservation for “${book.title}”`, { kind: 'reservation', id: r.id, label: book.title }, {
    reason,
  });
  return r;
}

/** Expires ready reservations past their pickup deadline. Returns number expired. */
export function expireReservations(d: LibraryData, ctx: Ctx): number {
  const now = new Date(ctx.now).getTime();
  let n = 0;
  for (const r of d.reservations) {
    if (r.status !== 'ready' || !r.pickupBy || new Date(r.pickupBy).getTime() >= now) continue;
    const book = getBook(d, r.bookId);
    const heldCopyId = r.copyId;
    r.status = 'expired';
    r.closedAt = ctx.now;
    r.copyId = undefined;
    passOnHeldCopy(d, heldCopyId, ctx);
    notify(d, ctx, {
      recipient: r.memberId,
      kind: 'reservation_expired',
      title: 'Reservation expired',
      body: `The hold on “${book.title}” expired because it was not collected by ${fmtDate(r.pickupBy)}.`,
      link: { kind: 'book', id: book.id },
      dedupeKey: `expired:${r.id}`,
    });
    log(d, ctx, 'reservation.expired', `Hold expired for “${book.title}”`, { kind: 'reservation', id: r.id, label: book.title });
    n++;
  }
  return n;
}

/** Closes every open reservation of a member (used when a membership is deactivated). */
export function cancelMemberReservations(d: LibraryData, memberId: string, ctx: Ctx, reason: string): number {
  const open = d.reservations.filter((r) => r.memberId === memberId && isOpen(r));
  for (const r of open) cancelReservation(d, r.id, ctx, reason);
  return open.length;
}
