import type { LibraryData } from '@/types/models';
import { daysUntil, fmtDate } from '@/lib/dates';
import { activeLoans, isOverdue, notify, type Ctx } from './common';
import { expireReservations } from './reservations';

export function inboxFilter(recipients: string[]) {
  return (n: { recipient: string }) => recipients.includes(n.recipient);
}

export function markRead(d: LibraryData, ids: string[]) {
  const set = new Set(ids);
  for (const n of d.notifications) if (set.has(n.id)) n.read = true;
}

export function markAllRead(d: LibraryData, recipients: string[]) {
  for (const n of d.notifications) if (recipients.includes(n.recipient)) n.read = true;
}

/** Cheap pure check so the app only writes when maintenance has something to do. */
export function maintenanceNeeded(d: LibraryData, now: string): boolean {
  const t = new Date(now).getTime();
  if (d.reservations.some((r) => r.status === 'ready' && r.pickupBy && new Date(r.pickupBy).getTime() < t)) return true;
  const keys = new Set(d.notifications.map((n) => n.dedupeKey).filter(Boolean));
  for (const l of activeLoans(d)) {
    if (isOverdue(l, now)) {
      if (!keys.has(`overdue:${l.id}:${l.dueAt}`) || !keys.has(`staff-overdue:${l.id}:${l.dueAt}`)) return true;
    } else if (daysUntil(l.dueAt, now) <= d.settings.dueSoonDays && !keys.has(`due:${l.id}:${l.dueAt}`)) return true;
  }
  return false;
}

/**
 * Generates due-soon and overdue reminders and expires stale holds. Reminders are keyed
 * by loan + due date, so re-running (or re-rendering) never duplicates them, while a renewal
 * (new due date) correctly produces a fresh reminder.
 */
export function runMaintenance(d: LibraryData, ctx: Ctx): number {
  let changes = expireReservations(d, ctx);
  for (const l of activeLoans(d)) {
    const book = d.books.find((b) => b.id === l.bookId);
    const member = d.members.find((m) => m.id === l.memberId);
    const title = book?.title ?? 'A book';
    if (isOverdue(l, ctx.now)) {
      if (notify(d, ctx, {
        recipient: l.memberId, kind: 'overdue', title: 'Overdue item',
        body: `“${title}” was due on ${fmtDate(l.dueAt)}. Please return it to stop fines accruing.`,
        link: { kind: 'loan', id: l.id }, dedupeKey: `overdue:${l.id}:${l.dueAt}`,
      })) changes++;
      if (notify(d, ctx, {
        recipient: 'staff', kind: 'overdue', title: 'Loan became overdue',
        body: `${member?.name ?? 'A member'} — “${title}” (due ${fmtDate(l.dueAt)}).`,
        link: { kind: 'member', id: l.memberId }, dedupeKey: `staff-overdue:${l.id}:${l.dueAt}`,
      })) changes++;
    } else if (daysUntil(l.dueAt, ctx.now) <= d.settings.dueSoonDays) {
      const days = daysUntil(l.dueAt, ctx.now);
      if (notify(d, ctx, {
        recipient: l.memberId, kind: 'due_soon', title: 'Due soon',
        body: `“${title}” is due ${days <= 0 ? 'today' : days === 1 ? 'tomorrow' : `in ${days} days`} (${fmtDate(l.dueAt)}).`,
        link: { kind: 'loan', id: l.id }, dedupeKey: `due:${l.id}:${l.dueAt}`,
      })) changes++;
    }
  }
  return changes;
}
