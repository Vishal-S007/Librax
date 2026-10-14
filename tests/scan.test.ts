import { describe, expect, it } from 'vitest';
import { resolveScan, toIsbn13 } from '@/services/scan';
import { issueLoan } from '@/services/circulation';
import { placeReservation } from '@/services/reservations';
import { ctx, tiny } from './helpers';

describe('scan resolution', () => {
  it('finds a copy by its LIBRAX barcode, case-insensitively', () => {
    const r = resolveScan(tiny(), ' lbx-000002 ');
    expect(r.kind).toBe('copy');
    if (r.kind === 'copy') expect(r.copy.id).toBe('c2');
  });

  it('maps a book ISBN (10 or 13, with dashes) to the title and an available copy', () => {
    const d = tiny();
    expect(toIsbn13('0-306-40615-2')).toBe('9780306406157');
    for (const code of ['9780306406157', '978-0-306-40615-7', '0306406152']) {
      const r = resolveScan(d, code);
      expect(r.kind).toBe('book');
      if (r.kind === 'book') expect(r.copy?.id).toBe('c1');
    }
  });

  it('prefers the copy held for the scanning member', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
    const res = placeReservation(d, { memberId: 's2', bookId: 'b1' }, ctx);
    expect(res.status).toBe('ready');
    const r = resolveScan(d, '9780306406157', 's2');
    if (r.kind === 'book') expect(r.copy?.id).toBe(res.copyId);
    const other = resolveScan(d, '9780306406157', 's3');
    if (other.kind === 'book') expect(other.copy).toBeUndefined();
  });

  it('reports ISBNs not in the catalog and ignores junk', () => {
    expect(resolveScan(tiny(), '9780596520687').kind).toBe('unknown-isbn');
    expect(resolveScan(tiny(), 'hello').kind).toBe('none');
  });
});

describe('library card sign-in', () => {
  it('signs in an active member of the right type by member number', async () => {
    const { resolveMemberCard } = await import('@/services/scan');
    const d = tiny();
    const r = resolveMemberCard(d, ' t-s1 ', 'student');
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.member.id).toBe('s1');
    const f = resolveMemberCard(d, 'T-f1', 'faculty');
    expect(f.ok).toBe(true);
  });

  it('explains every refusal', async () => {
    const { resolveMemberCard } = await import('@/services/scan');
    const { setMemberStatus } = await import('@/services/members');
    const d = tiny();
    const reason = (code: string, portal: 'student' | 'faculty') => { const r = resolveMemberCard(d, code, portal); return r.ok ? '' : r.reason; };
    expect(reason('T-f1', 'student')).toMatch(/faculty card/);
    expect(reason('9780306406157', 'student')).toMatch(/book barcode/);
    expect(reason('LBX-000001', 'student')).toMatch(/copy label/);
    expect(reason('STU-9999', 'student')).toMatch(/isn’t registered/);
    setMemberStatus(d, 's2', 'suspended', ctx);
    expect(reason('T-s2', 'student')).toMatch(/suspended/);
  });
});
