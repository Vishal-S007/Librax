import type { Book, LibraryData, Loan, Member } from '@/types/models';
import { activeLoans, availabilityOf, borrowLimitFor, isOverdue, loanDaysFor, memberBalance, renewalLimitFor } from './common';
import { loanDaysForBook, renewalChecks } from './circulation';
import { isOpen, queueFor, queuePosition } from './reservations';
import { reservesFor } from './courses';
import { borrowCounts } from './catalog';
import { daysUntil, dueDateFrom, fmtDate, toDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

/**
 * The AI Librarian's "brain" that never guesses. It understands a question,
 * looks everything up in LIBRAX, and proposes actions that the member must
 * confirm. An on-device language model may rephrase the answer, but every
 * book, date, amount and action comes from here.
 */

export const INTENTS = [
  'greeting', 'help', 'renew', 'reserve', 'course_add', 'fines', 'holds', 'due', 'my_loans',
  'courses', 'rules', 'availability', 'recommend', 'search', 'unknown',
] as const;
export type Intent = (typeof INTENTS)[number];

export interface Understood {
  intent: Intent;
  /** Content words used to look books up (title words, authors, topics). */
  query: string;
  /** Course code mentioned in the question, if any (e.g. CS301). */
  courseCode?: string;
  /** "renew everything" style requests. */
  all?: boolean;
}

export interface BookHit {
  book: Book;
  available: number;
  total: number;
  waiting: number;
  shelf?: string;
  reserveCodes: string[];
  yourLoan?: Loan;
  yourHold?: 'ready' | 'waiting';
}

export type ProposedAction =
  | { kind: 'reserve'; bookId: string; label: string; ok: boolean; why: string }
  | { kind: 'renew'; loanId: string; label: string; ok: boolean; why: string }
  | { kind: 'course_add'; courseId: string; bookId: string; label: string; ok: boolean; why: string };

export interface Answer {
  intent: Intent;
  /** The deterministic answer: always correct, shown when no AI is available. */
  text: string;
  /** Plain facts handed to the language model; it may only use these. */
  facts: string[];
  books: BookHit[];
  actions: ProposedAction[];
  suggestions: string[];
}

/* ---------------- Understanding ---------------- */

const STOP = new Set(
  ('a an the and or of to for in on at by with about from into is are was were be been am do does did i me my mine we our you your it its this that these those ' +
    'can could would should will shall may might please pls kindly want wanted need needs like looking look search find show give get got tell any anything some something ' +
    'book books title titles novel novels copy copies library librax there here have has had what which who whom how when where why one ones good best great nice new ' +
    'reserve reservation hold place put renew renewal extend borrow borrowed borrowing available availability shelf recommend recommendation suggest suggestions read reading ' +
    'more less similar related topic subject on? also just really very much many it? me? up out else other than then so if not no yes help hi hello hey thanks thank ok okay ' +
    'let lets let\'s today now time all every everything course courses add list').split(/\s+/),
);

const COURSE_RE = /\b([A-Za-z]{2,4})\s?-?(\d{3})\b/;

export function keywords(text: string): string {
  return text
    .toLowerCase()
    .replace(/[“”"‘’'?!.,:;()[\]{}]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 1 && !STOP.has(w) && !/^\d{1,2}$/.test(w))
    .join(' ');
}

/** Fast rule-based understanding. Works everywhere, instantly, with no model. */
export function understand(raw: string): Understood {
  const text = raw.trim().toLowerCase();
  const course = raw.match(COURSE_RE);
  const courseCode = course ? `${course[1]!.toUpperCase()}${course[2]}` : undefined;
  const query = keywords(courseCode ? raw.replace(COURSE_RE, ' ') : raw);
  const all = /\b(all|every|everything)\b/.test(text);
  const has = (re: RegExp) => re.test(text);

  let intent: Intent = 'unknown';
  if (!text) intent = 'help';
  else if (has(/^(hi|hello|hey|namaste|yo|good (morning|afternoon|evening))\b/) && text.split(/\s+/).length <= 4) intent = 'greeting';
  else if (has(/what can you do|how (do|does) (this|you) work|^help\b|^\?$/)) intent = 'help';
  else if (has(/\b(renew|extend|more time|keep (it|them) longer)\b/)) intent = 'renew';
  else if (courseCode && has(/\badd\b/)) intent = 'course_add';
  else if (has(/\b(my|any) (holds?|reservations?)\b|queue|waiting list|where am i|ready (for|to) (pick|collect)/)) intent = 'holds';
  else if (has(/\b(reserve|hold|put .* on hold|book it|save (a|me a) copy|join the (queue|line)|waitlist)\b/)) intent = 'reserve';
  else if (has(/\b(fines?|owe|penalt(y|ies)|pay(ment)?|dues|balance)\b/)) intent = 'fines';
  else if (has(/\b(due|overdue|deadline|return by|when (should|do|must) i return|late)\b/)) intent = 'due';
  else if (has(/\b(my (books|loans)|borrowed|have i got|do i have|checked out|on loan)\b/)) intent = 'my_loans';
  else if (courseCode || has(/\b(course|syllabus|required reading|reading list|module)\b/)) intent = 'courses';
  else if (has(/\b(how (many|long)|limits?\b|rules?\b|polic(y|ies)\b|loan period|allowed\b|grace)/)) intent = 'rules';
  else if (has(/\b(available|in stock|on the shelf|where (is|can i find)|is there a copy|any copies|can i (get|borrow))\b/)) intent = 'availability';
  else if (has(/\b(recommend|suggest|similar|something (on|about|like)|what should i read|good read|popular|trending)\b/)) intent = 'recommend';
  else if (has(/\b(find|search|look(ing)? for|books? (on|about|by)|written by|author|isbn)\b/) || query) intent = 'search';
  return { intent, query, courseCode, all };
}

/* ---------------- Looking things up ---------------- */

const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(?<=[a-z]{3})(es|s)$/, '');

/** Lenient ranked search: any keyword may match, and more matches rank higher. */
export function findBooks(d: LibraryData, query: string, limit = 5): Book[] {
  const words = keywords(query).split(/\s+/).filter(Boolean).map(stem);
  if (words.length === 0) return [];
  const scored: { b: Book; s: number }[] = [];
  for (const b of d.books) {
    if (b.status !== 'active') continue;
    const title = `${b.title} ${b.subtitle ?? ''}`.toLowerCase();
    const authors = b.authors.join(' ').toLowerCase();
    const topic = `${b.category} ${b.tags.join(' ')}`.toLowerCase();
    const rest = b.description.toLowerCase();
    let s = 0;
    let matched = 0;
    for (const w of words) {
      let ws = 0;
      if (b.isbn.replace(/-/g, '').includes(w) && w.length >= 4) ws = 14;
      else if (new RegExp(`\\b${escapeRe(w)}`).test(title)) ws = 10;
      else if (authors.includes(w)) ws = 9;
      else if (topic.includes(w)) ws = 7;
      else if (w.length >= 4 && rest.includes(w)) ws = 2;
      if (ws) { matched++; s += ws; }
    }
    if (matched === 0) continue;
    // Reward covering more of the question, so "distributed systems" beats a lone "systems" match.
    s *= 1 + matched / words.length;
    scored.push({ b, s });
  }
  return scored.sort((x, y) => y.s - x.s || x.b.title.localeCompare(y.b.title)).slice(0, limit).map((x) => x.b);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function bookHit(d: LibraryData, book: Book, memberId: string): BookHit {
  const a = availabilityOf(d, book.id);
  const shelfCopy = d.copies.find((c) => c.bookId === book.id && c.status === 'available');
  const hold = d.reservations.find((r) => r.memberId === memberId && r.bookId === book.id && isOpen(r));
  return {
    book,
    available: a.available,
    total: a.total,
    waiting: a.waiting,
    shelf: shelfCopy?.shelfLocation,
    reserveCodes: reservesFor(d, book.id).map((c) => c.code),
    yourLoan: activeLoans(d, memberId).find((l) => l.bookId === book.id),
    yourHold: hold ? (hold.status === 'ready' ? 'ready' : 'waiting') : undefined,
  };
}

const quote = (b: Book) => `“${b.title}”`;
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

function describeHit(h: BookHit, member: Member, d: LibraryData): string {
  const by = h.book.authors.join(', ');
  let s = `${quote(h.book)} by ${by} (${h.book.category}, ${h.book.publicationYear})`;
  if (h.yourLoan) s += ` — you already have this, due ${fmtDate(h.yourLoan.dueAt)}`;
  else if (h.yourHold === 'ready') s += ' — a copy is waiting for you at the desk';
  else if (h.yourHold === 'waiting') s += ' — you are already in the queue';
  else if (h.total === 0) s += ' — no circulating copies yet';
  else if (h.available > 0) s += ` — ${h.available} of ${h.total} on the shelf${h.shelf ? ` at ${h.shelf}` : ''}`;
  else s += ` — all ${h.total} out${h.waiting ? `, ${plural(h.waiting, 'person', 'people')} waiting` : ''}`;
  if (h.reserveCodes.length) {
    s += `. Course reserve for ${h.reserveCodes.join(', ')}`;
    if (member.type === 'student') s += ` (${d.settings.reserveLoanDays}-day loan, no renewals)`;
  }
  return s;
}

/** Checks whether this member could reserve the title right now, with the reason if not. */
export function reserveCheck(d: LibraryData, memberId: string, bookId: string): { ok: boolean; why: string } {
  const member = d.members.find((m) => m.id === memberId);
  const book = d.books.find((b) => b.id === bookId);
  if (!member || !book) return { ok: false, why: 'Not found' };
  if (member.status !== 'active') return { ok: false, why: 'Your membership is not active.' };
  if (book.status !== 'active') return { ok: false, why: 'This title is archived.' };
  if (d.reservations.some((r) => r.memberId === memberId && r.bookId === bookId && isOpen(r))) return { ok: false, why: 'You already reserved this title.' };
  if (activeLoans(d, memberId).some((l) => l.bookId === bookId)) return { ok: false, why: 'You already have this title on loan.' };
  const usable = d.copies.filter((c) => c.bookId === bookId && c.status !== 'withdrawn' && c.status !== 'lost');
  if (usable.length === 0) return { ok: false, why: 'No circulating copies exist yet.' };
  const queue = queueFor(d, bookId).length;
  const shelf = d.copies.some((c) => c.bookId === bookId && c.status === 'available');
  return {
    ok: true,
    why: shelf && queue === 0
      ? `A copy is on the shelf, so it will be held for you for ${plural(d.settings.pickupDays, 'day')}.`
      : `You will be #${queue + 1} in the queue.`,
  };
}

function renewAction(d: LibraryData, loan: Loan, member: Member, now: string): ProposedAction {
  const book = d.books.find((b) => b.id === loan.bookId);
  const failed = renewalChecks(d, loan.id, now).filter((c) => !c.ok);
  const base = toDate(loan.dueAt).getTime() > toDate(now).getTime() ? loan.dueAt : now;
  const next = dueDateFrom(base, loanDaysForBook(d, member, loan.bookId));
  return {
    kind: 'renew',
    loanId: loan.id,
    label: `Renew “${book?.title ?? 'this book'}”`,
    ok: failed.length === 0,
    why: failed.length === 0 ? `New due date: ${fmtDate(next)}.` : failed.map((f) => f.detail).join('; '),
  };
}

/** The member's own situation in a few lines. It is always part of the model's context. */
export function memberFacts(d: LibraryData, memberId: string, now: string): string[] {
  const member = d.members.find((m) => m.id === memberId);
  if (!member) return [];
  const s = d.settings;
  const loans = activeLoans(d, memberId);
  const owed = memberBalance(d, memberId);
  const holds = d.reservations.filter((r) => r.memberId === memberId && isOpen(r));
  const title = (id: string) => d.books.find((b) => b.id === id)?.title ?? 'a book';
  const out = [
    `Member: ${member.name}, ${member.type}, card ${member.memberNo}. Today is ${fmtDate(now)}.`,
    `Borrowing ${loans.length} of ${borrowLimitFor(member, s)} allowed.`,
  ];
  for (const l of loans) {
    const days = daysUntil(l.dueAt, now);
    out.push(`On loan: “${title(l.bookId)}”, due ${fmtDate(l.dueAt)} (${isOverdue(l, now) ? `OVERDUE by ${-days} day${-days === 1 ? '' : 's'}` : days === 0 ? 'due today' : `in ${days} day${days === 1 ? '' : 's'}`}).`);
  }
  for (const r of holds) {
    out.push(r.status === 'ready'
      ? `Hold READY to collect: “${title(r.bookId)}”, pick up by ${fmtDate(r.pickupBy)}.`
      : `Reserved, waiting: “${title(r.bookId)}”, position #${queuePosition(d, r)}.`);
  }
  out.push(owed > 0 ? `Fines owed: ${formatMoney(owed, s.currency)}.` : 'No fines owed.');
  return out;
}

export function rulesFacts(d: LibraryData, member: Member): string[] {
  const s = d.settings;
  const blockAt = s.blockBorrowingAbove > 0 ? `Borrowing is blocked when fines exceed ${formatMoney(s.blockBorrowingAbove, s.currency)}.` : 'Fines never block borrowing.';
  return [
    `As a ${member.type}, you can borrow up to ${borrowLimitFor(member, s)} items for ${loanDaysFor(member, s)} days each.`,
    `Each loan can be renewed ${plural(renewalLimitFor(member, s), 'time')}, unless someone is waiting for the title${s.blockRenewalWhenOverdue ? ' or it is overdue' : ''}.`,
    `Late returns cost ${formatMoney(s.fineRatePerDay, s.currency)} per day after a ${plural(s.fineGraceDays, 'day')} grace period${s.maxFinePerLoan > 0 ? `, capped at ${formatMoney(s.maxFinePerLoan, s.currency)} per loan` : ''}.`,
    blockAt,
    `Reserved books are held for ${plural(s.pickupDays, 'day')} once a copy is ready.`,
    member.type === 'student'
      ? `Course-reserve titles are ${s.reserveLoanDays}-day loans for students and cannot be renewed.`
      : 'Course-reserve limits apply only to students; you keep your normal loan terms.',
  ];
}

/* ---------------- Answering ---------------- */

export const STARTERS: Record<'student' | 'faculty', string[]> = {
  student: ['What’s due soon?', 'Renew my books', 'Books on machine learning', 'What do I need for CS301?', 'Do I owe any fines?'],
  faculty: ['Books on distributed systems', 'How are my courses doing?', 'Renew my books', 'Add Graphs and Networks to CS301', 'What are my borrowing rules?'],
};

export function answer(d: LibraryData, memberId: string, u: Understood, now: string): Answer {
  const member = d.members.find((m) => m.id === memberId);
  const empty: Answer = { intent: u.intent, text: '', facts: [], books: [], actions: [], suggestions: [] };
  if (!member) return { ...empty, text: 'Sign in as a student or faculty member to use the AI Librarian.' };
  const kind = member.type === 'faculty' ? 'faculty' : 'student';
  const first = member.name.split(' ')[0];
  const loans = activeLoans(d, memberId);
  const title = (id: string) => d.books.find((b) => b.id === id)?.title ?? 'a book';
  const hits = (books: Book[]) => books.map((b) => bookHit(d, b, memberId));

  switch (u.intent) {
    case 'greeting':
    case 'help': {
      const text = `${u.intent === 'greeting' ? `Hi ${first}! ` : ''}I can find books, tell you if a copy is on the shelf, explain the rules, check what’s due and what you owe, and reserve or renew books for you — you just confirm.${kind === 'faculty' ? ' I can also add books to your course reserves.' : ''}`;
      return { ...empty, text, facts: [text], suggestions: STARTERS[kind] };
    }

    case 'my_loans':
    case 'due': {
      if (loans.length === 0) {
        const text = 'You have no books on loan right now.';
        return { ...empty, text, facts: [text], suggestions: ['Recommend something to read', 'What are my borrowing rules?'] };
      }
      const sorted = [...loans].sort((a, b) => a.dueAt.localeCompare(b.dueAt));
      const lines = sorted.map((l) => {
        const days = daysUntil(l.dueAt, now);
        const when = isOverdue(l, now) ? `was due ${fmtDate(l.dueAt)} — overdue by ${plural(-days, 'day')}` : days === 0 ? 'is due today' : `is due ${fmtDate(l.dueAt)} (in ${plural(days, 'day')})`;
        return `“${title(l.bookId)}” ${when}`;
      });
      const overdue = sorted.filter((l) => isOverdue(l, now)).length;
      const text = `You have ${plural(loans.length, 'book')} on loan. ${lines.join('; ')}.${overdue ? ' Please return overdue books soon to stop fines growing.' : ''}`;
      return {
        ...empty, text, facts: lines.map((l) => `${l}.`),
        books: hits(sorted.map((l) => d.books.find((b) => b.id === l.bookId)).filter((b): b is Book => !!b)),
        actions: sorted.map((l) => renewAction(d, l, member, now)).filter((a) => a.ok),
        suggestions: ['Renew my books', 'Do I owe any fines?'],
      };
    }

    case 'renew': {
      if (loans.length === 0) {
        const text = 'You don’t have any books on loan, so there’s nothing to renew.';
        return { ...empty, text, facts: [text] };
      }
      const named = u.query ? findBooks(d, u.query, 10).map((b) => b.id) : [];
      const target = !u.all && named.length ? loans.filter((l) => named.includes(l.bookId)) : loans;
      const list = target.length ? target : loans;
      const actions = list.map((l) => renewAction(d, l, member, now));
      const okN = actions.filter((a) => a.ok).length;
      const facts = actions.map((a) => `${a.label.replace(/^Renew /, '')}: ${a.ok ? `can be renewed. ${a.why}` : `cannot be renewed — ${a.why}`}`);
      const text = okN === 0
        ? `None of these can be renewed right now. ${facts.join(' ')}`
        : `${okN === actions.length ? (actions.length === 1 ? 'This one can be renewed.' : `All ${actions.length} can be renewed.`) : `${okN} of ${actions.length} can be renewed.`} Press Confirm on each one you want. ${facts.join(' ')}`;
      return { ...empty, text, facts, actions };
    }

    case 'holds': {
      const holds = d.reservations.filter((r) => r.memberId === memberId && isOpen(r));
      if (holds.length === 0) {
        const text = 'You have no reservations right now. Ask me to reserve any book that is out.';
        return { ...empty, text, facts: [text] };
      }
      const facts = holds.map((r) => r.status === 'ready'
        ? `“${title(r.bookId)}” is READY at the desk — collect it by ${fmtDate(r.pickupBy)}.`
        : `“${title(r.bookId)}”: you are #${queuePosition(d, r)} in the queue.`);
      return { ...empty, text: facts.join(' '), facts, books: hits(holds.map((r) => d.books.find((b) => b.id === r.bookId)).filter((b): b is Book => !!b)) };
    }

    case 'fines': {
      const owed = memberBalance(d, memberId);
      const s = d.settings;
      const overdue = loans.filter((l) => isOverdue(l, now));
      const facts = [
        owed > 0 ? `You owe ${formatMoney(owed, s.currency)} in fines. You can pay at the library desk.` : 'You don’t owe any fines.',
        ...(overdue.length ? [`${plural(overdue.length, 'book is', 'books are')} overdue and still adding ${formatMoney(s.fineRatePerDay, s.currency)} a day after the grace period: ${overdue.map((l) => `“${title(l.bookId)}”`).join(', ')}.`] : []),
        ...(s.blockBorrowingAbove > 0 && owed > s.blockBorrowingAbove ? [`Borrowing is blocked until fines are below ${formatMoney(s.blockBorrowingAbove, s.currency)}.`] : []),
      ];
      return { ...empty, text: facts.join(' '), facts, suggestions: overdue.length ? ['What’s due soon?'] : [] };
    }

    case 'rules': {
      const facts = rulesFacts(d, member);
      return { ...empty, text: facts.join(' '), facts };
    }

    case 'courses': {
      const active = d.courses.filter((c) => c.status === 'active');
      const picked = u.courseCode ? active.filter((c) => c.code === u.courseCode) : kind === 'faculty' ? active.filter((c) => c.facultyId === memberId) : active;
      if (u.courseCode && picked.length === 0) {
        const text = `I couldn’t find an active course called ${u.courseCode}.${active.length ? ` Courses with reserves: ${active.map((c) => c.code).join(', ')}.` : ''}`;
        return { ...empty, text, facts: [text] };
      }
      if (picked.length === 0) {
        const text = kind === 'faculty' ? 'You have no active courses yet. Create one under Course reserves, then ask me to add books to it.' : 'No courses have books on reserve right now.';
        return { ...empty, text, facts: [text] };
      }
      const facts: string[] = [];
      const books: Book[] = [];
      for (const c of picked.slice(0, 4)) {
        const list = c.bookIds.map((id) => d.books.find((b) => b.id === id)).filter((b): b is Book => !!b);
        books.push(...list);
        const waiting = list.reduce((n, b) => n + queueFor(d, b.id).length, 0);
        const out = list.reduce((n, b) => n + availabilityOf(d, b.id).borrowed, 0);
        facts.push(`${c.code} ${c.title}${c.term ? ` (${c.term})` : ''}: ${plural(list.length, 'title')} on reserve${list.length ? ` — ${list.map(quote).join(', ')}` : ''}.${kind === 'faculty' ? ` ${plural(out, 'copy', 'copies')} out, ${plural(waiting, 'student')} waiting.` : ''}`);
      }
      if (kind === 'student') facts.push(`Reserve titles are ${d.settings.reserveLoanDays}-day loans with no renewals.`);
      if (kind === 'faculty' && facts.some((f) => /[1-9]\d* students? waiting/.test(f))) facts.push('Students are waiting — consider asking the library for more copies.');
      const unique = [...new Map(books.map((b) => [b.id, b])).values()].slice(0, 6);
      return {
        ...empty, text: facts.join(' '), facts, books: hits(unique),
        actions: unique.map((b) => ({ kind: 'reserve' as const, bookId: b.id, label: `Reserve “${b.title}”`, ...reserveCheck(d, memberId, b.id) })).filter((a) => a.ok && availabilityOf(d, a.bookId).available === 0),
      };
    }

    case 'course_add': {
      if (kind !== 'faculty') {
        const text = 'Only faculty can add books to course reserves.';
        return { ...empty, text, facts: [text] };
      }
      const course = d.courses.find((c) => c.code === u.courseCode && c.facultyId === memberId && c.status === 'active');
      if (!course) {
        const mine = d.courses.filter((c) => c.facultyId === memberId && c.status === 'active').map((c) => c.code);
        const text = `You don’t have an active course called ${u.courseCode ?? 'that'}.${mine.length ? ` Your courses: ${mine.join(', ')}.` : ''}`;
        return { ...empty, text, facts: [text] };
      }
      const found = findBooks(d, u.query, 3);
      if (found.length === 0) {
        const text = `I couldn’t find that book in the catalog. Try the exact title.`;
        return { ...empty, text, facts: [text] };
      }
      const actions: ProposedAction[] = found.map((b) => {
        const already = course.bookIds.includes(b.id);
        return { kind: 'course_add', courseId: course.id, bookId: b.id, label: `Add “${b.title}” to ${course.code}`, ok: !already, why: already ? `Already on ${course.code}.` : `Students will get ${d.settings.reserveLoanDays}-day loans.` };
      });
      const best = found[0]!;
      const text = course.bookIds.includes(best.id)
        ? `“${best.title}” is already on ${course.code}.`
        : `I found “${best.title}”. Confirm below to put it on reserve for ${course.code}.`;
      return { ...empty, text, facts: [text, ...actions.map((a) => `${a.label}: ${a.why}`)], books: hits(found), actions };
    }

    case 'reserve':
    case 'availability':
    case 'recommend':
    case 'search':
    case 'unknown': {
      let found = u.query ? findBooks(d, u.query, u.intent === 'reserve' || u.intent === 'availability' ? 3 : 5) : [];
      if (found.length === 0 && u.intent === 'recommend') {
        const counts = borrowCounts(d);
        found = d.books.filter((b) => b.status === 'active').sort((a, b) => (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0) || a.title.localeCompare(b.title)).slice(0, 4);
      }
      if (found.length === 0) {
        const text = u.query
          ? `I couldn’t find any books matching “${u.query}”. Try an author, a topic like “economics”, or part of the title.`
          : 'I’m not sure what you mean. You can ask me to find books, check what’s due, renew or reserve something, or explain the rules.';
        return { ...empty, text, facts: [text], suggestions: STARTERS[kind] };
      }
      const h = hits(found);
      const facts = h.map((x) => `${describeHit(x, member, d)}.`);
      const actions: ProposedAction[] = [];
      for (const x of (u.intent === 'reserve' ? h.slice(0, 1) : h).slice(0, 3)) {
        const check = reserveCheck(d, memberId, x.book.id);
        // Offer a reservation when asked, or when the book is out so the member can join the queue.
        if (check.ok && (u.intent === 'reserve' || x.available === 0)) actions.push({ kind: 'reserve', bookId: x.book.id, label: `Reserve “${x.book.title}”`, ...check });
        else if (!check.ok && u.intent === 'reserve') actions.push({ kind: 'reserve', bookId: x.book.id, label: `Reserve “${x.book.title}”`, ...check });
      }
      const top = h[0]!;
      let lead: string;
      if (u.intent === 'reserve') lead = actions[0]?.ok ? `Found ${quote(top.book)}. ${actions[0].why} Press Confirm to reserve it.` : `Found ${quote(top.book)}, but I can’t reserve it: ${actions[0]?.why ?? 'not possible right now.'}`;
      else if (u.intent === 'availability') lead = `${describeHit(top, member, d)}.`;
      else lead = `Here ${found.length === 1 ? 'is 1 book' : `are ${found.length} books`} that match${u.intent === 'recommend' && !u.query ? ' — the most borrowed right now' : ''}:`;
      const text = u.intent === 'availability' ? lead : u.intent === 'reserve' ? lead : `${lead} ${facts.join(' ')}`;
      return { ...empty, intent: u.intent, text, facts, books: h, actions };
    }
  }
}

/* ---------------- Grounding for the language model ---------------- */

export function systemPrompt(d: LibraryData, memberId: string, now: string): string {
  const member = d.members.find((m) => m.id === memberId);
  return [
    `You are the AI Librarian of ${d.settings.libraryName}, built into LIBRAX. You run entirely on this laptop.`,
    'Speak warmly and briefly, like a helpful librarian. Use at most 4 short sentences. No markdown headings or tables.',
    'Only state facts given to you in this conversation. Never invent books, authors, dates, amounts, shelf locations or rules.',
    'You cannot change anything yourself. When an action is offered, tell the member to press Confirm on the button below your message.',
    'About this member:',
    ...memberFacts(d, memberId, now).map((f) => `- ${f}`),
    ...(member ? ['Library rules:', ...rulesFacts(d, member).map((f) => `- ${f}`)] : []),
  ].join('\n');
}

export function writerPrompt(question: string, a: Answer): string {
  const actions = a.actions.map((x) => `- Button "${x.label}": ${x.ok ? `available. ${x.why}` : `not possible — ${x.why}`}`);
  return [
    `Member asked: "${question}"`,
    'Facts from the LIBRAX database (the only truth):',
    ...a.facts.map((f) => `- ${f}`),
    ...(actions.length ? ['Action buttons shown under your reply:', ...actions] : []),
    'Answer the member using only these facts.',
  ].join('\n');
}

/** Topic vocabulary from the catalog so the model maps fuzzy questions onto words that actually exist. */
export function vocabulary(d: LibraryData, max = 120): string[] {
  const words = new Set<string>();
  for (const b of d.books) {
    if (b.status !== 'active') continue;
    words.add(b.category.toLowerCase());
    b.tags.forEach((t) => words.add(t.toLowerCase()));
  }
  return [...words].sort().slice(0, max);
}

export function routerPrompt(d: LibraryData): string {
  return [
    'You classify messages sent to a university library assistant. Reply with JSON only.',
    `intent is one of: ${INTENTS.join(', ')}.`,
    'search = find books on a topic/author/title; recommend = asks for suggestions; availability = is a specific book on the shelf; reserve = wants to reserve/hold a book; renew = extend loans;',
    'my_loans/due = their borrowed books and due dates; fines = money owed; holds = their reservations; courses = course reading lists; course_add = faculty adding a book to a course; rules = borrowing policies.',
    'keywords: 1-4 short catalog search words (title words, author names, or topics). Prefer topics from this list when they fit:',
    vocabulary(d).join(', '),
  ].join('\n');
}

export const ROUTER_SCHEMA = {
  type: 'object',
  properties: {
    intent: { type: 'string', enum: [...INTENTS] },
    keywords: { type: 'array', items: { type: 'string' }, maxItems: 4 },
  },
  required: ['intent', 'keywords'],
  additionalProperties: false,
} as const;

/**
 * Merges the model's reading of a question with the rule-based one. Clear
 * rule matches (renew, fines, due…) win, because they are exact; the model
 * helps most with open questions like "something about why markets panic".
 */
export function mergeUnderstanding(rule: Understood, model: { intent?: string; keywords?: unknown } | null): Understood {
  if (!model) return rule;
  const intent = (INTENTS as readonly string[]).includes(model.intent ?? '') ? (model.intent as Intent) : 'unknown';
  const kw = Array.isArray(model.keywords) ? model.keywords.filter((k): k is string => typeof k === 'string').join(' ') : '';
  const open: Intent[] = ['search', 'recommend', 'unknown'];
  const out: Understood = { ...rule };
  if (open.includes(rule.intent) && intent !== 'unknown' && intent !== 'course_add') out.intent = intent;
  if (open.includes(out.intent) || out.intent === 'availability' || out.intent === 'reserve') {
    const merged = keywords(`${kw} ${rule.query}`);
    if (merged) out.query = [...new Set(merged.split(' '))].join(' ');
  }
  return out;
}
