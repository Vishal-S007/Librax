import type { Actor, Book, Copy, CopyCondition, LibraryData, Member } from '@/types/models';
import { emptyData } from '@/repositories/schema';
import { isbn13FromStem } from '@/lib/isbn';
import type { Ctx } from '@/services/common';
import { issueLoan, returnLoan } from '@/services/circulation';
import { placeReservation } from '@/services/reservations';
import { addManualFine, settleFine } from '@/services/fines';
import { changeCopyStatus } from '@/services/inventory';
import { setMemberStatus } from '@/services/members';
import { runMaintenance } from '@/services/notifications';
import { SEED_BOOKS, SEED_MEMBERS } from './catalog';

/** Fixed IDs used by the demo login. */
export const DEMO_STUDENT_ID = 'mem_seed_01';
export const DEMO_FACULTY_ID = 'mem_seed_13';
export const DEMO_ADMIN: Actor = { name: 'Avery Lin', role: 'admin' };
export const DEMO_LIBRARIAN: Actor = { name: 'Lee Okafor', role: 'librarian' };

const DAY = 86_400_000;

/** Small deterministic PRNG so every reset produces the same demo library. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const pad = (n: number, w = 2) => String(n).padStart(w, '0');
const bookId = (i: number) => `bk_seed_${pad(i + 1)}`;
const memberId = (i: number) => `mem_seed_${pad(i + 1)}`;

const CATEGORY_CODE: Record<string, string> = {
  'Computer Science': 'CS', Mathematics: 'MA', Physics: 'PH', Literature: 'LI', History: 'HI', Economics: 'EC',
  Design: 'DE', Philosophy: 'PL', Biology: 'BI', Engineering: 'EN',
};

/** Scripted copies (key -> book index) whose story is controlled explicitly below. */
const SCRIPTED: Record<string, number> = {
  riyaOverdue: 0, helenNow: 0, riyaDueSoon: 3, riyaLateOpen: 6, riyaLateSettled: 26,
  salt1: 12, salt2: 12, quantum1: 9, quantum2: 9, compiler: 1, designNow: 23, colour: 24,
};
/** Books whose every copy is scripted, so their availability is exactly as described. */
const ONLY_SCRIPTED = new Set([12, 9, 24]);

export function buildSeed(nowDate: Date = new Date()): LibraryData {
  const rnd = mulberry32(20261009);
  const ri = (min: number, max: number) => min + Math.floor(rnd() * (max - min + 1));
  const pick = <T,>(arr: T[]) => arr[Math.floor(rnd() * arr.length)]!;
  const nowMs = nowDate.getTime();
  const at = (daysAgo: number, hour = 11, minute = 0) => {
    const dt = new Date(nowMs - daysAgo * DAY);
    dt.setHours(hour, minute, 0, 0);
    return Math.min(dt.getTime(), nowMs - 60_000);
  };
  const iso = (ms: number) => new Date(ms).toISOString();
  const now = iso(nowMs);

  const d = emptyData();
  const lib = (ms: number): Ctx => ({ actor: DEMO_LIBRARIAN, now: iso(ms) });

  /* ---- Books ---- */
  SEED_BOOKS.forEach((s, i) => {
    const created = iso(at(240 - i * 6, 10));
    const stem = `97881${pad(4207 + i * 37, 7)}`;
    const book: Book = {
      id: bookId(i),
      isbn: isbn13FromStem(stem),
      title: s.title,
      subtitle: s.subtitle,
      authors: s.authors,
      publisher: s.publisher,
      publicationYear: s.year,
      category: s.category,
      description: s.description,
      language: s.language ?? 'English',
      edition: s.edition,
      pageCount: s.pages,
      coverHue: (i * 47 + 18) % 360,
      tags: s.tags,
      featured: s.featured,
      status: 'active',
      createdAt: created,
      updatedAt: created,
    };
    d.books.push(book);
    d.activity.push({
      id: `act_seed_bk_${pad(i + 1)}`, type: 'book.created', at: created, actor: { name: DEMO_ADMIN.name, role: 'admin' },
      entity: { kind: 'book', id: book.id, label: book.title }, summary: `Added “${book.title}” to the catalog`,
    });
  });

  /* ---- Copies ---- */
  const conditions: CopyCondition[] = ['new', 'good', 'good', 'good', 'fair', 'worn'];
  let barcodeSeq = 1;
  const scriptedCopy: Record<string, string> = {};
  const genericCopies: Copy[] = [];
  const addCopy = (bi: number, n: number): Copy => {
    const b = d.books[bi]!;
    const copy: Copy = {
      id: `cp_seed_${pad(bi + 1)}_${n}`,
      bookId: b.id,
      barcode: `LBX-${pad(barcodeSeq++, 6)}`,
      shelfLocation: `${CATEGORY_CODE[b.category] ?? 'GN'}-${String.fromCharCode(65 + (bi % 6))}${ri(1, 9)}.${pad(ri(1, 40))}`,
      condition: pick(conditions),
      acquiredAt: b.createdAt,
      status: 'available',
      updatedAt: b.createdAt,
    };
    d.copies.push(copy);
    return copy;
  };
  d.books.forEach((b, bi) => {
    let n = 1;
    if (!ONLY_SCRIPTED.has(bi)) {
      const count = (b.featured ? 2 : 1) + ri(0, 2);
      for (let k = 0; k < count; k++) genericCopies.push(addCopy(bi, n++));
    }
    for (const [key, idx] of Object.entries(SCRIPTED)) if (idx === bi) scriptedCopy[key] = addCopy(bi, n++).id;
  });

  /* ---- Members ---- */
  SEED_MEMBERS.forEach((s, i) => {
    const [first, ...rest] = s.name.replace(/^(Dr\.|Prof\.)\s+/, '').split(' ');
    const handle = `${first}.${rest.join('')}`.toLowerCase().replace(/[^a-z.]/g, '');
    const registered = iso(at(320 - i * 4, 9));
    const prefix = s.type === 'faculty' ? 'FAC-' : s.type === 'staff' ? 'STF-' : 'STU-';
    const sameType = SEED_MEMBERS.slice(0, i + 1).filter((x) => x.type === s.type).length;
    const m: Member = {
      id: memberId(i),
      memberNo: `${prefix}${pad(sameType, 4)}`,
      name: s.name,
      email: `${handle}@${s.type === 'student' ? 'student.' : ''}example.edu`,
      phone: `+91 90000 ${pad(10100 + i * 7, 5)}`,
      type: s.type,
      department: s.department,
      status: 'active',
      registeredAt: registered,
      updatedAt: registered,
    };
    d.members.push(m);
    d.activity.push({
      id: `act_seed_mem_${pad(i + 1)}`, type: 'member.created', at: registered, actor: { name: DEMO_LIBRARIAN.name, role: 'librarian' },
      entity: { kind: 'member', id: m.id, label: m.name }, summary: `Registered ${m.name} (${m.memberNo})`,
    });
  });

  /* ---- Events ---- */
  type Ev = { ms: number; seq: number; run: () => void };
  const events: Ev[] = [];
  let seq = 0;
  const loanByKey = new Map<string, string>();
  const push = (ms: number, run: () => void) => events.push({ ms, seq: seq++, run });

  const issue = (key: string, member: string, copy: string, ms: number) =>
    push(ms, () => {
      try {
        loanByKey.set(key, issueLoan(d, { memberId: member, copyId: copy }, lib(ms)).loan.id);
      } catch (e) {
        // Generated history may legitimately hit a rule (limit, overdue, fines) — skip it.
        // Scripted demo stories must never fail silently.
        if (!key.startsWith('g')) throw new Error(`Seed story "${key}" could not be issued: ${e instanceof Error ? e.message : e}`);
      }
    });
  const ret = (key: string, ms: number, settle?: { afterDays: number; fraction: 1 | 0.5 }) =>
    push(ms, () => {
      const id = loanByKey.get(key);
      if (!id) return;
      const r = returnLoan(d, id, lib(ms));
      if (r.fine && settle) {
        const sms = ms + settle.afterDays * DAY;
        const amount = settle.fraction === 1 ? r.fine.assessed : Math.floor(r.fine.assessed / 2);
        if (sms < nowMs && amount > 0) {
          push(sms, () => settleFine(d, r.fine!.id, { amount, method: settle.afterDays % 2 ? 'cash' : 'card_at_desk', reference: `DESK-${ri(1000, 9999)}` }, lib(sms)));
        }
      }
    });

  // Generic circulation history: each generic copy gets a non-overlapping timeline.
  // The demo accounts keep only their scripted stories, so generated history never blocks them.
  const borrowers = d.members.filter((m) => m.type !== 'staff' && m.id !== DEMO_STUDENT_ID && m.id !== DEMO_FACULTY_ID).map((m) => m.id);
  const studentsOnly = borrowers.filter((id) => d.members.find((m) => m.id === id)!.type === 'student');
  const activeCandidates = studentsOnly.filter((id) => !['mem_seed_11', 'mem_seed_12'].includes(id));
  let gk = 0;
  for (const c of genericCopies) {
    let t = Math.max(new Date(c.acquiredAt).getTime(), nowMs - 210 * DAY) + ri(1, 10) * DAY;
    while (true) {
      const dur = ri(4, 24) * DAY;
      if (t + dur > nowMs - 3 * DAY) break;
      const key = `g${gk++}`;
      const member = pick(borrowers);
      issue(key, member, c.id, t + ri(9, 17) * 3_600_000);
      const late = t + dur;
      ret(key, late + ri(9, 18) * 3_600_000, rnd() < 0.7 ? { afterDays: ri(0, 6), fraction: rnd() < 0.85 ? 1 : 0.5 } : undefined);
      t = late + ri(1, 14) * DAY;
    }
    if (rnd() < 0.3) {
      const start = Math.max(t, nowMs - ri(2, 26) * DAY);
      if (start < nowMs - DAY) issue(`g${gk++}`, pick(activeCandidates), c.id, start + 3_600_000 * ri(1, 6));
    }
  }

  // Scripted stories for the demo accounts.
  const S = scriptedCopy;
  const riya = DEMO_STUDENT_ID;
  const helen = DEMO_FACULTY_ID;
  issue('riyaSettled', riya, S.riyaLateSettled!, at(100, 10));
  ret('riyaSettled', at(80, 15), { afterDays: 1, fraction: 1 });
  issue('riyaOpen', riya, S.riyaLateOpen!, at(60, 12));
  ret('riyaOpen', at(38, 16));
  issue('riyaOverdue', riya, S.riyaOverdue!, at(19, 11));
  issue('riyaDueSoon', riya, S.riyaDueSoon!, at(12, 14));

  // Fulfilled reservation: Helen waits for The Patient Compiler, then collects it.
  issue('compilerA', memberId(16), S.compiler!, at(58, 10));
  push(at(52, 9), () => {
    // Make every copy of the title unavailable by reserving only when the scripted copy is out.
    placeReservation(d, { memberId: helen, bookId: bookId(1) }, lib(at(52, 9)));
  });
  ret('compilerA', at(47, 13));
  push(at(46, 11), () => {
    const held = d.reservations.find((r) => r.memberId === helen && r.bookId === bookId(1) && r.status === 'ready');
    const copyId = held?.copyId;
    if (copyId) loanByKey.set('helenCompiler', issueLoan(d, { memberId: helen, copyId }, lib(at(46, 11))).loan.id);
  });
  ret('helenCompiler', at(21, 10));

  // Helen's current loans (30-day faculty period).
  issue('helenNow', helen, S.helenNow!, at(9, 15));
  issue('helenDesign', helen, S.designNow!, at(25, 10));

  // The Salt Road: both copies out; Riya joins the queue, a return puts a copy on hold for her.
  issue('salt1', memberId(17), S.salt1!, at(10, 12));
  issue('salt2', memberId(16), S.salt2!, at(13, 16));
  push(at(6, 10), () => placeReservation(d, { memberId: riya, bookId: bookId(12) }, lib(at(6, 10))));
  push(at(4, 13), () => placeReservation(d, { memberId: memberId(4), bookId: bookId(12) }, lib(at(4, 13))));
  ret('salt2', at(1, 11));

  // Quantum Mechanics: both copies out; Riya is first in the queue, Vikram second.
  issue('q1', memberId(17), S.quantum1!, at(8, 12));
  issue('q2', helen, S.quantum2!, at(15, 9));
  push(at(3, 17), () => placeReservation(d, { memberId: riya, bookId: bookId(9) }, lib(at(3, 17))));
  push(at(2, 10), () => placeReservation(d, { memberId: memberId(5), bookId: bookId(9) }, lib(at(2, 10))));

  // An uncollected hold that expires (single copy of The Colour Handbook).
  push(at(9, 10), () => placeReservation(d, { memberId: memberId(3), bookId: bookId(24) }, lib(at(9, 10))));

  // A damage charge with a partial settlement.
  push(at(30, 15), () => {
    const f = addManualFine(d, { memberId: memberId(9), amount: 45000, kind: 'damage', description: 'Water damage to “Signals and Systems” (copy rebound)' }, lib(at(30, 15)));
    settleFine(d, f.id, { amount: 20000, method: 'cash', reference: 'DESK-4410' }, lib(at(28, 12)));
  });

  events.sort((a, b) => a.ms - b.ms || a.seq - b.seq);
  // Events may enqueue settlement events; process as a growing, time-ordered queue.
  while (events.length) {
    events.sort((a, b) => a.ms - b.ms || a.seq - b.seq);
    const ev = events.shift()!;
    ev.run();
  }

  /* ---- Copy states beyond circulation ---- */
  const shelf = () => d.copies.filter((c) => c.status === 'available' && !Object.values(S).includes(c.id));
  const statusChanges: [Copy['status'], string][] = [['maintenance', 'Spine repair'], ['maintenance', 'Re-labelling'], ['damaged', 'Pages torn in chapter 4'], ['lost', 'Not found during shelf audit'], ['withdrawn', 'Superseded edition']];
  statusChanges.forEach(([to, note], i) => {
    const pool = shelf();
    const c = pool[(i * 7 + 3) % pool.length];
    if (c) changeCopyStatus(d, c.id, to, lib(at(20 - i * 3, 12)), note);
  });

  // Memberships that changed status recently (history is preserved).
  setMemberStatus(d, memberId(10), 'inactive', lib(at(15, 10)));
  setMemberStatus(d, memberId(11), 'suspended', lib(at(7, 10)));

  // Reading lists.
  d.saved[riya] = [bookId(4), bookId(16), bookId(23), bookId(13)];
  d.saved[helen] = [bookId(8), bookId(27)];

  // Course reserves set up by faculty (short-loan for students).
  const courseAt = iso(at(21, 10));
  d.courses.push(
    { id: 'crs_seed_cs301', code: 'CS301', title: 'Distributed Systems', term: 'Monsoon 2026', facultyId: DEMO_FACULTY_ID,
      bookIds: [bookId(0), bookId(2), bookId(4)], status: 'active', createdAt: courseAt, updatedAt: courseAt },
    { id: 'crs_seed_his210', code: 'HIS210', title: 'Trade and Empire in the Indian Ocean', term: 'Monsoon 2026', facultyId: memberId(15),
      bookIds: [bookId(16), bookId(18)], status: 'active', createdAt: courseAt, updatedAt: courseAt },
  );
  d.activity.push(
    { id: 'act_seed_crs_1', type: 'course.created', at: courseAt, actor: { name: 'Dr. Helen Achterberg', role: 'faculty' }, entity: { kind: 'data', id: 'crs_seed_cs301', label: 'CS301' }, summary: 'Dr. Helen Achterberg created course reserve CS301' },
    { id: 'act_seed_crs_2', type: 'course.created', at: courseAt, actor: { name: 'Prof. Clara Jensen', role: 'faculty' }, entity: { kind: 'data', id: 'crs_seed_his210', label: 'HIS210' }, summary: 'Prof. Clara Jensen created course reserve HIS210' },
  );

  // Reminders and hold expiry as of "now".
  runMaintenance(d, { actor: DEMO_LIBRARIAN, now });

  // Keep the inbox realistic: drop notifications older than 45 days, mark week-old ones read.
  const cutoff = iso(nowMs - 45 * DAY);
  const readBefore = iso(nowMs - 7 * DAY);
  d.notifications = d.notifications.filter((n) => n.createdAt >= cutoff);
  for (const n of d.notifications) if (n.createdAt < readBefore) n.read = true;
  d.notifications.unshift({
    id: 'ntf_seed_welcome', recipient: 'staff', kind: 'system', title: 'Welcome to LIBRAX',
    body: 'This demo library runs entirely in your browser. Use Settings → Data to back up or reset it.', createdAt: now, read: false,
  });
  d.notifications.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  d.activity.sort((a, b) => b.at.localeCompare(a.at));
  return d;
}
