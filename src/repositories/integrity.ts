import type { LibraryData } from '@/types/models';

/** Returns a list of referential-integrity problems. Empty means consistent. */
export function checkIntegrity(d: LibraryData): string[] {
  const problems: string[] = [];
  const books = new Set(d.books.map((b) => b.id));
  const copies = new Map(d.copies.map((c) => [c.id, c]));
  const members = new Set(d.members.map((m) => m.id));
  const loans = new Map(d.loans.map((l) => [l.id, l]));

  const dupes = (arr: { id: string }[], label: string) => {
    const seen = new Set<string>();
    for (const x of arr) {
      if (seen.has(x.id)) problems.push(`Duplicate ${label} id ${x.id}`);
      seen.add(x.id);
    }
  };
  dupes(d.books, 'book'); dupes(d.copies, 'copy'); dupes(d.members, 'member'); dupes(d.loans, 'loan');
  dupes(d.reservations, 'reservation'); dupes(d.fines, 'fine');

  const barcodes = new Set<string>();
  for (const c of d.copies) {
    if (!books.has(c.bookId)) problems.push(`Copy ${c.barcode} references a missing book`);
    if (barcodes.has(c.barcode)) problems.push(`Duplicate barcode ${c.barcode}`);
    barcodes.add(c.barcode);
  }

  const activeByCopy = new Map<string, number>();
  for (const l of d.loans) {
    const c = copies.get(l.copyId);
    if (!c) problems.push(`Loan ${l.id} references a missing copy`);
    if (!members.has(l.memberId)) problems.push(`Loan ${l.id} references a missing member`);
    if (!books.has(l.bookId)) problems.push(`Loan ${l.id} references a missing book`);
    if (c && c.bookId !== l.bookId) problems.push(`Loan ${l.id} book does not match its copy`);
    if (!l.returnedAt) {
      activeByCopy.set(l.copyId, (activeByCopy.get(l.copyId) ?? 0) + 1);
      if (c && c.status !== 'borrowed') problems.push(`Copy ${c.barcode} has an active loan but status "${c.status}"`);
    }
  }
  for (const [copyId, n] of activeByCopy) if (n > 1) problems.push(`Copy ${copyId} has ${n} active loans`);
  for (const c of d.copies) {
    if (c.status === 'borrowed' && !activeByCopy.has(c.id)) problems.push(`Copy ${c.barcode} is "borrowed" without an active loan`);
  }

  const heldCopies = new Map<string, number>();
  for (const r of d.reservations) {
    if (!books.has(r.bookId)) problems.push(`Reservation ${r.id} references a missing book`);
    if (!members.has(r.memberId)) problems.push(`Reservation ${r.id} references a missing member`);
    if (r.status === 'ready') {
      if (!r.copyId) problems.push(`Ready reservation ${r.id} has no held copy`);
      else {
        heldCopies.set(r.copyId, (heldCopies.get(r.copyId) ?? 0) + 1);
        const c = copies.get(r.copyId);
        if (!c || c.status !== 'on_hold') problems.push(`Reservation ${r.id} holds a copy that is not on hold`);
      }
    }
  }
  for (const c of d.copies) {
    if (c.status === 'on_hold' && !heldCopies.has(c.id)) problems.push(`Copy ${c.barcode} is on hold without a ready reservation`);
  }
  for (const [copyId, n] of heldCopies) if (n > 1) problems.push(`Copy ${copyId} held for ${n} reservations`);

  for (const f of d.fines) {
    if (!members.has(f.memberId)) problems.push(`Fine ${f.id} references a missing member`);
    if (f.loanId && !loans.has(f.loanId)) problems.push(`Fine ${f.id} references a missing loan`);
  }
  const codes = new Set<string>();
  for (const c of d.courses) {
    const fac = d.members.find((m) => m.id === c.facultyId);
    if (!fac) problems.push(`Course ${c.code} references a missing faculty member`);
    for (const b of c.bookIds) if (!books.has(b)) problems.push(`Course ${c.code} lists a missing book`);
    if (new Set(c.bookIds).size !== c.bookIds.length) problems.push(`Course ${c.code} lists a book twice`);
    const key = c.status === 'active' ? c.code.toUpperCase() : '';
    if (key && codes.has(key)) problems.push(`Duplicate active course code ${c.code}`);
    if (key) codes.add(key);
  }
  for (const [memberId, ids] of Object.entries(d.saved)) {
    if (!members.has(memberId)) problems.push(`Saved list for missing member ${memberId}`);
    for (const b of ids) if (!books.has(b)) problems.push(`Saved list references missing book ${b}`);
  }
  return problems;
}
