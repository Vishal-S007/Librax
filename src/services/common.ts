import type {
  Activity, ActivityType, Actor, AppNotification, Book, Copy, Fine, LibraryData, Loan, Member, Settings,
} from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { daysLate } from '@/lib/dates';
import { sumMinor } from '@/lib/money';

export interface Ctx {
  actor: Actor;
  now: string;
}

const MAX_ACTIVITY = 3000;
const MAX_NOTIFICATIONS = 2000;

export function log(
  d: LibraryData,
  ctx: Ctx,
  type: ActivityType,
  summary: string,
  entity?: Activity['entity'],
  meta?: Activity['meta'],
) {
  d.activity.unshift({
    id: newId('act'),
    type,
    at: ctx.now,
    actor: { name: ctx.actor.name, role: ctx.actor.role },
    entity,
    summary,
    meta,
  });
  if (d.activity.length > MAX_ACTIVITY) d.activity.length = MAX_ACTIVITY;
}

/** Adds a notification unless one with the same dedupeKey already exists. Returns true if added. */
export function notify(d: LibraryData, ctx: Ctx, n: Omit<AppNotification, 'id' | 'createdAt' | 'read'>): boolean {
  if (n.dedupeKey && d.notifications.some((x) => x.dedupeKey === n.dedupeKey)) return false;
  d.notifications.unshift({ ...n, id: newId('ntf'), createdAt: ctx.now, read: false });
  if (d.notifications.length > MAX_NOTIFICATIONS) d.notifications.length = MAX_NOTIFICATIONS;
  return true;
}

export function getBook(d: LibraryData, id: string): Book {
  const b = d.books.find((x) => x.id === id);
  if (!b) throw new DomainError('Book not found.', 'not_found');
  return b;
}
export function getCopy(d: LibraryData, id: string): Copy {
  const c = d.copies.find((x) => x.id === id);
  if (!c) throw new DomainError('Copy not found.', 'not_found');
  return c;
}
export function getMember(d: LibraryData, id: string): Member {
  const m = d.members.find((x) => x.id === id);
  if (!m) throw new DomainError('Member not found.', 'not_found');
  return m;
}
export function getLoan(d: LibraryData, id: string): Loan {
  const l = d.loans.find((x) => x.id === id);
  if (!l) throw new DomainError('Loan not found.', 'not_found');
  return l;
}
export function getFine(d: LibraryData, id: string): Fine {
  const f = d.fines.find((x) => x.id === id);
  if (!f) throw new DomainError('Fine not found.', 'not_found');
  return f;
}

/* ---------------- Policy ---------------- */

export function borrowLimitFor(m: Member, s: Settings): number {
  if (m.borrowLimit) return m.borrowLimit;
  return m.type === 'faculty' ? s.maxBorrowFaculty : m.type === 'staff' ? s.maxBorrowStaff : s.maxBorrowStudent;
}
export function loanDaysFor(m: Member, s: Settings): number {
  return m.type === 'faculty' ? s.facultyLoanDays : s.loanDays;
}
export function renewalLimitFor(m: Member, s: Settings): number {
  return m.type === 'faculty' ? s.facultyRenewalLimit : s.renewalLimit;
}

/* ---------------- Fines ---------------- */

/**
 * Overdue fine in minor units. Days within the grace period are free; after
 * the grace period, every late day beyond it is charged, capped at maxFinePerLoan
 * (0 = no cap). Integer arithmetic only.
 */
export function overdueFine(dueAt: string, at: string, s: Settings): { days: number; chargeableDays: number; amount: number } {
  const days = daysLate(dueAt, at);
  const chargeableDays = Math.max(0, days - s.fineGraceDays);
  let amount = chargeableDays * s.fineRatePerDay;
  if (s.maxFinePerLoan > 0) amount = Math.min(amount, s.maxFinePerLoan);
  return { days, chargeableDays, amount };
}

export function fineBalance(f: Fine): number {
  return f.assessed + sumMinor(f.adjustments.map((a) => a.amount)) - sumMinor(f.settlements.map((x) => x.amount));
}

export type FineStatus = 'outstanding' | 'settled' | 'waived';
export function fineStatus(f: Fine): FineStatus {
  if (fineBalance(f) > 0) return 'outstanding';
  return f.settlements.length > 0 ? 'settled' : 'waived';
}

export function memberBalance(d: LibraryData, memberId: string): number {
  return sumMinor(d.fines.filter((f) => f.memberId === memberId).map(fineBalance));
}

/* ---------------- Availability ---------------- */

export interface Availability {
  total: number;
  available: number;
  borrowed: number;
  onHold: number;
  unavailable: number;
  waiting: number;
}

export function availabilityOf(d: LibraryData, bookId: string): Availability {
  const a: Availability = { total: 0, available: 0, borrowed: 0, onHold: 0, unavailable: 0, waiting: 0 };
  for (const c of d.copies) {
    if (c.bookId !== bookId || c.status === 'withdrawn') continue;
    a.total++;
    if (c.status === 'available') a.available++;
    else if (c.status === 'borrowed') a.borrowed++;
    else if (c.status === 'on_hold') a.onHold++;
    else a.unavailable++;
  }
  a.waiting = d.reservations.filter((r) => r.bookId === bookId && r.status === 'waiting').length;
  return a;
}

export function activeLoans(d: LibraryData, memberId?: string): Loan[] {
  return d.loans.filter((l) => !l.returnedAt && (!memberId || l.memberId === memberId));
}

export function isOverdue(l: Loan, now: string): boolean {
  return !l.returnedAt && new Date(l.dueAt).getTime() < new Date(now).getTime();
}
