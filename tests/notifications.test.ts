import { describe, expect, it } from 'vitest';
import { issueLoan, renewLoan } from '@/services/circulation';
import { maintenanceNeeded, markAllRead, markRead, runMaintenance } from '@/services/notifications';
import { ctx, ctxAt, daysFrom, NOW, tiny } from './helpers';

describe('notifications', () => {
  it('generates overdue reminders once, however often maintenance runs', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -20)));
    expect(maintenanceNeeded(d, NOW)).toBe(true);
    const first = runMaintenance(d, ctx);
    expect(first).toBe(2); // member + staff
    expect(runMaintenance(d, ctx)).toBe(0);
    expect(runMaintenance(d, ctx)).toBe(0);
    expect(maintenanceNeeded(d, NOW)).toBe(false);
    expect(d.notifications.filter((n) => n.kind === 'overdue')).toHaveLength(2);
  });

  it('creates a fresh due-soon reminder after a renewal moves the due date', () => {
    const d = tiny();
    d.settings.renewalLimit = 3;
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -13)));
    runMaintenance(d, ctx);
    expect(d.notifications.filter((n) => n.kind === 'due_soon')).toHaveLength(1);
    renewLoan(d, loan.id, ctx);
    runMaintenance(d, ctxAt(daysFrom(d.loans[0]!.dueAt, -1)));
    expect(d.notifications.filter((n) => n.kind === 'due_soon')).toHaveLength(2);
  });

  it('marks single and all notifications read for a recipient', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    issueLoan(d, { memberId: 's2', copyId: 'c2' }, ctx);
    const mine = d.notifications.filter((n) => n.recipient === 's1');
    markRead(d, [mine[0]!.id]);
    expect(d.notifications.find((n) => n.id === mine[0]!.id)!.read).toBe(true);
    markAllRead(d, ['s2']);
    expect(d.notifications.filter((n) => n.recipient === 's2').every((n) => n.read)).toBe(true);
  });
});
