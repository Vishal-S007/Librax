import type { DatabaseEnvelope, LibraryData } from '@/types/models';
import { parseCsvObjects, toCsv } from '@/lib/csv';
import { normalizeIsbn } from '@/lib/isbn';
import { fmtDate } from '@/lib/dates';
import { toDecimalString } from '@/lib/money';
import { parseEnvelope } from '@/repositories/schema';
import { checkIntegrity } from '@/repositories/integrity';
import { bookInputSchema, memberInputSchema, type BookInput, type MemberInput } from './validation';
import { createBook } from './catalog';
import { createCopy } from './inventory';
import { createMember } from './members';
import { availabilityOf, fineBalance, fineStatus, log, type Ctx } from './common';
import { queuePosition } from './reservations';

/* ---------------- Import ---------------- */

export interface RowIssue {
  row: number; // 1-based data row (header excluded), as shown in a spreadsheet: row + 1
  messages: string[];
}

export interface ImportPreview<T> {
  valid: { row: number; value: T }[];
  invalid: RowIssue[];
  duplicates: { row: number; key: string; reason: string }[];
  missingColumns: string[];
  totalRows: number;
}

export const BOOK_CSV_COLUMNS = ['isbn', 'title', 'subtitle', 'authors', 'publisher', 'publication_year', 'category', 'description', 'language', 'edition', 'page_count', 'tags', 'cover_url', 'copies', 'shelf'] as const;
const BOOK_REQUIRED = ['isbn', 'title', 'authors', 'publisher', 'publication_year', 'category', 'language', 'page_count'];

export type BookImportRow = BookInput & { copies: number; shelf: string };

export function previewBookImport(d: LibraryData, csv: string): ImportPreview<BookImportRow> {
  const { headers, records } = parseCsvObjects(csv);
  const missingColumns = BOOK_REQUIRED.filter((c) => !headers.includes(c));
  const out: ImportPreview<BookImportRow> = { valid: [], invalid: [], duplicates: [], missingColumns, totalRows: records.length };
  if (missingColumns.length) return out;
  const existing = new Set(d.books.map((b) => normalizeIsbn(b.isbn)));
  const inFile = new Map<string, number>();
  records.forEach((r, i) => {
    const row = i + 1;
    const parsed = bookInputSchema.safeParse({
      isbn: r.isbn ?? '',
      title: r.title ?? '',
      subtitle: r.subtitle,
      authors: r.authors ?? '',
      publisher: r.publisher ?? '',
      publicationYear: r.publication_year ?? '',
      category: r.category ?? '',
      description: r.description ?? '',
      language: r.language ?? '',
      edition: r.edition,
      pageCount: r.page_count ?? '',
      tags: r.tags ?? '',
      coverUrl: r.cover_url,
    });
    const copiesRaw = (r.copies ?? '').trim();
    const copies = copiesRaw === '' ? 0 : Number(copiesRaw);
    const messages: string[] = [];
    if (!parsed.success) messages.push(...parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`));
    if (!Number.isInteger(copies) || copies < 0 || copies > 50) messages.push('copies: must be a whole number from 0 to 50');
    if (copies > 0 && !(r.shelf ?? '').trim()) messages.push('shelf: required when copies > 0');
    if (messages.length || !parsed.success) {
      out.invalid.push({ row, messages });
      return;
    }
    const key = parsed.data.isbn;
    if (existing.has(key)) {
      out.duplicates.push({ row, key, reason: 'ISBN already in catalog' });
      return;
    }
    if (inFile.has(key)) {
      out.duplicates.push({ row, key, reason: `Same ISBN as row ${inFile.get(key)}` });
      return;
    }
    inFile.set(key, row);
    out.valid.push({ row, value: { ...parsed.data, copies, shelf: (r.shelf ?? '').trim() } });
  });
  return out;
}

export function applyBookImport(d: LibraryData, rows: BookImportRow[], ctx: Ctx): { books: number; copies: number } {
  let copies = 0;
  const silentCtx = ctx;
  for (const r of rows) {
    const { copies: n, shelf, ...input } = r;
    const book = createBook(d, input, silentCtx);
    for (let i = 0; i < n; i++) {
      createCopy(d, book.id, { shelfLocation: shelf, condition: 'new', acquiredAt: ctx.now.slice(0, 10) }, silentCtx);
      copies++;
    }
  }
  log(d, ctx, 'data.imported', `Imported ${rows.length} books and ${copies} copies from CSV`, { kind: 'data', id: 'books', label: 'Book import' }, {
    books: rows.length, copies,
  });
  return { books: rows.length, copies };
}

export const MEMBER_CSV_COLUMNS = ['name', 'email', 'phone', 'type', 'department', 'borrow_limit'] as const;
const MEMBER_REQUIRED = ['name', 'email', 'type', 'department'];

export function previewMemberImport(d: LibraryData, csv: string): ImportPreview<MemberInput> {
  const { headers, records } = parseCsvObjects(csv);
  const missingColumns = MEMBER_REQUIRED.filter((c) => !headers.includes(c));
  const out: ImportPreview<MemberInput> = { valid: [], invalid: [], duplicates: [], missingColumns, totalRows: records.length };
  if (missingColumns.length) return out;
  const existing = new Set(d.members.map((m) => m.email.toLowerCase()));
  const inFile = new Map<string, number>();
  records.forEach((r, i) => {
    const row = i + 1;
    const parsed = memberInputSchema.safeParse({
      name: r.name ?? '',
      email: r.email ?? '',
      phone: r.phone,
      type: (r.type ?? '').toLowerCase(),
      department: r.department ?? '',
      borrowLimit: r.borrow_limit ?? '',
    });
    if (!parsed.success) {
      out.invalid.push({ row, messages: parsed.error.issues.map((x) => `${x.path.join('.') || 'row'}: ${x.message}`) });
      return;
    }
    const key = parsed.data.email;
    if (existing.has(key)) { out.duplicates.push({ row, key, reason: 'Email already registered' }); return; }
    if (inFile.has(key)) { out.duplicates.push({ row, key, reason: `Same email as row ${inFile.get(key)}` }); return; }
    inFile.set(key, row);
    out.valid.push({ row, value: parsed.data });
  });
  return out;
}

export function applyMemberImport(d: LibraryData, rows: MemberInput[], ctx: Ctx): number {
  for (const r of rows) createMember(d, r, ctx);
  log(d, ctx, 'data.imported', `Imported ${rows.length} members from CSV`, { kind: 'data', id: 'members', label: 'Member import' }, { members: rows.length });
  return rows.length;
}

/* ---------------- Export ---------------- */

export function exportBooksCsv(d: LibraryData): string {
  return toCsv(
    [...BOOK_CSV_COLUMNS.filter((c) => c !== 'copies' && c !== 'shelf'), 'status', 'copies_total', 'copies_available'],
    d.books.map((b) => {
      const a = availabilityOf(d, b.id);
      return [b.isbn, b.title, b.subtitle, b.authors.join('; '), b.publisher, b.publicationYear, b.category, b.description, b.language, b.edition, b.pageCount, b.tags.join('; '), b.coverUrl, b.status, a.total, a.available];
    }),
  );
}

export function exportMembersCsv(d: LibraryData): string {
  return toCsv(
    ['member_no', 'name', 'email', 'phone', 'type', 'department', 'status', 'borrow_limit', 'registered'],
    d.members.map((m) => [m.memberNo, m.name, m.email, m.phone, m.type, m.department, m.status, m.borrowLimit, fmtDate(m.registeredAt)]),
  );
}

export function exportInventoryCsv(d: LibraryData): string {
  return toCsv(
    ['barcode', 'isbn', 'title', 'shelf', 'condition', 'status', 'acquired'],
    d.copies.map((c) => {
      const b = d.books.find((x) => x.id === c.bookId);
      return [c.barcode, b?.isbn, b?.title, c.shelfLocation, c.condition, c.status, fmtDate(c.acquiredAt)];
    }),
  );
}

export function exportLoansCsv(d: LibraryData, now: string): string {
  return toCsv(
    ['loan_id', 'title', 'barcode', 'member_no', 'member', 'issued', 'due', 'returned', 'renewals', 'state'],
    d.loans.map((l) => {
      const b = d.books.find((x) => x.id === l.bookId);
      const m = d.members.find((x) => x.id === l.memberId);
      const c = d.copies.find((x) => x.id === l.copyId);
      const state = l.returnedAt ? 'returned' : l.dueAt < now ? 'overdue' : 'active';
      return [l.id, b?.title, c?.barcode, m?.memberNo, m?.name, fmtDate(l.issuedAt), fmtDate(l.dueAt), fmtDate(l.returnedAt), l.renewals, state];
    }),
  );
}

export function exportReservationsCsv(d: LibraryData): string {
  return toCsv(
    ['reservation_id', 'title', 'member_no', 'member', 'placed', 'status', 'queue_position', 'pickup_by', 'closed'],
    d.reservations.map((r) => {
      const b = d.books.find((x) => x.id === r.bookId);
      const m = d.members.find((x) => x.id === r.memberId);
      return [r.id, b?.title, m?.memberNo, m?.name, fmtDate(r.createdAt), r.status, queuePosition(d, r) ?? '', fmtDate(r.pickupBy), fmtDate(r.closedAt)];
    }),
  );
}

export function exportFinesCsv(d: LibraryData): string {
  const cur = d.settings.currency;
  return toCsv(
    ['fine_id', 'member_no', 'member', 'kind', 'description', 'created', `assessed_${cur}`, `adjustments_${cur}`, `settled_${cur}`, `balance_${cur}`, 'status'],
    d.fines.map((f) => {
      const m = d.members.find((x) => x.id === f.memberId);
      const adj = f.adjustments.reduce((a, b) => a + b.amount, 0);
      const paid = f.settlements.reduce((a, b) => a + b.amount, 0);
      return [f.id, m?.memberNo, m?.name, f.kind, f.description, fmtDate(f.createdAt), toDecimalString(f.assessed, cur), toDecimalString(adj, cur), toDecimalString(paid, cur), toDecimalString(fineBalance(f), cur), fineStatus(f)];
    }),
  );
}

/* ---------------- Backup / restore ---------------- */

export interface BackupPreview {
  ok: boolean;
  reason?: string;
  envelope?: DatabaseEnvelope;
  counts?: Record<string, number>;
}

/** Parses a backup file as JSON data only (never evaluated), migrates and validates it. */
export function previewBackup(text: string): BackupPreview {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { ok: false, reason: 'The file is not valid JSON.' };
  }
  const res = parseEnvelope(json);
  if (!res.ok) return { ok: false, reason: res.reason };
  const problems = checkIntegrity(res.envelope.data);
  if (problems.length) return { ok: false, reason: `Integrity check failed: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}` };
  const dd = res.envelope.data;
  return {
    ok: true,
    envelope: res.envelope,
    counts: {
      Books: dd.books.length, Copies: dd.copies.length, Members: dd.members.length, Loans: dd.loans.length,
      Reservations: dd.reservations.length, Fines: dd.fines.length, Notifications: dd.notifications.length, Activity: dd.activity.length,
    },
  };
}
