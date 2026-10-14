import type { Actor, LibraryData } from '@/types/models';
import type { Ctx } from '@/services/common';
import { buildSeed } from '@/seed/seed';
import { emptyData } from '@/repositories/schema';
import { checkIntegrity } from '@/repositories/integrity';

export const NOW = '2026-10-09T06:00:00.000Z';
export const librarian: Actor = { name: 'Test Librarian', role: 'librarian' };
export const ctxAt = (now: string, actor: Actor = librarian): Ctx => ({ actor, now });
export const ctx = ctxAt(NOW);
export const daysFrom = (iso: string, days: number) => new Date(new Date(iso).getTime() + days * 86_400_000).toISOString();

export function seed(): LibraryData {
  return buildSeed(new Date(NOW));
}

/** A tiny, hand-built library for precise rule tests. */
export function tiny(): LibraryData {
  const d = emptyData();
  const t = '2026-01-01T00:00:00.000Z';
  d.books.push({
    id: 'b1', isbn: '9780306406157', title: 'Rule Testing', authors: ['A. Author'], publisher: 'P', publicationYear: 2020,
    category: 'Testing', description: 'About rules', language: 'English', pageCount: 100, coverHue: 10, tags: ['qa'], status: 'active', createdAt: t, updatedAt: t,
  });
  d.copies.push(
    { id: 'c1', bookId: 'b1', barcode: 'LBX-000001', shelfLocation: 'T-1', condition: 'good', acquiredAt: t, status: 'available', updatedAt: t },
    { id: 'c2', bookId: 'b1', barcode: 'LBX-000002', shelfLocation: 'T-1', condition: 'good', acquiredAt: t, status: 'available', updatedAt: t },
  );
  const m = (id: string, type: 'student' | 'faculty' | 'staff', name: string) => ({
    id, memberNo: `T-${id}`, name, email: `${id}@example.edu`, type, department: 'QA', status: 'active' as const, registeredAt: t, updatedAt: t,
  });
  d.members.push(m('s1', 'student', 'Sam Student'), m('s2', 'student', 'Sia Student'), m('s3', 'student', 'Sol Student'), m('f1', 'faculty', 'Fay Faculty'));
  return d;
}

export function assertConsistent(d: LibraryData) {
  const problems = checkIntegrity(d);
  if (problems.length) throw new Error(`Integrity problems: ${problems.join('; ')}`);
}
