import { describe, expect, it } from 'vitest';
import { createLibrary } from '@/app/library';
import { MemoryAdapter } from '@/repositories/adapter';
import { SessionStore } from '@/services/session';
import { NAV } from '@/routes/nav';
import { DEFAULT_SETTINGS } from '@/repositories/schema';
import { tiny } from './helpers';

function lib(role: 'admin' | 'librarian' | 'student' | 'faculty', memberId?: string) {
  const session = new SessionStore();
  const l = createLibrary(new MemoryAdapter(), { seed: tiny, session });
  l.store.load();
  session.set({ role, name: 'Tester', memberId, startedAt: new Date().toISOString() });
  return l;
}

describe('role permissions (interface-level, demo only)', () => {
  it('lets staff run circulation but not patrons', () => {
    expect(lib('librarian').issue('s1', 'c1').loan.memberId).toBe('s1');
    expect(() => lib('student', 's1').issue('s1', 'c1')).toThrow(/Staff access/);
  });

  it('lets patrons act only on their own records', () => {
    const l = lib('student', 's1');
    expect(l.toggleSaved('s1', 'b1')).toBe(true);
    expect(() => l.toggleSaved('s2', 'b1')).toThrow(/your own/);
    expect(l.reserve('s1', 'b1').status).toBe('ready');
    expect(() => l.reserve('s2', 'b1')).toThrow(/your own/);
  });

  it('restricts policy changes to administrators and validates them', () => {
    expect(() => lib('librarian').updateSettings(DEFAULT_SETTINGS)).toThrow(/Administrator/);
    const admin = lib('admin');
    expect(() => admin.updateSettings({ ...DEFAULT_SETTINGS, loanDays: 0 })).toThrow(/At least 1 day/);
    admin.updateSettings({ ...DEFAULT_SETTINGS, loanDays: 21 });
    expect(admin.store.getState().settings.loanDays).toBe(21);
    expect(admin.store.getState().activity[0]!.type).toBe('settings.updated');
  });

  it('records a rejected renewal as a notification for the member', () => {
    const staff = lib('librarian');
    staff.store.transact((d) => { d.settings.renewalLimit = 0; });
    const { loan } = staff.issue('s1', 'c1');
    expect(() => staff.renew(loan.id)).toThrow(/Renewal not allowed/);
    expect(staff.store.getState().notifications.some((n) => n.kind === 'renewal_rejected' && n.recipient === 's1')).toBe(true);
  });
});

describe('role navigation', () => {
  it('gives each role its own menu with no duplicates', () => {
    expect(NAV.admin.map((n) => n.path)).toContain('settings');
    expect(NAV.librarian.map((n) => n.path)).not.toContain('settings');
    expect(NAV.student.map((n) => n.path)).toContain('discover');
    expect(NAV.student.map((n) => n.path)).not.toContain('members');
    for (const items of Object.values(NAV)) expect(new Set(items.map((i) => i.path)).size).toBe(items.length);
  });
});
