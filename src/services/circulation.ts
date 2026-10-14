import type { Copy, Fine, LibraryData, Loan, Member, Reservation } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { dueDateFrom, fmtDate, toDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import {
  activeLoans, borrowLimitFor, getBook, getCopy, getLoan, getMember, isOverdue, loanDaysFor, log,
  memberBalance, notify, overdueFine, renewalLimitFor, type Ctx,
} from './common';
import { allocateCopy, queueFor } from './reservations';
import { COPY_STATUS_LABEL } from './inventory';
import { isReserveLoanFor, reservesFor } from './courses';

export interface Check {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

/** Runs every issue rule and reports each one, so the UI can show exactly why an issue is blocked. */
export function issueChecks(d: LibraryData, memberId: string | undefined, copyId: string | undefined, now: string): Check[] {
  const s = d.settings;
  const checks: Check[] = [];
  const member = memberId ? d.members.find((m) => m.id === memberId) : undefined;
  const copy = copyId ? d.copies.find((c) => c.id === copyId) : undefined;

  if (member) {
    checks.push({
      id: 'member_status', label: 'Membership active', ok: member.status === 'active',
      detail: member.status === 'active' ? `${member.name} is active` : `Membership is ${member.status}`,
    });
    const current = activeLoans(d, member.id).length;
    const limit = borrowLimitFor(member, s);
    checks.push({
      id: 'limit', label: 'Within borrowing limit', ok: current < limit,
      detail: `${current} of ${limit} items on loan`,
    });
    const overdue = activeLoans(d, member.id).filter((l) => isOverdue(l, now)).length;
    checks.push({
      id: 'overdue', label: 'No overdue items', ok: overdue === 0,
      detail: overdue === 0 ? 'Nothing overdue' : `${overdue} overdue item${overdue > 1 ? 's' : ''} must be returned first`,
    });
    const owed = memberBalance(d, member.id);
    const blocked = s.blockBorrowingAbove > 0 && owed > s.blockBorrowingAbove;
    checks.push({
      id: 'fines', label: 'Fines under threshold', ok: !blocked,
      detail: owed === 0 ? 'No outstanding fines' : `${formatMoney(owed, s.currency)} owed${blocked ? ` (limit ${formatMoney(s.blockBorrowingAbove, s.currency)})` : ''}`,
    });
  }

  if (copy) {
    const book = d.books.find((b) => b.id === copy.bookId);
    const heldFor = copy.status === 'on_hold' ? d.reservations.find((r) => r.status === 'ready' && r.copyId === copy.id) : undefined;
    const copyOk = copy.status === 'available' || (copy.status === 'on_hold' && !!member && heldFor?.memberId === member.id);
    checks.push({
      id: 'copy_status', label: 'Copy can circulate', ok: copyOk && book?.status === 'active',
      detail: book?.status !== 'active'
        ? 'Title is archived'
        : copy.status === 'on_hold'
          ? heldFor && member && heldFor.memberId === member.id
            ? 'Held for this member — will fulfil their reservation'
            : `On hold for ${d.members.find((m) => m.id === heldFor?.memberId)?.name ?? 'another member'}`
          : `${COPY_STATUS_LABEL[copy.status]} · ${copy.shelfLocation}`,
    });
    if (member && copy.status === 'available') {
      const queue = queueFor(d, copy.bookId);
      const mine = queue.findIndex((r) => r.memberId === member.id);
      const ahead = mine === -1 ? queue.length : mine;
      const shelf = d.copies.filter((c) => c.bookId === copy.bookId && c.status === 'available').length;
      checks.push({
        id: 'reservations', label: 'No reservation conflict', ok: ahead < shelf,
        detail: queue.length === 0 ? 'No one is waiting for this title' : ahead < shelf ? `${queue.length} waiting; a shelf copy is free for this member` : `${ahead} member${ahead > 1 ? 's are' : ' is'} ahead in the reservation queue`,
      });
    }
    if (member) {
      const dup = activeLoans(d, member.id).some((l) => l.bookId === copy.bookId);
      checks.push({ id: 'duplicate', label: 'Not already borrowing this title', ok: !dup, detail: dup ? 'Member already has a copy' : 'OK' });
    }
  }
  return checks;
}

/** Loan period for this member and title: course reserves are short-loan for students. */
export function loanDaysForBook(d: LibraryData, member: Member, bookId?: string): number {
  if (bookId && isReserveLoanFor(d, member, bookId)) return Math.min(d.settings.reserveLoanDays, loanDaysFor(member, d.settings));
  return loanDaysFor(member, d.settings);
}

export function dueDateFor(member: Member, d: LibraryData, from: string, bookId?: string): string {
  return dueDateFrom(from, loanDaysForBook(d, member, bookId));
}

export function issueLoan(d: LibraryData, input: { memberId: string; copyId: string }, ctx: Ctx): { loan: Loan; fulfilled?: Reservation } {
  const member = getMember(d, input.memberId);
  const copy = getCopy(d, input.copyId);
  const book = getBook(d, copy.bookId);
  const failed = issueChecks(d, member.id, copy.id, ctx.now).filter((c) => !c.ok);
  if (failed.length) throw new DomainError(`Cannot issue: ${failed.map((f) => f.detail).join('; ')}.`, `issue_${failed[0]!.id}`);

  const loan: Loan = {
    id: newId('ln'),
    copyId: copy.id,
    bookId: book.id,
    memberId: member.id,
    issuedAt: ctx.now,
    dueAt: dueDateFor(member, d, ctx.now, book.id),
    renewals: 0,
    issuedBy: ctx.actor.name,
  };
  let fulfilled: Reservation | undefined;
  if (copy.status === 'on_hold') {
    fulfilled = d.reservations.find((r) => r.status === 'ready' && r.copyId === copy.id && r.memberId === member.id);
  } else {
    // Borrowing a shelf copy also satisfies this member's own waiting reservation, if any.
    fulfilled = d.reservations.find((r) => r.status === 'waiting' && r.bookId === book.id && r.memberId === member.id);
  }
  if (fulfilled) {
    fulfilled.status = 'fulfilled';
    fulfilled.closedAt = ctx.now;
    fulfilled.loanId = loan.id;
    fulfilled.copyId = copy.id;
    log(d, ctx, 'reservation.fulfilled', `Reservation for “${book.title}” fulfilled`, { kind: 'reservation', id: fulfilled.id, label: book.title });
  }
  copy.status = 'borrowed';
  copy.updatedAt = ctx.now;
  d.loans.push(loan);
  notify(d, ctx, {
    recipient: member.id,
    kind: 'issued',
    title: 'Book issued',
    body: `“${book.title}” is due back on ${fmtDate(loan.dueAt)}.`,
    link: { kind: 'loan', id: loan.id },
  });
  log(d, ctx, 'loan.issued', `Issued “${book.title}” to ${member.name}`, { kind: 'loan', id: loan.id, label: book.title }, {
    copy: copy.barcode, member: member.memberNo, due: loan.dueAt.slice(0, 10),
  });
  return { loan, fulfilled };
}

export interface ReturnResult {
  loan: Loan;
  fine?: Fine;
  heldFor?: Reservation;
  copy: Copy;
}

/**
 * Returns a loan. Fines use the policy in force at the moment of return (settings
 * changes apply to all returns processed afterwards). Due dates already set on
 * existing loans are never rewritten by a settings change.
 */
export function returnLoan(d: LibraryData, loanId: string, ctx: Ctx, opts: { damaged?: boolean; note?: string } = {}): ReturnResult {
  const loan = getLoan(d, loanId);
  if (loan.returnedAt) throw new DomainError('This loan was already returned.', 'already_returned');
  const copy = getCopy(d, loan.copyId);
  const book = getBook(d, loan.bookId);
  const member = getMember(d, loan.memberId);

  loan.returnedAt = ctx.now;
  loan.returnedBy = ctx.actor.name;

  let fine: Fine | undefined;
  const calc = overdueFine(loan.dueAt, ctx.now, d.settings);
  if (calc.amount > 0) {
    fine = {
      id: newId('fn'),
      memberId: member.id,
      loanId: loan.id,
      kind: 'overdue',
      assessed: calc.amount,
      daysOverdue: calc.days,
      description: `“${book.title}” returned ${calc.days} day${calc.days > 1 ? 's' : ''} late (${calc.chargeableDays} chargeable)`,
      createdAt: ctx.now,
      adjustments: [],
      settlements: [],
    };
    d.fines.push(fine);
    loan.fineId = fine.id;
    log(d, ctx, 'fine.assessed', `Overdue fine ${formatMoney(fine.assessed, d.settings.currency)} for ${member.name}`, {
      kind: 'fine', id: fine.id, label: book.title,
    }, { days: calc.days, amount: fine.assessed });
    notify(d, ctx, {
      recipient: member.id,
      kind: 'fine_changed',
      title: 'Overdue fine recorded',
      body: `A fine of ${formatMoney(fine.assessed, d.settings.currency)} was recorded for returning “${book.title}” late.`,
      link: { kind: 'fine', id: fine.id },
    });
  }

  let heldFor: Reservation | undefined;
  copy.updatedAt = ctx.now;
  if (opts.damaged) {
    copy.status = 'damaged';
    copy.condition = 'poor';
    if (opts.note) copy.notes = opts.note;
    log(d, ctx, 'copy.status', `Copy ${copy.barcode} returned damaged`, { kind: 'copy', id: copy.id, label: copy.barcode }, { from: 'borrowed', to: 'damaged' });
  } else {
    heldFor = allocateCopy(d, copy, ctx);
  }

  notify(d, ctx, {
    recipient: member.id,
    kind: 'returned',
    title: 'Return received',
    body: `Thanks — “${book.title}” was checked in on ${fmtDate(ctx.now)}.`,
    link: { kind: 'book', id: book.id },
  });
  log(d, ctx, 'loan.returned', `${member.name} returned “${book.title}”`, { kind: 'loan', id: loan.id, label: book.title }, {
    copy: copy.barcode, late: calc.days, ...(heldFor ? { heldForReservation: heldFor.id } : {}),
  });
  return { loan, fine, heldFor, copy };
}

export function renewalChecks(d: LibraryData, loanId: string, now: string): Check[] {
  const loan = d.loans.find((l) => l.id === loanId);
  if (!loan) return [{ id: 'loan', label: 'Loan exists', ok: false, detail: 'Loan not found' }];
  const member = d.members.find((m) => m.id === loan.memberId);
  const s = d.settings;
  const limit = member ? renewalLimitFor(member, s) : 0;
  const waiting = queueFor(d, loan.bookId).length;
  const overdue = isOverdue(loan, now);
  const owed = member ? memberBalance(d, member.id) : 0;
  return [
    { id: 'active', label: 'Loan is active', ok: !loan.returnedAt, detail: loan.returnedAt ? 'Already returned' : 'Active' },
    { id: 'count', label: 'Renewals remaining', ok: loan.renewals < limit, detail: `${loan.renewals} of ${limit} used` },
    ...(member && isReserveLoanFor(d, member, loan.bookId)
      ? [{ id: 'reserve', label: 'Not a course reserve', ok: false, detail: `Required reading for ${reservesFor(d, loan.bookId).map((c) => c.code).join(', ')} — return it so classmates can borrow it` }]
      : []),
    { id: 'member', label: 'Membership active', ok: member?.status === 'active', detail: member ? `Membership ${member.status}` : 'Unknown member' },
    { id: 'queue', label: 'No one waiting', ok: waiting === 0, detail: waiting === 0 ? 'No reservations' : `${waiting} member${waiting > 1 ? 's' : ''} waiting for this title` },
    {
      id: 'overdue', label: 'Not overdue', ok: !(s.blockRenewalWhenOverdue && overdue),
      detail: overdue ? (s.blockRenewalWhenOverdue ? 'Overdue items must be returned' : 'Overdue (allowed by policy)') : 'On time',
    },
    {
      id: 'fines', label: 'Fines under threshold', ok: !(s.blockBorrowingAbove > 0 && owed > s.blockBorrowingAbove),
      detail: owed ? `${formatMoney(owed, s.currency)} owed` : 'No outstanding fines',
    },
  ];
}

export function renewLoan(d: LibraryData, loanId: string, ctx: Ctx): Loan {
  const failed = renewalChecks(d, loanId, ctx.now).filter((c) => !c.ok);
  if (failed.length) throw new DomainError(`Renewal not allowed: ${failed.map((f) => f.detail).join('; ')}.`, `renew_${failed[0]!.id}`);
  const loan = getLoan(d, loanId);
  const member = getMember(d, loan.memberId);
  const book = getBook(d, loan.bookId);
  // Extend from the later of today and the current due date, so renewing early never shortens a loan.
  const base = toDate(loan.dueAt).getTime() > toDate(ctx.now).getTime() ? loan.dueAt : ctx.now;
  const previous = loan.dueAt;
  loan.dueAt = dueDateFrom(base, loanDaysForBook(d, member, loan.bookId));
  loan.renewals += 1;
  notify(d, ctx, {
    recipient: member.id,
    kind: 'renewal_approved',
    title: 'Renewal approved',
    body: `“${book.title}” is now due on ${fmtDate(loan.dueAt)}.`,
    link: { kind: 'loan', id: loan.id },
  });
  log(d, ctx, 'loan.renewed', `Renewed “${book.title}” for ${member.name}`, { kind: 'loan', id: loan.id, label: book.title }, {
    from: previous.slice(0, 10), to: loan.dueAt.slice(0, 10), renewals: loan.renewals,
  });
  return loan;
}

/** Records a rejected renewal attempt as a notification for the member (separate transaction). */
export function recordRenewalRejection(d: LibraryData, loanId: string, reason: string, ctx: Ctx) {
  const loan = d.loans.find((l) => l.id === loanId);
  if (!loan) return;
  const book = d.books.find((b) => b.id === loan.bookId);
  notify(d, ctx, {
    recipient: loan.memberId,
    kind: 'renewal_rejected',
    title: 'Renewal not approved',
    body: `“${book?.title ?? 'Your loan'}” could not be renewed. ${reason}`,
    link: { kind: 'loan', id: loan.id },
  });
}
