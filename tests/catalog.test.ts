import { describe, expect, it } from 'vitest';
import { createBook, searchBooks, setBookArchived, updateBook, toggleSaved, relatedBooks } from '@/services/catalog';
import { bookInputSchema } from '@/services/validation';
import { availabilityOf } from '@/services/common';
import { issueLoan } from '@/services/circulation';
import { DomainError } from '@/lib/errors';
import { assertConsistent, ctx, seed, tiny } from './helpers';

const input = (over: Record<string, unknown> = {}) => bookInputSchema.parse({
  isbn: '978-0-596-52068-7', title: 'New Book', authors: 'Ann One; Ben Two', publisher: 'Pub', publicationYear: 2021,
  category: 'Testing', language: 'English', pageCount: 120, tags: 'x, y', ...over,
});

describe('book CRUD', () => {
  it('adds a book without losing existing records', () => {
    const d = tiny();
    const b = createBook(d, input(), ctx);
    expect(d.books).toHaveLength(2);
    expect(b.authors).toEqual(['Ann One', 'Ben Two']);
    expect(b.isbn).toBe('9780596520687');
    expect(d.activity[0]!.type).toBe('book.created');
  });

  it('rejects duplicate ISBNs, including differently formatted ones', () => {
    const d = tiny();
    expect(() => createBook(d, input({ isbn: '978-0306406157' }), ctx)).toThrow(DomainError);
  });

  it('edits a book and records the changed fields', () => {
    const d = tiny();
    updateBook(d, 'b1', input({ isbn: '9780306406157', title: 'Edited' }), ctx);
    expect(d.books[0]!.title).toBe('Edited');
    expect(String(d.activity[0]!.meta?.fields)).toMatch(/title/);
  });

  it('archives and restores, but blocks archiving titles on loan', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    expect(() => setBookArchived(d, 'b1', true, ctx)).toThrow(/on loan/);
    const d2 = tiny();
    setBookArchived(d2, 'b1', true, ctx);
    expect(d2.books[0]!.status).toBe('archived');
    setBookArchived(d2, 'b1', false, ctx);
    expect(d2.books[0]!.status).toBe('active');
    assertConsistent(d);
  });
});

describe('book validation', () => {
  it('reports clear field errors', () => {
    const r = bookInputSchema.safeParse({ isbn: '123', title: '', authors: '', publisher: '', publicationYear: 3000, category: '', language: '', pageCount: 0 });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path[0]);
      for (const p of ['isbn', 'title', 'authors', 'publisher', 'publicationYear', 'category', 'pageCount']) expect(paths).toContain(p);
    }
  });
});

describe('search and filtering', () => {
  const d = seed();
  it('matches title, author, ISBN, category and description', () => {
    expect(searchBooks(d, { q: 'distributed' })[0]!.title).toBe('Foundations of Distributed Systems');
    expect(searchBooks(d, { q: 'Kwame Asante' }).length).toBe(2);
    const isbn = d.books[5]!.isbn;
    expect(searchBooks(d, { q: isbn })[0]!.id).toBe(d.books[5]!.id);
    expect(searchBooks(d, { q: 'monsoon' }).length).toBeGreaterThan(0);
  });

  it('combines filters instead of replacing them', () => {
    const cs = searchBooks(d, { categories: ['Computer Science'] });
    const csSpanish = searchBooks(d, { categories: ['Computer Science'], languages: ['Spanish'] });
    expect(cs.length).toBeGreaterThan(csSpanish.length);
    expect(csSpanish.every((b) => b.category === 'Computer Science' && b.language === 'Spanish')).toBe(true);
    const avail = searchBooks(d, { categories: ['Computer Science'], availableOnly: true });
    expect(avail.every((b) => availabilityOf(d, b.id).available > 0)).toBe(true);
  });

  it('returns nothing for nonsense queries and sorts correctly', () => {
    expect(searchBooks(d, { q: 'zzqxw' })).toHaveLength(0);
    const byTitle = searchBooks(d, {}, 'title').map((b) => b.title);
    expect(byTitle).toEqual([...byTitle].sort((a, b) => a.localeCompare(b)));
    const byYear = searchBooks(d, {}, 'year_desc').map((b) => b.publicationYear);
    expect(byYear).toEqual([...byYear].sort((a, b) => b - a));
  });

  it('suggests related books and toggles saved lists', () => {
    const b = d.books[0]!;
    expect(relatedBooks(d, b).length).toBeGreaterThan(0);
    const t = tiny();
    expect(toggleSaved(t, 's1', 'b1')).toBe(true);
    expect(t.saved.s1).toEqual(['b1']);
    expect(toggleSaved(t, 's1', 'b1')).toBe(false);
  });
});
