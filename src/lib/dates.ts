import { addDays, differenceInCalendarDays, format, formatDistanceToNowStrict, isValid, parseISO, startOfDay } from 'date-fns';

export const nowISO = () => new Date().toISOString();

export function toDate(iso: string): Date {
  const d = parseISO(iso);
  return isValid(d) ? d : new Date(NaN);
}

export function addDaysISO(iso: string, days: number): string {
  return addDays(toDate(iso), days).toISOString();
}

/** End of the local day `days` from `from` — due dates fall at 23:59 so a book due "today" is not yet overdue. */
export function dueDateFrom(fromISO: string, days: number): string {
  const d = startOfDay(addDays(toDate(fromISO), days));
  d.setHours(23, 59, 0, 0);
  return d.toISOString();
}

/** Whole calendar days `later` is after `earlier` (0 if not after). */
export function daysLate(dueISO: string, atISO: string): number {
  const due = toDate(dueISO);
  const at = toDate(atISO);
  if (at.getTime() <= due.getTime()) return 0;
  return Math.max(0, differenceInCalendarDays(at, due));
}

export function daysUntil(iso: string, fromISO = nowISO()): number {
  return differenceInCalendarDays(toDate(iso), toDate(fromISO));
}

export const fmtDate = (iso?: string) => (iso && isValid(toDate(iso)) ? format(toDate(iso), 'd MMM yyyy') : '—');
export const fmtDateTime = (iso?: string) => (iso && isValid(toDate(iso)) ? format(toDate(iso), 'd MMM yyyy, HH:mm') : '—');
export const fmtShort = (iso?: string) => (iso && isValid(toDate(iso)) ? format(toDate(iso), 'd MMM') : '—');
export const fmtRelative = (iso?: string) =>
  iso && isValid(toDate(iso)) ? formatDistanceToNowStrict(toDate(iso), { addSuffix: true }) : '—';

export const toInputDate = (iso?: string) => (iso && isValid(toDate(iso)) ? format(toDate(iso), 'yyyy-MM-dd') : '');
export function fromInputDate(v: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  const d = parseISO(v);
  return isValid(d) ? d.toISOString() : null;
}
