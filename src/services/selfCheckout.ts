import type { Book, Copy, LibraryData, Loan } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { availabilityOf, getMember, type Ctx } from './common';
import { dueDateFor, issueChecks, issueLoan, type Check } from './circulation';
import { reservesFor } from './courses';
import { resolveScan } from './scan';

export type SelfCheckoutPreview =
  | { ok: true; book: Book; copy: Copy; checks: Check[]; canBorrow: boolean; dueAt: string; reserveCodes: string[] }
  | { ok: false; reason: string; book?: Book };

/**
 * What happens if this student borrows the scanned item. Accepts the ISBN on the book
 * or the LIBRAX copy label; a copy held for this student is used first.
 */
export function previewSelfCheckout(d: LibraryData, memberId: string, code: string, now: string): SelfCheckoutPreview {
  const r = resolveScan(d, code, memberId);
  if (r.kind === 'none') return { ok: false, reason: `“${code.trim()}” isn’t a book barcode. Scan the ISBN on the back cover or the LIBRAX label inside.` };
  if (r.kind === 'unknown-isbn') return { ok: false, reason: 'This book isn’t in the library’s catalog, so it can’t be borrowed here.' };
  const book = r.book;
  const copy = r.kind === 'copy' ? r.copy : r.copy;
  if (!copy) {
    const a = availabilityOf(d, book.id);
    return { ok: false, book, reason: `No copy of “${book.title}” is free right now (${a.borrowed} on loan, ${a.onHold} on hold). You can reserve it from its page.` };
  }
  const member = getMember(d, memberId);
  const checks = issueChecks(d, memberId, copy.id, now);
  return {
    ok: true, book, copy, checks,
    canBorrow: checks.every((c) => c.ok),
    dueAt: dueDateFor(member, d, now, book.id),
    reserveCodes: member.type === 'student' ? reservesFor(d, book.id).map((c) => c.code) : [],
  };
}

/** Issues the scanned copy to the signed-in student. All normal borrowing rules apply. */
export function selfCheckout(d: LibraryData, memberId: string, copyId: string, ctx: Ctx): Loan {
  const member = getMember(d, memberId);
  if (member.type !== 'student') throw new DomainError('Self-checkout is available to students.', 'forbidden');
  const { loan } = issueLoan(d, { memberId, copyId }, ctx);
  const entry = d.activity[0];
  if (entry?.type === 'loan.issued') {
    entry.type = 'loan.self_issued';
    entry.summary = `${member.name} borrowed “${d.books.find((b) => b.id === loan.bookId)?.title}” at self-checkout`;
  }
  return loan;
}
