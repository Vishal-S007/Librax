import type { Course, LibraryData, Member } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { getBook, getMember, log, notify, type Ctx } from './common';

/** Active courses that list this title. */
export function reservesFor(d: LibraryData, bookId: string): Course[] {
  return d.courses.filter((c) => c.status === 'active' && c.bookIds.includes(bookId));
}

/** Course-reserve rules apply to students only; faculty and staff borrow on their normal terms. */
export function isReserveLoanFor(d: LibraryData, member: Member, bookId: string): boolean {
  return member.type === 'student' && reservesFor(d, bookId).length > 0;
}

export interface CourseInput {
  code: string;
  title: string;
  term?: string;
}

function cleanInput(input: CourseInput): CourseInput {
  const code = input.code.trim().toUpperCase().replace(/\s+/g, '');
  const title = input.title.trim();
  if (!/^[A-Z0-9-]{2,20}$/.test(code)) throw new DomainError('Course code should be 2–20 letters or digits, e.g. CS301.', 'invalid_code');
  if (title.length < 2) throw new DomainError('Give the course a title.', 'invalid_title');
  return { code, title, term: input.term?.trim() || undefined };
}

function assertCodeFree(d: LibraryData, code: string, exceptId?: string) {
  const other = d.courses.find((c) => c.status === 'active' && c.code.toUpperCase() === code && c.id !== exceptId);
  if (other) throw new DomainError(`Course ${code} already exists.`, 'duplicate_course');
}

function getCourse(d: LibraryData, id: string): Course {
  const c = d.courses.find((x) => x.id === id);
  if (!c) throw new DomainError('Course not found.', 'not_found');
  return c;
}

export function createCourse(d: LibraryData, facultyId: string, input: CourseInput, ctx: Ctx): Course {
  const fac = getMember(d, facultyId);
  if (fac.type !== 'faculty') throw new DomainError('Only faculty can create course reserves.', 'forbidden');
  if (fac.status !== 'active') throw new DomainError('Your membership is not active.', 'member_inactive');
  const clean = cleanInput(input);
  assertCodeFree(d, clean.code);
  const course: Course = { id: newId('crs'), ...clean, facultyId, bookIds: [], status: 'active', createdAt: ctx.now, updatedAt: ctx.now };
  d.courses.push(course);
  log(d, ctx, 'course.created', `${fac.name} created course reserve ${course.code}`, { kind: 'data', id: course.id, label: course.code }, { title: course.title });
  return course;
}

export function updateCourse(d: LibraryData, id: string, input: CourseInput, ctx: Ctx): Course {
  const c = getCourse(d, id);
  const clean = cleanInput(input);
  assertCodeFree(d, clean.code, id);
  Object.assign(c, clean, { updatedAt: ctx.now });
  log(d, ctx, 'course.updated', `Updated course ${c.code}`, { kind: 'data', id: c.id, label: c.code });
  return c;
}

export function setCourseBook(d: LibraryData, id: string, bookId: string, onReserve: boolean, ctx: Ctx): Course {
  const c = getCourse(d, id);
  if (c.status !== 'active') throw new DomainError('Reactivate the course before changing its list.', 'course_archived');
  const book = getBook(d, bookId);
  const has = c.bookIds.includes(bookId);
  if (onReserve === has) return c;
  if (onReserve) {
    if (book.status !== 'active') throw new DomainError('Archived titles can’t be placed on reserve.', 'book_archived');
    c.bookIds.push(bookId);
  } else {
    c.bookIds = c.bookIds.filter((b) => b !== bookId);
  }
  c.updatedAt = ctx.now;
  log(d, ctx, 'course.updated', `${onReserve ? 'Added' : 'Removed'} “${book.title}” ${onReserve ? 'to' : 'from'} ${c.code} reserves`, { kind: 'book', id: book.id, label: book.title }, { course: c.code });
  if (onReserve) {
    notify(d, ctx, {
      recipient: 'staff', kind: 'system', title: `New course reserve for ${c.code}`,
      body: `“${book.title}” is now required reading for ${c.code}. Students borrow it for ${d.settings.reserveLoanDays} days with no renewals.`,
      link: { kind: 'book', id: book.id },
    });
  }
  return c;
}

export function setCourseStatus(d: LibraryData, id: string, status: Course['status'], ctx: Ctx): Course {
  const c = getCourse(d, id);
  if (status === 'active') assertCodeFree(d, c.code.toUpperCase(), id);
  c.status = status;
  c.updatedAt = ctx.now;
  log(d, ctx, status === 'archived' ? 'course.archived' : 'course.updated', `${status === 'archived' ? 'Archived' : 'Reactivated'} course ${c.code}`, { kind: 'data', id: c.id, label: c.code });
  return c;
}

export function courseOwnerId(d: LibraryData, id: string): string {
  return getCourse(d, id).facultyId;
}
