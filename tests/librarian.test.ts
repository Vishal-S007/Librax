import { describe, expect, it } from 'vitest';
import { answer, findBooks, mergeUnderstanding, systemPrompt, understand, writerPrompt } from '@/services/librarian';
import { renewLoan } from '@/services/circulation';
import { placeReservation } from '@/services/reservations';
import { setCourseBook } from '@/services/courses';
import { DEMO_FACULTY_ID, DEMO_STUDENT_ID } from '@/seed/seed';
import { checkIntegrity } from '@/repositories/integrity';
import { ctxAt, NOW, seed } from './helpers';

const student = { name: 'Riya', role: 'student' as const, memberId: DEMO_STUDENT_ID };

describe('AI Librarian — understanding', () => {
  it.each([
    ['hi', 'greeting'],
    ['What’s due soon?', 'due'],
    ['Renew my books', 'renew'],
    ['Do I owe any fines?', 'fines'],
    ['Where am I in the queue?', 'holds'],
    ['What do I need for CS301?', 'courses'],
    ['Add Graphs and Networks to CS301', 'course_add'],
    ['How many books can I borrow?', 'rules'],
    ['Is Learning Machines available?', 'availability'],
    ['Reserve The Salt Road', 'reserve'],
    ['Recommend something to read', 'recommend'],
    ['books on machine learning', 'search'],
  ])('%s → %s', (q, intent) => {
    expect(understand(q).intent).toBe(intent);
  });

  it('keeps only the words worth searching', () => {
    expect(understand('Can you find me some books about linear algebra please?').query).toBe('linear algebra');
    expect(understand('Add Graphs and Networks to CS301')).toMatchObject({ courseCode: 'CS301', query: 'graphs networks' });
  });

  it('lets the model widen open questions but never override exact ones', () => {
    const open = mergeUnderstanding(understand('why do people panic about money'), { intent: 'search', keywords: ['behavioural economics'] });
    expect(open.query).toContain('behavioural economics');
    const exact = mergeUnderstanding(understand('renew my books'), { intent: 'search', keywords: ['renew'] });
    expect(exact.intent).toBe('renew');
    expect(mergeUnderstanding(understand('hello'), null).intent).toBe('greeting');
  });
});

describe('AI Librarian — grounded answers', () => {
  it('finds books leniently and ranks better matches first', () => {
    const d = seed();
    expect(findBooks(d, 'distributed systems')[0]?.title).toBe('Foundations of Distributed Systems');
    expect(findBooks(d, 'kwame asante').length).toBe(2);
    expect(findBooks(d, 'zzzz')).toEqual([]);
  });

  it('only proposes renewals that the rules allow, and they really work', () => {
    const d = seed();
    const a = answer(d, DEMO_STUDENT_ID, understand('renew all my books'), NOW);
    expect(a.actions.length).toBeGreaterThan(0);
    for (const x of a.actions) {
      if (x.kind !== 'renew') throw new Error('expected renew');
      if (x.ok) expect(() => renewLoan(d, x.loanId, ctxAt(NOW, student))).not.toThrow();
      else expect(() => renewLoan(d, x.loanId, ctxAt(NOW, student))).toThrow();
    }
    expect(checkIntegrity(d)).toEqual([]);
  });

  it('offers a reservation that succeeds when confirmed', () => {
    const d = seed();
    const a = answer(d, DEMO_STUDENT_ID, understand('reserve linear algebra illuminated'), NOW);
    const act = a.actions[0];
    expect(act?.kind).toBe('reserve');
    if (act?.kind === 'reserve' && act.ok) {
      placeReservation(d, { memberId: DEMO_STUDENT_ID, bookId: act.bookId }, ctxAt(NOW, student));
      const again = answer(d, DEMO_STUDENT_ID, understand('reserve linear algebra illuminated'), NOW);
      expect(again.actions[0]).toMatchObject({ ok: false });
    }
  });

  it('answers about the member’s own account from real data', () => {
    const d = seed();
    const due = answer(d, DEMO_STUDENT_ID, understand('what is due?'), NOW);
    const loans = d.loans.filter((l) => l.memberId === DEMO_STUDENT_ID && !l.returnedAt);
    expect(due.facts.length).toBe(loans.length);
    const fines = answer(d, DEMO_STUDENT_ID, understand('do I owe fines'), NOW);
    expect(fines.text).toMatch(/owe|fines/);
    const rules = answer(d, DEMO_STUDENT_ID, understand('what are the rules'), NOW);
    expect(rules.text).toContain(`${d.settings.maxBorrowStudent} items`);
  });

  it('lets faculty add a book to their own course only', () => {
    const d = seed();
    const fac = answer(d, DEMO_FACULTY_ID, understand('Add Graphs and Networks to CS301'), NOW);
    const act = fac.actions[0];
    expect(act).toMatchObject({ kind: 'course_add', ok: true });
    if (act?.kind === 'course_add') setCourseBook(d, act.courseId, act.bookId, true, ctxAt(NOW, { name: 'Helen', role: 'faculty', memberId: DEMO_FACULTY_ID }));
    expect(answer(d, DEMO_FACULTY_ID, understand('Add Graphs and Networks to CS301'), NOW).actions[0]).toMatchObject({ ok: false });
    expect(answer(d, DEMO_STUDENT_ID, understand('Add Graphs and Networks to CS301'), NOW).text).toMatch(/Only faculty/);
    expect(answer(d, DEMO_FACULTY_ID, understand('Add Graphs and Networks to HIS210'), NOW).text).toMatch(/don’t have an active course/);
  });

  it('builds prompts that carry the facts and forbid invention', () => {
    const d = seed();
    const sys = systemPrompt(d, DEMO_STUDENT_ID, NOW);
    expect(sys).toMatch(/Never invent/);
    expect(sys).toContain('Riya');
    const a = answer(d, DEMO_STUDENT_ID, understand('books on machine learning'), NOW);
    expect(writerPrompt('books on machine learning', a)).toContain('Learning Machines');
  });

  it('handles nonsense and unknown members gracefully', () => {
    const d = seed();
    expect(answer(d, DEMO_STUDENT_ID, understand('qwertyuiop'), NOW).text).toMatch(/couldn’t find/);
    expect(answer(d, 'nobody', understand('hi'), NOW).text).toMatch(/Sign in/);
  });
});
