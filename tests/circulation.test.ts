import { describe, expect, it } from 'vitest';
import { issueChecks, issueLoan, renewalChecks, renewLoan, returnLoan } from '@/services/circulation';
import { availabilityOf } from '@/services/common';
import { changeCopyStatus, canTransition, createCopy } from '@/services/inventory';
import { createMember, setMemberStatus, updateMember } from '@/services/members';
import { memberInputSchema } from '@/services/validation';
import { placeReservation } from '@/services/reservations';
import { DomainError } from '@/lib/errors';
import { assertConsistent, ctx, ctxAt, daysFrom, NOW, tiny } from './helpers';

describe('inventory', () => {
  it('tracks copies independently and derives availability from them', () => {
    const d = tiny();
    expect(availabilityOf(d, 'b1')).toMatchObject({ total: 2, available: 2 });
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    expect(availabilityOf(d, 'b1')).toMatchObject({ total: 2, available: 1, borrowed: 1 });
    changeCopyStatus(d, 'c2', 'maintenance', ctx);
    expect(availabilityOf(d, 'b1')).toMatchObject({ available: 0, unavailable: 1 });
  });

  it('allows only permitted status transitions', () => {
    expect(canTransition('available', 'withdrawn')).toBe(true);
    expect(canTransition('borrowed', 'available')).toBe(false);
    expect(canTransition('withdrawn', 'available')).toBe(false);
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    expect(() => changeCopyStatus(d, 'c1', 'lost', ctx)).toThrow(DomainError);
  });

  it('auto-assigns unique barcodes and rejects duplicates', () => {
    const d = tiny();
    const c = createCopy(d, 'b1', { shelfLocation: 'X', condition: 'new', acquiredAt: '2026-01-02' }, ctx);
    expect(c.barcode).toBe('LBX-000003');
    expect(() => createCopy(d, 'b1', { barcode: 'lbx-000001', shelfLocation: 'X', condition: 'new', acquiredAt: '2026-01-02' }, ctx)).toThrow(/already assigned/);
  });

  it('never issues damaged or withdrawn copies', () => {
    const d = tiny();
    changeCopyStatus(d, 'c1', 'damaged', ctx);
    expect(() => issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx)).toThrow(/Cannot issue/);
    changeCopyStatus(d, 'c2', 'withdrawn', ctx);
    expect(() => issueLoan(d, { memberId: 's1', copyId: 'c2' }, ctx)).toThrow(/Cannot issue/);
  });
});

describe('members', () => {
  const valid = { name: 'New Person', email: 'New@Example.edu', type: 'student', department: 'Maths', borrowLimit: '' };
  it('registers with a sequential member number and normalised email', () => {
    const d = tiny();
    const m = createMember(d, memberInputSchema.parse(valid), ctx);
    expect(m.email).toBe('new@example.edu');
    expect(m.memberNo).toBe('STU-0001');
    expect(() => createMember(d, memberInputSchema.parse(valid), ctx)).toThrow(/already registered/);
    updateMember(d, m.id, memberInputSchema.parse({ ...valid, name: 'Renamed Person' }), ctx);
    expect(d.members.find((x) => x.id === m.id)!.name).toBe('Renamed Person');
  });

  it('validates email and required fields', () => {
    const r = memberInputSchema.safeParse({ name: '', email: 'nope', type: 'x', department: '' });
    expect(r.success).toBe(false);
  });

  it('blocks inactive members from borrowing and keeps their history', () => {
    const d = tiny();
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    setMemberStatus(d, 's1', 'inactive', ctx);
    expect(() => issueLoan(d, { memberId: 's1', copyId: 'c2' }, ctx)).toThrow(/inactive/);
    expect(d.loans.find((l) => l.id === loan.id)).toBeTruthy();
    returnLoan(d, loan.id, ctx);
    assertConsistent(d);
  });
});

describe('issue', () => {
  it('creates a loan, updates the copy, logs and notifies', () => {
    const d = tiny();
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    expect(d.copies[0]!.status).toBe('borrowed');
    expect(loan.dueAt > NOW).toBe(true);
    expect(d.activity[0]!.type).toBe('loan.issued');
    expect(d.notifications.some((n) => n.recipient === 's1' && n.kind === 'issued')).toBe(true);
    assertConsistent(d);
  });

  it('uses the faculty loan period for faculty', () => {
    const d = tiny();
    const s = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx).loan;
    const f = issueLoan(d, { memberId: 'f1', copyId: 'c2' }, ctx).loan;
    expect(new Date(f.dueAt).getTime() - new Date(s.dueAt).getTime()).toBeGreaterThan(10 * 86_400_000);
  });

  it('enforces the borrowing limit', () => {
    const d = tiny();
    d.settings.maxBorrowStudent = 1;
    createCopy(d, 'b1', { shelfLocation: 'X', condition: 'new', acquiredAt: '2026-01-02' }, ctx);
    d.books.push({ ...d.books[0]!, id: 'b2', isbn: '9780596520687', title: 'Second' });
    d.copies.push({ ...d.copies[0]!, id: 'c9', bookId: 'b2', barcode: 'LBX-000009' });
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    const checks = issueChecks(d, 's1', 'c9', NOW);
    expect(checks.find((c) => c.id === 'limit')!.ok).toBe(false);
    expect(() => issueLoan(d, { memberId: 's1', copyId: 'c9' }, ctx)).toThrow(/1 of 1/);
  });

  it('blocks members with overdue items', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -30)));
    expect(() => issueLoan(d, { memberId: 's1', copyId: 'c2' }, ctx)).toThrow(/overdue/);
  });

  it('respects the reservation queue for shelf copies', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    issueLoan(d, { memberId: 's2', copyId: 'c2' }, ctx);
    placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    // A new copy goes straight on hold for s3, so it cannot be issued to f1.
    const c = createCopy(d, 'b1', { shelfLocation: 'X', condition: 'new', acquiredAt: '2026-01-02' }, ctx);
    expect(c.status).toBe('on_hold');
    expect(() => issueLoan(d, { memberId: 'f1', copyId: c.id }, ctx)).toThrow(/On hold/);
    const { fulfilled } = issueLoan(d, { memberId: 's3', copyId: c.id }, ctx);
    expect(fulfilled?.status).toBe('fulfilled');
    assertConsistent(d);
  });
});

describe('return', () => {
  it('returns on time without a fine and puts the copy back', () => {
    const d = tiny();
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    const r = returnLoan(d, loan.id, ctxAt(daysFrom(NOW, 3)));
    expect(r.fine).toBeUndefined();
    expect(d.copies[0]!.status).toBe('available');
    expect(() => returnLoan(d, loan.id, ctx)).toThrow(/already returned/);
    assertConsistent(d);
  });

  it('records an overdue fine using integer minor units, grace and cap', () => {
    const d = tiny();
    d.settings.fineRatePerDay = 250; d.settings.fineGraceDays = 2; d.settings.maxFinePerLoan = 1000;
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    const r = returnLoan(d, loan.id, ctxAt(daysFrom(loan.dueAt, 3)));
    expect(r.fine?.daysOverdue).toBe(3);
    expect(r.fine?.assessed).toBe(250);
    const { loan: l2 } = issueLoan(d, { memberId: 's2', copyId: 'c2' }, ctx);
    const r2 = returnLoan(d, l2.id, ctxAt(daysFrom(l2.dueAt, 40)));
    expect(r2.fine?.assessed).toBe(1000);
    expect(Number.isInteger(r2.fine!.assessed)).toBe(true);
  });

  it('marks damaged returns out of circulation', () => {
    const d = tiny();
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    returnLoan(d, loan.id, ctx, { damaged: true, note: 'Cover torn' });
    expect(d.copies[0]!.status).toBe('damaged');
    assertConsistent(d);
  });
});

describe('renewal', () => {
  it('extends from the current due date and counts renewals up to the limit', () => {
    const d = tiny();
    d.settings.renewalLimit = 1;
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    const due = loan.dueAt;
    renewLoan(d, loan.id, ctx);
    expect(d.loans[0]!.dueAt > due).toBe(true);
    expect(d.loans[0]!.renewals).toBe(1);
    expect(() => renewLoan(d, loan.id, ctx)).toThrow(/1 of 1 used/);
  });

  it('refuses when someone is waiting or when overdue', () => {
    const d = tiny();
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    issueLoan(d, { memberId: 's2', copyId: 'c2' }, ctx);
    placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    expect(renewalChecks(d, loan.id, NOW).find((c) => c.id === 'queue')!.ok).toBe(false);
    const d2 = tiny();
    const { loan: l2 } = issueLoan(d2, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -30)));
    expect(() => renewLoan(d2, l2.id, ctx)).toThrow(/Overdue/);
    d2.settings.blockRenewalWhenOverdue = false;
    expect(renewLoan(d2, l2.id, ctx).renewals).toBe(1);
  });
});
