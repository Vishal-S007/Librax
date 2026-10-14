import type { LibraryData, Member, MemberStatus } from '@/types/models';
import { describeCard, normalizeCard, seriesFor } from '@/lib/cardSeries';
import { DomainError } from '@/lib/errors';
import { newId, nextSequence } from '@/lib/ids';
import { activeLoans, getMember, log, type Ctx } from './common';
import { cancelMemberReservations } from './reservations';
import type { MemberInput } from './validation';

function assertEmailFree(d: LibraryData, email: string, exceptId?: string) {
  const e = email.toLowerCase();
  const other = d.members.find((m) => m.email.toLowerCase() === e && m.id !== exceptId);
  if (other) throw new DomainError(`Email is already registered to ${other.name} (${other.memberNo}).`, 'duplicate_email');
}

export function createMember(d: LibraryData, input: MemberInput, ctx: Ctx): Member {
  assertEmailFree(d, input.email);
  const prefix = input.type === 'faculty' ? 'FAC-' : input.type === 'staff' ? 'STF-' : 'STU-';
  const member: Member = {
    id: newId('mem'),
    memberNo: nextSequence(d.members.map((m) => m.memberNo), prefix),
    ...input,
    status: 'active',
    registeredAt: ctx.now,
    updatedAt: ctx.now,
  };
  d.members.push(member);
  log(d, ctx, 'member.created', `Registered ${member.name} (${member.memberNo})`, { kind: 'member', id: member.id, label: member.name }, {
    type: member.type,
  });
  return member;
}

export interface CardSignupInput {
  code: string;
  type: 'student' | 'faculty';
  name: string;
  email?: string;
  department?: string;
}

/**
 * First scan of a card inside an active card series: creates the member with the
 * card number as their member number, so every later scan signs them straight in.
 */
export function registerFromCard(d: LibraryData, input: CardSignupInput, ctx: Ctx): Member {
  const code = normalizeCard(input.code);
  const series = seriesFor(d.settings.cardSeries, code);
  if (!series) throw new DomainError(`Card ${code} isn’t in an active card series.`, 'card_not_in_series');
  if (series.type !== input.type) throw new DomainError(`${code} is a ${series.type} card.`, 'card_wrong_type');
  if (d.members.some((m) => m.memberNo.toUpperCase() === code)) throw new DomainError(`Card ${code} is already registered.`, 'card_registered');
  const name = input.name.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80) throw new DomainError('Enter your full name.', 'invalid_name');
  const email = (input.email?.trim() || `${code.toLowerCase().replace(/[^a-z0-9]+/g, '')}@card.librax.local`).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new DomainError('Enter a valid email address, or leave it blank.', 'invalid_email');
  assertEmailFree(d, email);
  const member: Member = {
    id: newId('mem'),
    memberNo: code,
    name,
    email,
    type: input.type,
    department: (input.department?.trim() || describeCard(code).department || (input.type === 'faculty' ? 'Faculty' : 'General')).slice(0, 80),
    status: 'active',
    registeredAt: ctx.now,
    updatedAt: ctx.now,
  };
  d.members.push(member);
  log(d, ctx, 'member.card_registered', `${member.name} activated card ${code}`, { kind: 'member', id: member.id, label: member.name }, {
    type: member.type, series: series.label ?? `${series.first}–${series.last}`,
  });
  return member;
}

export function updateMember(d: LibraryData, id: string, input: MemberInput, ctx: Ctx): Member {
  const m = getMember(d, id);
  assertEmailFree(d, input.email, id);
  Object.assign(m, input, { updatedAt: ctx.now });
  if (input.borrowLimit === undefined) delete m.borrowLimit;
  log(d, ctx, 'member.updated', `Updated ${m.name}`, { kind: 'member', id, label: m.name });
  return m;
}

/**
 * Deactivating or suspending keeps all history (loans, fines, activity).
 * Open reservations are cancelled so held copies move on to other members;
 * books currently on loan stay on loan and can still be returned.
 */
export function setMemberStatus(d: LibraryData, id: string, status: MemberStatus, ctx: Ctx): { member: Member; cancelledReservations: number } {
  const m = getMember(d, id);
  if (m.status === status) return { member: m, cancelledReservations: 0 };
  const from = m.status;
  m.status = status;
  m.updatedAt = ctx.now;
  let cancelled = 0;
  if (status !== 'active') cancelled = cancelMemberReservations(d, id, ctx, `Membership ${status}.`);
  log(d, ctx, 'member.status', `${m.name}: ${from} → ${status}`, { kind: 'member', id, label: m.name }, {
    from, to: status, openLoans: activeLoans(d, id).length, cancelledReservations: cancelled,
  });
  return { member: m, cancelledReservations: cancelled };
}

export function searchMembers(
  d: LibraryData,
  f: { q?: string; type?: Member['type'] | 'all'; status?: MemberStatus | 'all' },
): Member[] {
  const q = (f.q ?? '').trim().toLowerCase();
  return d.members
    .filter((m) => (!f.type || f.type === 'all' || m.type === f.type) && (!f.status || f.status === 'all' || m.status === f.status))
    .filter((m) => !q || `${m.name} ${m.email} ${m.memberNo} ${m.department}`.toLowerCase().includes(q))
    .sort((a, b) => a.name.localeCompare(b.name));
}
