import type { Book, CardSeries, Copy, LibraryData, Member } from '@/types/models';
import { describeCard, extractCard, seriesFor, seriesLabel, type CardDetails } from '@/lib/cardSeries';
import { isValidIsbn, normalizeIsbn } from '@/lib/isbn';

export type ScanResult =
  | { kind: 'copy'; copy: Copy; book: Book }
  | { kind: 'book'; book: Book; copy?: Copy }
  | { kind: 'unknown-isbn'; isbn: string }
  | { kind: 'none'; code: string };

/** Convert an ISBN-10 to its ISBN-13 form so either barcode style matches the catalog. */
export function toIsbn13(isbn: string): string {
  const s = normalizeIsbn(isbn);
  if (s.length !== 10) return s;
  const stem = `978${s.slice(0, 9)}`;
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(stem[i]) * (i % 2 === 0 ? 1 : 3);
  return stem + String((10 - (sum % 10)) % 10);
}

/**
 * Resolves anything a scanner or keyboard produces:
 * - a LIBRAX copy barcode (e.g. LBX-000123) → that exact copy
 * - an ISBN-10/13 (the barcode printed on the book) → the title, plus the best copy to use:
 *   a copy held for `memberId` first, otherwise an available copy
 * - an ISBN not in the catalog → "unknown-isbn" (useful for adding a new title)
 */
export function resolveScan(d: LibraryData, raw: string, memberId?: string): ScanResult {
  const code = raw.trim().toUpperCase();
  if (!code) return { kind: 'none', code };
  const copy = d.copies.find((c) => c.barcode.toUpperCase() === code);
  if (copy) {
    const book = d.books.find((b) => b.id === copy.bookId);
    if (book) return { kind: 'copy', copy, book };
  }
  const digits = normalizeIsbn(code);
  if (isValidIsbn(digits)) {
    const isbn13 = toIsbn13(digits);
    const book = d.books.find((b) => toIsbn13(b.isbn) === isbn13);
    if (!book) return { kind: 'unknown-isbn', isbn: isbn13 };
    const held = memberId
      ? d.copies.find((c) => c.bookId === book.id && c.status === 'on_hold' && d.reservations.some((r) => r.status === 'ready' && r.copyId === c.id && r.memberId === memberId))
      : undefined;
    const shelf = d.copies.filter((c) => c.bookId === book.id && c.status === 'available').sort((a, b) => a.barcode.localeCompare(b.barcode))[0];
    return { kind: 'book', book, copy: held ?? shelf };
  }
  return { kind: 'none', code };
}

export interface CardRegistration {
  code: string;
  type: 'student' | 'faculty';
  series: CardSeries;
  details: CardDetails;
  /** Name read from the card itself (QR codes often carry it). */
  name?: string;
}

export type CardResult =
  | { ok: true; member: Member }
  | { ok: false; reason: string; register?: CardRegistration };

/**
 * Resolves a scanned library card for signing in to the student or faculty portal.
 * The card may hold a member number (STU-0001), a college ID such as a USN
 * (1JB22CS045), or a QR payload containing one. A card inside an active card
 * series that nobody has used yet comes back as a first-time registration.
 */
export function resolveMemberCard(d: LibraryData, raw: string, portal: 'student' | 'faculty'): CardResult {
  if (!raw.trim()) return { ok: false, reason: 'No code was read. Try again.' };
  const byNo = (c: string) => d.members.find((m) => m.memberNo.toUpperCase() === c || m.id.toUpperCase() === c);
  const { code, name } = extractCard(raw, (c) => !!byNo(c) || !!seriesFor(d.settings.cardSeries, c));
  const member = byNo(code);
  if (!member) {
    const series = seriesFor(d.settings.cardSeries, code);
    if (series) {
      if (series.type !== portal) return { ok: false, reason: `${code} is a ${series.type} card — choose the ${series.type === 'faculty' ? 'Faculty' : 'Student'} portal.` };
      return { ok: false, reason: 'First time here? Confirm your details to activate your card.', register: { code, type: portal, series, details: describeCard(code), name } };
    }
    if (isValidIsbn(normalizeIsbn(code))) return { ok: false, reason: 'That’s a book barcode. Scan your library card instead.' };
    if (d.copies.some((c) => c.barcode.toUpperCase() === code)) return { ok: false, reason: 'That’s a book copy label. Scan your library card instead.' };
    const ranges = d.settings.cardSeries.filter((x) => x.active && x.type === portal).map(seriesLabel);
    return { ok: false, reason: `Card ${code} isn’t registered here${ranges.length ? ` and isn’t in this library’s ${portal} card series (${ranges.join(', ')})` : ''}. Please visit the circulation desk.` };
  }
  if (member.type !== portal) {
    const where = member.type === 'staff' ? 'Staff cards can’t sign in to the reader portal.' : `This is a ${member.type} card — choose the ${member.type === 'faculty' ? 'Faculty' : 'Student'} portal.`;
    return { ok: false, reason: where };
  }
  if (member.status !== 'active') return { ok: false, reason: `This membership is ${member.status}. Please visit the circulation desk.` };
  return { ok: true, member };
}
