import { eachDayOfInterval, eachMonthOfInterval, format, startOfDay, startOfMonth, subMonths } from 'date-fns';
import type { CopyStatus, LibraryData } from '@/types/models';
import { activeLoans, fineBalance, fineStatus, isOverdue, overdueFine } from './common';
import { sumMinor } from '@/lib/money';
import { toDate } from '@/lib/dates';

export interface Range {
  from: string;
  to: string;
}

const inRange = (iso: string | undefined, r: Range) => !!iso && iso >= r.from && iso <= r.to;

export function dashboardMetrics(d: LibraryData, now: string) {
  const activeBooks = d.books.filter((b) => b.status === 'active');
  const copies = d.copies.filter((c) => c.status !== 'withdrawn');
  const loans = activeLoans(d);
  return {
    titles: activeBooks.length,
    copies: copies.length,
    available: copies.filter((c) => c.status === 'available').length,
    borrowed: copies.filter((c) => c.status === 'borrowed').length,
    activeMembers: d.members.filter((m) => m.status === 'active').length,
    overdue: loans.filter((l) => isOverdue(l, now)).length,
    activeReservations: d.reservations.filter((r) => r.status === 'waiting' || r.status === 'ready').length,
    outstandingFines: sumMinor(d.fines.map(fineBalance)),
    accruing: sumMinor(loans.filter((l) => isOverdue(l, now)).map((l) => overdueFine(l.dueAt, now, d.settings).amount)),
  };
}

/** Issues and returns per bucket. Uses days for ranges ≤ 62 days, months otherwise. */
export function circulationTrend(d: LibraryData, r: Range) {
  const from = toDate(r.from);
  const to = toDate(r.to);
  const days = (to.getTime() - from.getTime()) / 86_400_000;
  const daily = days <= 62;
  const buckets = daily
    ? eachDayOfInterval({ start: startOfDay(from), end: to }).map((dt) => ({ key: format(dt, 'yyyy-MM-dd'), label: format(dt, 'd MMM') }))
    : eachMonthOfInterval({ start: startOfMonth(from), end: to }).map((dt) => ({ key: format(dt, 'yyyy-MM'), label: format(dt, 'MMM yy') }));
  const keyOf = (iso: string) => format(toDate(iso), daily ? 'yyyy-MM-dd' : 'yyyy-MM');
  const map = new Map(buckets.map((b) => [b.key, { label: b.label, issued: 0, returned: 0 }]));
  for (const l of d.loans) {
    if (inRange(l.issuedAt, r)) { const b = map.get(keyOf(l.issuedAt)); if (b) b.issued++; }
    if (l.returnedAt && inRange(l.returnedAt, r)) { const b = map.get(keyOf(l.returnedAt)); if (b) b.returned++; }
  }
  return [...map.values()];
}

export function topBooks(d: LibraryData, r: Range, limit = 8) {
  const m = new Map<string, number>();
  for (const l of d.loans) if (inRange(l.issuedAt, r)) m.set(l.bookId, (m.get(l.bookId) ?? 0) + 1);
  return [...m.entries()]
    .map(([bookId, loans]) => ({ book: d.books.find((b) => b.id === bookId)!, loans }))
    .filter((x) => x.book)
    .sort((a, b) => b.loans - a.loans || a.book.title.localeCompare(b.book.title))
    .slice(0, limit);
}

export function categoryPopularity(d: LibraryData, r: Range) {
  const byBook = new Map(d.books.map((b) => [b.id, b.category]));
  const m = new Map<string, number>();
  for (const l of d.loans) {
    if (!inRange(l.issuedAt, r)) continue;
    const c = byBook.get(l.bookId);
    if (c) m.set(c, (m.get(c) ?? 0) + 1);
  }
  return [...m.entries()].map(([category, loans]) => ({ category, loans })).sort((a, b) => b.loans - a.loans);
}

export function inventoryDistribution(d: LibraryData) {
  const order: CopyStatus[] = ['available', 'borrowed', 'on_hold', 'maintenance', 'damaged', 'lost', 'withdrawn'];
  const m = new Map<CopyStatus, number>(order.map((s) => [s, 0]));
  for (const c of d.copies) m.set(c.status, (m.get(c.status) ?? 0) + 1);
  return order.map((status) => ({ status, count: m.get(status) ?? 0 }));
}

export function memberActivity(d: LibraryData, r: Range, limit = 10) {
  const m = new Map<string, { loans: number; late: number }>();
  for (const l of d.loans) {
    if (!inRange(l.issuedAt, r)) continue;
    const e = m.get(l.memberId) ?? { loans: 0, late: 0 };
    e.loans++;
    const end = l.returnedAt ?? r.to;
    if (end > l.dueAt) e.late++;
    m.set(l.memberId, e);
  }
  return [...m.entries()]
    .map(([memberId, v]) => ({ member: d.members.find((x) => x.id === memberId)!, ...v }))
    .filter((x) => x.member)
    .sort((a, b) => b.loans - a.loans || a.member.name.localeCompare(b.member.name))
    .slice(0, limit);
}

export function membershipMix(d: LibraryData) {
  const types = ['student', 'faculty', 'staff'] as const;
  return types.map((t) => ({ type: t, active: d.members.filter((m) => m.type === t && m.status === 'active').length, total: d.members.filter((m) => m.type === t).length }));
}

export function reservationStats(d: LibraryData, r: Range) {
  const within = d.reservations.filter((x) => inRange(x.createdAt, r));
  const by = (s: string) => within.filter((x) => x.status === s).length;
  return {
    created: within.length,
    waiting: by('waiting'),
    ready: by('ready'),
    fulfilled: by('fulfilled'),
    cancelled: by('cancelled'),
    expired: by('expired'),
  };
}

export function fineSummary(d: LibraryData, r: Range) {
  const assessed = sumMinor(d.fines.filter((f) => inRange(f.createdAt, r)).map((f) => f.assessed));
  const collected = sumMinor(d.fines.flatMap((f) => f.settlements).filter((s) => inRange(s.at, r)).map((s) => s.amount));
  const adjusted = sumMinor(d.fines.flatMap((f) => f.adjustments).filter((a) => inRange(a.at, r)).map((a) => a.amount));
  const outstanding = sumMinor(d.fines.map(fineBalance));
  const counts = { outstanding: 0, settled: 0, waived: 0 };
  for (const f of d.fines) counts[fineStatus(f)]++;
  return { assessed, collected, adjusted, outstanding, counts };
}

export function fineMonthly(d: LibraryData, months = 6, now = new Date().toISOString()) {
  const end = toDate(now);
  const start = startOfMonth(subMonths(end, months - 1));
  const buckets = eachMonthOfInterval({ start, end }).map((dt) => ({ key: format(dt, 'yyyy-MM'), label: format(dt, 'MMM'), assessed: 0, collected: 0 }));
  const idx = new Map(buckets.map((b, i) => [b.key, i]));
  for (const f of d.fines) {
    const i = idx.get(format(toDate(f.createdAt), 'yyyy-MM'));
    if (i !== undefined) buckets[i]!.assessed += f.assessed;
    for (const s of f.settlements) {
      const j = idx.get(format(toDate(s.at), 'yyyy-MM'));
      if (j !== undefined) buckets[j]!.collected += s.amount;
    }
  }
  return buckets;
}

export function overdueList(d: LibraryData, now: string) {
  return activeLoans(d)
    .filter((l) => isOverdue(l, now))
    .map((l) => ({
      loan: l,
      book: d.books.find((b) => b.id === l.bookId),
      member: d.members.find((m) => m.id === l.memberId),
      copy: d.copies.find((c) => c.id === l.copyId),
      ...overdueFine(l.dueAt, now, d.settings),
    }))
    .sort((a, b) => b.days - a.days);
}
