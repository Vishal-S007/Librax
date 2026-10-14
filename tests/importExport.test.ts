import { describe, expect, it } from 'vitest';
import {
  applyBookImport, applyMemberImport, exportBooksCsv, exportFinesCsv, exportInventoryCsv, exportLoansCsv, exportMembersCsv,
  exportReservationsCsv, previewBackup, previewBookImport, previewMemberImport,
} from '@/services/importExport';
import { parseCsv, parseCsvObjects, toCsv } from '@/lib/csv';
import { isValidIsbn, isbn13FromStem } from '@/lib/isbn';
import { createLibrary } from '@/app/library';
import { MemoryAdapter } from '@/repositories/adapter';
import { SessionStore } from '@/services/session';
import { assertConsistent, ctx, NOW, seed, tiny } from './helpers';

const BOOK_CSV = [
  'isbn,title,authors,publisher,publication_year,category,language,page_count,tags,copies,shelf',
  '978-0-596-52068-7,Good Row,"Doe, Jane; Roe, Rick",Pub,2020,Science,English,200,"a; b",2,SC-1',
  '9780306406157,Duplicate Of Existing,X,Pub,2020,Science,English,200,,0,',
  '123,Bad ISBN,X,Pub,2020,Science,English,200,,0,',
  '9780596520687,Duplicate In File,X,Pub,2020,Science,English,200,,0,',
  '9781861972712,No Shelf,X,Pub,2020,Science,English,200,,3,',
].join('\n');

describe('CSV utilities', () => {
  it('round-trips quoted fields and neutralises formula injection', () => {
    const csv = toCsv(['a', 'b'], [['x, "y"', '=HYPERLINK("evil")'], ['line\nbreak', -5]]);
    const rows = parseCsv(csv);
    expect(rows[1]![0]).toBe('x, "y"');
    expect(rows[1]![1]!.startsWith("'=")).toBe(true);
    expect(rows[2]![0]).toBe('line\nbreak');
    expect(rows[2]![1]).toBe('-5');
    expect(parseCsvObjects('Name , Email\nA,b@c.d').records[0]).toEqual({ name: 'A', email: 'b@c.d' });
  });
  it('validates ISBN checksums', () => {
    expect(isValidIsbn('0-306-40615-2')).toBe(true);
    expect(isValidIsbn('978-0-306-40615-7')).toBe(true);
    expect(isValidIsbn('978-0-306-40615-8')).toBe(false);
    expect(isValidIsbn(isbn13FromStem('978814207000'))).toBe(true);
  });
});

describe('book import', () => {
  it('previews valid, invalid and duplicate rows without changing data', () => {
    const d = tiny();
    const p = previewBookImport(d, BOOK_CSV);
    expect(p.totalRows).toBe(5);
    expect(p.valid.map((v) => v.value.title)).toEqual(['Good Row']);
    expect(p.duplicates.map((x) => x.reason)).toEqual(['ISBN already in catalog', 'Same ISBN as row 1']);
    expect(p.invalid.map((x) => x.row)).toEqual([3, 5]);
    expect(d.books).toHaveLength(1);
  });

  it('applies only valid rows and creates the requested copies', () => {
    const d = tiny();
    const p = previewBookImport(d, BOOK_CSV);
    const r = applyBookImport(d, p.valid.map((v) => v.value), ctx);
    expect(r).toEqual({ books: 1, copies: 2 });
    expect(d.books.find((b) => b.title === 'Good Row')!.authors).toEqual(['Doe, Jane', 'Roe, Rick']);
    assertConsistent(d);
  });

  it('reports missing required columns', () => {
    expect(previewBookImport(tiny(), 'title\nX').missingColumns).toContain('isbn');
  });
});

describe('member import', () => {
  it('validates emails and types, skipping duplicates', () => {
    const d = tiny();
    const csv = 'name,email,type,department\nNew One,new1@example.edu,student,Maths\nBad,not-an-email,student,Maths\nDup,s1@example.edu,faculty,X\nOdd,odd@example.edu,alien,X';
    const p = previewMemberImport(d, csv);
    expect(p.valid).toHaveLength(1);
    expect(p.invalid).toHaveLength(2);
    expect(p.duplicates).toHaveLength(1);
    expect(applyMemberImport(d, p.valid.map((v) => v.value), ctx)).toBe(1);
    assertConsistent(d);
  });
});

describe('exports', () => {
  it('produces CSV with headers and one row per record', () => {
    const d = seed();
    const count = (s: string) => parseCsv(s).length - 1;
    expect(count(exportBooksCsv(d))).toBe(d.books.length);
    expect(count(exportMembersCsv(d))).toBe(d.members.length);
    expect(count(exportInventoryCsv(d))).toBe(d.copies.length);
    expect(count(exportLoansCsv(d, NOW))).toBe(d.loans.length);
    expect(count(exportReservationsCsv(d))).toBe(d.reservations.length);
    expect(count(exportFinesCsv(d))).toBe(d.fines.length);
  });

  it('re-imports its own book export as duplicates (no double-adding)', () => {
    const d = seed();
    const p = previewBookImport(d, exportBooksCsv(d));
    expect(p.valid).toHaveLength(0);
    expect(p.duplicates).toHaveLength(d.books.length);
  });
});

describe('backup and restore', () => {
  it('round-trips a full backup and rejects tampered files', () => {
    const lib = createLibrary(new MemoryAdapter(), { seed: () => seed(), session: new SessionStore() });
    lib.store.load();
    const json = JSON.stringify(lib.store.exportEnvelope());
    const p = previewBackup(json);
    expect(p.ok).toBe(true);
    expect(p.counts!.Books).toBe(lib.store.getState().books.length);

    expect(previewBackup('{oops').ok).toBe(false);
    const tampered = JSON.parse(json);
    tampered.data.loans[0].copyId = 'nope';
    expect(previewBackup(JSON.stringify(tampered)).reason).toMatch(/Integrity/);
    const evil = JSON.parse(json);
    evil.data.books[0].title = { toString: 'function(){}' };
    expect(previewBackup(JSON.stringify(evil)).ok).toBe(false);

    lib.resetDemo();
    lib.restore(p.envelope!.data);
    expect(lib.store.getState().loans.length).toBe(p.counts!.Loans);
  });
});
