import { describe, expect, it } from 'vitest';
import { createCourse, reservesFor, setCourseBook, setCourseStatus, updateCourse } from '@/services/courses';
import { issueLoan, renewLoan, renewalChecks } from '@/services/circulation';
import { previewSelfCheckout, selfCheckout } from '@/services/selfCheckout';
import { placeReservation } from '@/services/reservations';
import { parseEnvelope, SCHEMA_VERSION } from '@/repositories/schema';
import { checkIntegrity } from '@/repositories/integrity';
import { createLibrary } from '@/app/library';
import { MemoryAdapter } from '@/repositories/adapter';
import { SessionStore } from '@/services/session';
import { DomainError } from '@/lib/errors';
import { assertConsistent, ctx, NOW, seed, tiny } from './helpers';

const days = (a: string, b: string) => Math.round((new Date(a).getTime() - new Date(b).getTime()) / 86_400_000);

describe('faculty course reserves', () => {
  it('lets faculty create a course and place titles on reserve', () => {
    const d = tiny();
    const c = createCourse(d, 'f1', { code: ' cs 301 ', title: 'Distributed Systems' }, ctx);
    expect(c.code).toBe('CS301');
    setCourseBook(d, c.id, 'b1', true, ctx);
    expect(reservesFor(d, 'b1').map((x) => x.code)).toEqual(['CS301']);
    expect(d.notifications.some((n) => n.recipient === 'staff' && n.title.includes('CS301'))).toBe(true);
    assertConsistent(d);
  });

  it('rejects students, duplicate codes and bad input', () => {
    const d = tiny();
    expect(() => createCourse(d, 's1', { code: 'CS1', title: 'X course' }, ctx)).toThrow(/Only faculty/);
    createCourse(d, 'f1', { code: 'CS301', title: 'Distributed Systems' }, ctx);
    expect(() => createCourse(d, 'f1', { code: 'cs301', title: 'Again' }, ctx)).toThrow(/already exists/);
    expect(() => createCourse(d, 'f1', { code: '!', title: 'Bad' }, ctx)).toThrow(DomainError);
  });

  it('gives students a short loan with no renewals; faculty keep normal terms', () => {
    const d = tiny();
    const c = createCourse(d, 'f1', { code: 'CS301', title: 'Distributed Systems' }, ctx);
    setCourseBook(d, c.id, 'b1', true, ctx);
    const student = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx).loan;
    const faculty = issueLoan(d, { memberId: 'f1', copyId: 'c2' }, ctx).loan;
    expect(days(student.dueAt, NOW)).toBeLessThanOrEqual(d.settings.reserveLoanDays + 1);
    expect(days(faculty.dueAt, NOW)).toBeGreaterThan(20);
    expect(renewalChecks(d, student.id, NOW).find((x) => x.id === 'reserve')?.ok).toBe(false);
    expect(() => renewLoan(d, student.id, ctx)).toThrow(/Required reading for CS301/);
    expect(renewLoan(d, faculty.id, ctx).renewals).toBe(1);
  });

  it('ends the short-loan rule when the course is archived or the title removed', () => {
    const d = tiny();
    const c = createCourse(d, 'f1', { code: 'CS301', title: 'Distributed Systems' }, ctx);
    setCourseBook(d, c.id, 'b1', true, ctx);
    setCourseStatus(d, c.id, 'archived', ctx);
    expect(reservesFor(d, 'b1')).toHaveLength(0);
    setCourseStatus(d, c.id, 'active', ctx);
    setCourseBook(d, c.id, 'b1', false, ctx);
    const loan = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx).loan;
    expect(days(loan.dueAt, NOW)).toBeGreaterThan(10);
    updateCourse(d, c.id, { code: 'CS302', title: 'Renamed' }, ctx);
    expect(d.courses[0]!.code).toBe('CS302');
  });

  it('is protected by role in the app facade', () => {
    const session = new SessionStore();
    const lib = createLibrary(new MemoryAdapter(), { seed: tiny, session });
    lib.store.load();
    session.set({ role: 'student', name: 'S', memberId: 's1', startedAt: NOW });
    expect(() => lib.createCourse({ code: 'X1', title: 'Nope' })).toThrow(/Only faculty/);
    session.set({ role: 'faculty', name: 'F', memberId: 'f1', startedAt: NOW });
    const c = lib.createCourse({ code: 'CS301', title: 'Distributed Systems' });
    lib.setCourseBook(c.id, 'b1', true);
    expect(lib.store.getState().courses[0]!.bookIds).toEqual(['b1']);
  });
});

describe('student self-checkout', () => {
  it('previews a scanned book with the due date and rule checks, then issues it', () => {
    const d = tiny();
    const p = previewSelfCheckout(d, 's1', '978-0-306-40615-7', NOW);
    expect(p.ok).toBe(true);
    if (!p.ok) return;
    expect(p.canBorrow).toBe(true);
    const loan = selfCheckout(d, 's1', p.copy.id, ctx);
    expect(loan.memberId).toBe('s1');
    expect(d.activity[0]!.type).toBe('loan.self_issued');
    expect(d.copies.find((c) => c.id === p.copy.id)!.status).toBe('borrowed');
    assertConsistent(d);
  });

  it('shows the course-reserve short loan in the preview', () => {
    const d = tiny();
    const c = createCourse(d, 'f1', { code: 'CS301', title: 'Distributed Systems' }, ctx);
    setCourseBook(d, c.id, 'b1', true, ctx);
    const p = previewSelfCheckout(d, 's1', 'LBX-000001', NOW);
    expect(p.ok && p.reserveCodes).toEqual(['CS301']);
  });

  it('explains unknown codes, unavailable books and blocked members', () => {
    const d = tiny();
    expect(previewSelfCheckout(d, 's1', 'hello', NOW)).toMatchObject({ ok: false });
    expect(previewSelfCheckout(d, 's1', '9780596520687', NOW)).toMatchObject({ ok: false });
    issueLoan(d, { memberId: 's2', copyId: 'c1' }, ctx);
    issueLoan(d, { memberId: 's3', copyId: 'c2' }, ctx);
    const none = previewSelfCheckout(d, 's1', '9780306406157', NOW);
    expect(!none.ok && none.reason).toMatch(/No copy/);
    const d2 = tiny();
    d2.settings.maxBorrowStudent = 1;
    issueLoan(d2, { memberId: 's1', copyId: 'c1' }, ctx);
    const p = previewSelfCheckout(d2, 's1', 'LBX-000002', NOW);
    expect(p.ok && p.canBorrow).toBe(false);
  });

  it('uses a copy held for the student', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's2', copyId: 'c1' }, ctx);
    const r = placeReservation(d, { memberId: 's1', bookId: 'b1' }, ctx);
    const p = previewSelfCheckout(d, 's1', '9780306406157', NOW);
    expect(p.ok && p.copy.id).toBe(r.copyId);
    if (p.ok) selfCheckout(d, 's1', p.copy.id, ctx);
    expect(d.reservations[0]!.status).toBe('fulfilled');
    assertConsistent(d);
  });

  it('is only available to signed-in students', () => {
    const session = new SessionStore();
    const lib = createLibrary(new MemoryAdapter(), { seed: tiny, session });
    lib.store.load();
    session.set({ role: 'faculty', name: 'F', memberId: 'f1', startedAt: NOW });
    expect(() => lib.selfCheckout('c1')).toThrow(/students/);
    session.set({ role: 'student', name: 'S', memberId: 's1', startedAt: NOW });
    expect(lib.selfCheckout('c1').memberId).toBe('s1');
  });
});

describe('schema migration v1 → v2', () => {
  it('upgrades data saved before course reserves existed', () => {
    const current = seed();
    const { courses: _drop, ...rest } = current;
    void _drop;
    const { reserveLoanDays: _r, ...oldSettings } = current.settings;
    void _r;
    const v1 = { app: 'librax', schemaVersion: 1, updatedAt: NOW, data: { ...rest, settings: oldSettings } };
    const res = parseEnvelope(JSON.parse(JSON.stringify(v1)));
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(SCHEMA_VERSION).toBe(3);
    expect(res.migratedFrom).toBe(1);
    expect(res.envelope.data.courses).toEqual([]);
    expect(res.envelope.data.settings.reserveLoanDays).toBe(3);
    expect(checkIntegrity(res.envelope.data)).toEqual([]);
  });

  it('seeds two faculty courses', () => {
    const d = seed();
    expect(d.courses.map((c) => c.code)).toEqual(['CS301', 'HIS210']);
    expect(checkIntegrity(d)).toEqual([]);
  });
});
