import type { Actor, CopyStatus, FineSettlement, LibraryData, MemberStatus, Settings } from '@/types/models';
import { LibraryStore } from '@/repositories/store';
import { LocalStorageAdapter, type StorageAdapter } from '@/repositories/adapter';
import { DomainError } from '@/lib/errors';
import { nowISO } from '@/lib/dates';
import { buildSeed } from '@/seed/seed';
import type { Ctx } from '@/services/common';
import * as catalog from '@/services/catalog';
import * as inventory from '@/services/inventory';
import * as members from '@/services/members';
import * as circulation from '@/services/circulation';
import * as reservations from '@/services/reservations';
import * as fines from '@/services/fines';
import * as notifications from '@/services/notifications';
import * as settingsSvc from '@/services/settings';
import * as io from '@/services/importExport';
import type { BookInput, CopyInput, MemberInput } from '@/services/validation';
import { SessionStore } from '@/services/session';
import { log } from '@/services/common';
import * as courses from '@/services/courses';
import { selfCheckout } from '@/services/selfCheckout';

/**
 * Application service facade. Screens call these methods; each one runs as a single
 * atomic store transaction with the current demo actor and timestamp.
 */
export function createLibrary(adapter: StorageAdapter, opts: { seed?: () => LibraryData; session?: SessionStore } = {}) {
  const seed = opts.seed ?? (() => buildSeed());
  const store = new LibraryStore(adapter, seed);
  const session = opts.session ?? new SessionStore();

  const actor = (): Actor => {
    const s = session.get();
    return s ? { name: s.name, role: s.role, memberId: s.memberId } : { name: 'System', role: 'admin' };
  };
  const ctx = (): Ctx => ({ actor: actor(), now: nowISO() });
  const tx = <T,>(fn: (d: LibraryData, c: Ctx) => T): T => {
    const c = ctx();
    return store.transact((d) => fn(d, c));
  };

  /** Students and faculty may only act on their own records. */
  const assertSelf = (memberId: string) => {
    const a = actor();
    if ((a.role === 'student' || a.role === 'faculty') && a.memberId !== memberId)
      throw new DomainError('You can only manage your own account.', 'forbidden');
  };
  const assertStaff = () => {
    const a = actor();
    if (a.role !== 'admin' && a.role !== 'librarian') throw new DomainError('Staff access required.', 'forbidden');
  };
  const assertCourseOwner = (courseId: string) => {
    const a = actor();
    if (a.role === 'admin') return;
    if (a.role !== 'faculty' || courses.courseOwnerId(store.getState(), courseId) !== a.memberId)
      throw new DomainError('Only the course’s own faculty member can change it.', 'forbidden');
  };
  const assertAdmin = () => {
    if (actor().role !== 'admin') throw new DomainError('Administrator access required.', 'forbidden');
  };

  return {
    store,
    session,
    actor,
    // Catalog
    createBook: (input: BookInput) => { assertStaff(); return tx((d, c) => catalog.createBook(d, input, c)); },
    updateBook: (id: string, input: BookInput) => { assertStaff(); return tx((d, c) => catalog.updateBook(d, id, input, c)); },
    setBookArchived: (id: string, archived: boolean) => { assertStaff(); return tx((d, c) => catalog.setBookArchived(d, id, archived, c)); },
    toggleSaved: (memberId: string, bookId: string) => { assertSelf(memberId); return tx((d) => catalog.toggleSaved(d, memberId, bookId)); },
    // Inventory
    createCopy: (bookId: string, input: CopyInput) => { assertStaff(); return tx((d, c) => inventory.createCopy(d, bookId, input, c)); },
    updateCopy: (id: string, input: CopyInput) => { assertStaff(); return tx((d, c) => inventory.updateCopy(d, id, input, c)); },
    changeCopyStatus: (id: string, to: CopyStatus, note?: string) => { assertStaff(); return tx((d, c) => inventory.changeCopyStatus(d, id, to, c, note)); },
    // Members
    createMember: (input: MemberInput) => { assertStaff(); return tx((d, c) => members.createMember(d, input, c)); },
    /** Sign-in screen: first scan of a card in an admin-approved series. Needs no session. */
    registerFromCard: (input: members.CardSignupInput) => tx((d, c) => members.registerFromCard(d, input, { ...c, actor: { name: input.name.trim() || 'New member', role: input.type } })),
    updateMember: (id: string, input: MemberInput) => { assertStaff(); return tx((d, c) => members.updateMember(d, id, input, c)); },
    setMemberStatus: (id: string, status: MemberStatus) => { assertStaff(); return tx((d, c) => members.setMemberStatus(d, id, status, c)); },
    // Circulation
    issue: (memberId: string, copyId: string) => { assertStaff(); return tx((d, c) => circulation.issueLoan(d, { memberId, copyId }, c)); },
    returnLoan: (loanId: string, opts?: { damaged?: boolean; note?: string }) => { assertStaff(); return tx((d, c) => circulation.returnLoan(d, loanId, c, opts)); },
    renew: (loanId: string) => {
      const loan = store.getState().loans.find((l) => l.id === loanId);
      if (loan) assertSelf(loan.memberId);
      try {
        return tx((d, c) => circulation.renewLoan(d, loanId, c));
      } catch (e) {
        if (e instanceof DomainError && loan) {
          try { tx((d, c) => circulation.recordRenewalRejection(d, loanId, e.message, c)); } catch { /* best effort */ }
        }
        throw e;
      }
    },
    // Student-only: self-checkout of a scanned copy for the signed-in student.
    selfCheckout: (copyId: string) => {
      const a = actor();
      if (a.role !== 'student' || !a.memberId) throw new DomainError('Self-checkout is available to signed-in students.', 'forbidden');
      return tx((d, c) => selfCheckout(d, a.memberId!, copyId, c));
    },
    // Faculty-only: course reserves (admins may also manage them).
    createCourse: (input: courses.CourseInput) => {
      const a = actor();
      if (a.role !== 'faculty' || !a.memberId) throw new DomainError('Only faculty can create course reserves.', 'forbidden');
      return tx((d, c) => courses.createCourse(d, a.memberId!, input, c));
    },
    updateCourse: (id: string, input: courses.CourseInput) => { assertCourseOwner(id); return tx((d, c) => courses.updateCourse(d, id, input, c)); },
    setCourseBook: (id: string, bookId: string, onReserve: boolean) => { assertCourseOwner(id); return tx((d, c) => courses.setCourseBook(d, id, bookId, onReserve, c)); },
    setCourseStatus: (id: string, status: 'active' | 'archived') => { assertCourseOwner(id); return tx((d, c) => courses.setCourseStatus(d, id, status, c)); },
    // Reservations
    reserve: (memberId: string, bookId: string) => { assertSelf(memberId); return tx((d, c) => reservations.placeReservation(d, { memberId, bookId }, c)); },
    cancelReservation: (id: string) => {
      const r = store.getState().reservations.find((x) => x.id === id);
      if (r) assertSelf(r.memberId);
      return tx((d, c) => reservations.cancelReservation(d, id, c, actor().role === 'student' || actor().role === 'faculty' ? 'Cancelled' : `Cancelled by ${actor().name}.`));
    },
    // Fines
    addFine: (input: Parameters<typeof fines.addManualFine>[1]) => { assertStaff(); return tx((d, c) => fines.addManualFine(d, input, c)); },
    adjustFine: (id: string, amount: number, reason: string) => { assertStaff(); return tx((d, c) => fines.adjustFine(d, id, { amount, reason }, c)); },
    waiveFine: (id: string, reason: string) => { assertStaff(); return tx((d, c) => fines.waiveFine(d, id, reason, c)); },
    settleFine: (id: string, amount: number, method: FineSettlement['method'], reference?: string) => {
      assertStaff();
      return tx((d, c) => fines.settleFine(d, id, { amount, method, reference }, c));
    },
    // Notifications
    markRead: (ids: string[]) => tx((d) => notifications.markRead(d, ids)),
    markAllRead: (recipients: string[]) => tx((d) => notifications.markAllRead(d, recipients)),
    maintenance: () => {
      const now = nowISO();
      if (store.status.state === 'corrupt' || !notifications.maintenanceNeeded(store.getState(), now)) return 0;
      return store.transact((d) => notifications.runMaintenance(d, { actor: { name: 'LIBRAX scheduler', role: 'admin' }, now }));
    },
    // Settings
    updateSettings: (next: Settings) => { assertAdmin(); return tx((d, c) => settingsSvc.updateSettings(d, next, c)); },
    setTheme: (theme: Settings['theme']) => tx((d) => { d.settings.theme = theme; }),
    // Import / export
    importBooks: (rows: io.BookImportRow[]) => { assertStaff(); return tx((d, c) => io.applyBookImport(d, rows, c)); },
    importMembers: (rows: MemberInput[]) => { assertStaff(); return tx((d, c) => io.applyMemberImport(d, rows, c)); },
    restore: (data: LibraryData) => {
      assertAdmin();
      const c = ctx();
      const next = structuredClone(data);
      log(next, c, 'data.restored', 'Restored library data from a backup file', { kind: 'data', id: 'backup', label: 'Backup restore' });
      store.replaceAll(next);
    },
    resetDemo: () => {
      const c = ctx();
      const next = seed();
      log(next, c, 'data.reset', 'Reset demonstration data', { kind: 'data', id: 'reset', label: 'Demo reset' });
      store.replaceAll(next, { seeded: true });
    },
  };
}

export type Library = ReturnType<typeof createLibrary>;

let instance: Library | null = null;
export function getLibrary(): Library {
  if (!instance) {
    instance = createLibrary(new LocalStorageAdapter());
    instance.session.load();
    instance.store.load();
  }
  return instance;
}
