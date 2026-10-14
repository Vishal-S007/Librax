import type { Book, LibraryData } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { normalizeIsbn } from '@/lib/isbn';
import { availabilityOf, getBook, log, type Ctx } from './common';
import type { BookInput } from './validation';

function hueFor(text: string): number {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) >>> 0;
  return h % 360;
}

export function findBookByIsbn(d: LibraryData, isbn: string, exceptId?: string): Book | undefined {
  const n = normalizeIsbn(isbn);
  return d.books.find((b) => normalizeIsbn(b.isbn) === n && b.id !== exceptId);
}

export function createBook(d: LibraryData, input: BookInput, ctx: Ctx): Book {
  const dup = findBookByIsbn(d, input.isbn);
  if (dup) throw new DomainError(`ISBN already used by “${dup.title}”.`, 'duplicate_isbn');
  const book: Book = {
    id: newId('bk'),
    ...input,
    coverHue: hueFor(input.title),
    status: 'active',
    createdAt: ctx.now,
    updatedAt: ctx.now,
  };
  d.books.push(book);
  log(d, ctx, 'book.created', `Added “${book.title}” to the catalog`, { kind: 'book', id: book.id, label: book.title });
  return book;
}

export function updateBook(d: LibraryData, id: string, input: BookInput, ctx: Ctx): Book {
  const book = getBook(d, id);
  const dup = findBookByIsbn(d, input.isbn, id);
  if (dup) throw new DomainError(`ISBN already used by “${dup.title}”.`, 'duplicate_isbn');
  const changed = (Object.keys(input) as (keyof BookInput)[]).filter(
    (k) => JSON.stringify(input[k]) !== JSON.stringify(book[k as keyof Book]),
  );
  Object.assign(book, input, { updatedAt: ctx.now });
  log(d, ctx, 'book.updated', `Edited “${book.title}”`, { kind: 'book', id: book.id, label: book.title }, {
    fields: changed.join(', ') || 'none',
  });
  return book;
}

export function setBookArchived(d: LibraryData, id: string, archived: boolean, ctx: Ctx): Book {
  const book = getBook(d, id);
  if (archived) {
    const a = availabilityOf(d, id);
    if (a.borrowed > 0) throw new DomainError('This title has copies on loan. Return them before archiving.', 'has_loans');
    const pending = d.reservations.some((r) => r.bookId === id && (r.status === 'waiting' || r.status === 'ready'));
    if (pending) throw new DomainError('This title has open reservations. Cancel or fulfil them before archiving.', 'has_reservations');
  }
  book.status = archived ? 'archived' : 'active';
  book.updatedAt = ctx.now;
  log(d, ctx, archived ? 'book.archived' : 'book.restored', `${archived ? 'Archived' : 'Restored'} “${book.title}”`, {
    kind: 'book', id, label: book.title,
  });
  return book;
}

/* ---------------- Search ---------------- */

export interface BookFilters {
  q?: string;
  categories?: string[];
  languages?: string[];
  availableOnly?: boolean;
  yearFrom?: number;
  yearTo?: number;
  status?: 'active' | 'archived' | 'all';
  tag?: string;
}

export type BookSort = 'relevance' | 'title' | 'newest' | 'year_desc' | 'year_asc' | 'popular';

function tokenize(q: string): string[] {
  return q.toLowerCase().split(/\s+/).map((t) => t.replace(/[-]/g, '')).filter(Boolean);
}

/** Scores how well a book matches a query. 0 = no match. Every token must match somewhere. */
export function scoreBook(b: Book, q: string): number {
  const tokens = tokenize(q);
  if (tokens.length === 0) return 1;
  const title = b.title.toLowerCase();
  const subtitle = (b.subtitle ?? '').toLowerCase();
  const authors = b.authors.join(' ').toLowerCase();
  const isbn = b.isbn.toLowerCase();
  const category = b.category.toLowerCase();
  const tags = b.tags.join(' ').toLowerCase();
  const rest = `${b.description} ${b.publisher}`.toLowerCase();
  let score = 0;
  for (const t of tokens) {
    let s = 0;
    if (isbn.includes(t) && t.length >= 4) s = Math.max(s, 12);
    if (title.startsWith(t)) s = Math.max(s, 10);
    else if (title.includes(t)) s = Math.max(s, 8);
    if (authors.includes(t)) s = Math.max(s, 7);
    if (subtitle.includes(t)) s = Math.max(s, 5);
    if (category.includes(t)) s = Math.max(s, 5);
    if (tags.includes(t)) s = Math.max(s, 4);
    if (rest.includes(t)) s = Math.max(s, 2);
    if (s === 0) return 0;
    score += s;
  }
  return score;
}

export function borrowCounts(d: LibraryData): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of d.loans) m.set(l.bookId, (m.get(l.bookId) ?? 0) + 1);
  return m;
}

/** Applies all filters together (AND across filter groups, OR within a multi-select group). */
export function searchBooks(d: LibraryData, f: BookFilters, sort: BookSort = 'relevance'): Book[] {
  const status = f.status ?? 'active';
  const q = (f.q ?? '').trim();
  const scored: { b: Book; s: number }[] = [];
  for (const b of d.books) {
    if (status !== 'all' && b.status !== status) continue;
    if (f.categories?.length && !f.categories.includes(b.category)) continue;
    if (f.languages?.length && !f.languages.includes(b.language)) continue;
    if (f.yearFrom && b.publicationYear < f.yearFrom) continue;
    if (f.yearTo && b.publicationYear > f.yearTo) continue;
    if (f.tag && !b.tags.includes(f.tag)) continue;
    if (f.availableOnly && availabilityOf(d, b.id).available === 0) continue;
    const s = q ? scoreBook(b, q) : 1;
    if (s > 0) scored.push({ b, s });
  }
  const pop = sort === 'popular' ? borrowCounts(d) : undefined;
  const byTitle = (a: Book, b: Book) => a.title.localeCompare(b.title);
  scored.sort((x, y) => {
    switch (sort) {
      case 'title': return byTitle(x.b, y.b);
      case 'newest': return y.b.createdAt.localeCompare(x.b.createdAt) || byTitle(x.b, y.b);
      case 'year_desc': return y.b.publicationYear - x.b.publicationYear || byTitle(x.b, y.b);
      case 'year_asc': return x.b.publicationYear - y.b.publicationYear || byTitle(x.b, y.b);
      case 'popular': return (pop!.get(y.b.id) ?? 0) - (pop!.get(x.b.id) ?? 0) || byTitle(x.b, y.b);
      default: return y.s - x.s || byTitle(x.b, y.b);
    }
  });
  return scored.map((x) => x.b);
}

export function suggestBooks(d: LibraryData, q: string, limit = 6): Book[] {
  if (q.trim().length < 2) return [];
  return searchBooks(d, { q }, 'relevance').slice(0, limit);
}

export function relatedBooks(d: LibraryData, book: Book, limit = 6): Book[] {
  const tags = new Set(book.tags);
  const authors = new Set(book.authors);
  return d.books
    .filter((b) => b.id !== book.id && b.status === 'active')
    .map((b) => ({
      b,
      s: (b.category === book.category ? 3 : 0) + b.tags.filter((t) => tags.has(t)).length * 2 + (b.authors.some((a) => authors.has(a)) ? 4 : 0),
    }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || a.b.title.localeCompare(b.b.title))
    .slice(0, limit)
    .map((x) => x.b);
}

export function categoriesOf(d: LibraryData): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const b of d.books) if (b.status === 'active') m.set(b.category, (m.get(b.category) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

export function authorsOf(d: LibraryData): { name: string; count: number }[] {
  const m = new Map<string, number>();
  for (const b of d.books) for (const a of b.authors) m.set(a, (m.get(a) ?? 0) + 1);
  return [...m.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => a.name.localeCompare(b.name));
}

export function toggleSaved(d: LibraryData, memberId: string, bookId: string): boolean {
  getBook(d, bookId);
  const list = d.saved[memberId] ?? [];
  const has = list.includes(bookId);
  d.saved[memberId] = has ? list.filter((x) => x !== bookId) : [bookId, ...list];
  return !has;
}
