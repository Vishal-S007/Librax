import { describe, expect, it } from 'vitest';
import { describeCard, extractCard, inSeries, parseSeries, seriesNumbers, seriesOverlap } from '@/lib/cardSeries';
import { resolveMemberCard } from '@/services/scan';
import { registerFromCard } from '@/services/members';
import { parseEnvelope, settingsSchema } from '@/repositories/schema';
import { checkIntegrity } from '@/repositories/integrity';
import { ctx, NOW, seed, tiny } from './helpers';

const CSE = { first: '1JB22CS001', last: '1JB22CS180' };

describe('card series', () => {
  it('parses a range and checks membership', () => {
    const r = parseSeries(CSE.first, CSE.last);
    expect(r.ok && r.spec).toMatchObject({ prefix: '1JB22CS', from: 1, to: 180, width: 3, size: 180 });
    expect(inSeries('1jb22cs045', CSE)).toBe(true);
    expect(inSeries('1JB22CS181', CSE)).toBe(false);
    expect(inSeries('1JB22IS045', CSE)).toBe(false);
    expect(inSeries('1JB22CS45', CSE)).toBe(false);
  });

  it('rejects malformed ranges with a reason', () => {
    expect(parseSeries('1JB22CS010', '1JB22CS001')).toMatchObject({ ok: false });
    expect(parseSeries('1JB22CS001', '1JB22IS180')).toMatchObject({ ok: false });
    expect(parseSeries('ABC', 'ABD')).toMatchObject({ ok: false });
    expect(parseSeries('X001', 'X0100')).toMatchObject({ ok: false });
  });

  it('detects overlaps and lists numbers', () => {
    expect(seriesOverlap(CSE, { first: '1JB22CS150', last: '1JB22CS200' })).toBe(true);
    expect(seriesOverlap(CSE, { first: '1JB22IS001', last: '1JB22IS180' })).toBe(false);
    expect(seriesNumbers(CSE, 3, (c) => c !== '1JB22CS002')).toEqual(['1JB22CS001', '1JB22CS003', '1JB22CS004']);
  });

  it('reads year and branch from a VTU-style USN', () => {
    const d = describeCard('1JB22CS045');
    expect(d.joined).toBe(2022);
    expect(d.department).toBe('Computer Science & Engineering');
    expect(describeCard('STU-0001').facts).toEqual([]);
  });

  it('pulls the number and name out of a QR payload', () => {
    const known = (c: string) => inSeries(c, CSE);
    expect(extractCard('Name: Riya Sharma | USN: 1JB22CS045', known)).toEqual({ code: '1JB22CS045', name: 'Riya Sharma' });
    expect(extractCard(' 1jb22cs007 ', known)).toEqual({ code: '1JB22CS007', name: undefined });
  });

  it('validates series inside settings', () => {
    const d = seed();
    expect(settingsSchema.safeParse(d.settings).success).toBe(true);
    const bad = { ...d.settings, cardSeries: [...d.settings.cardSeries, { id: 'x', type: 'faculty', first: 'AU2400', last: 'AU2600', active: true }] };
    expect(settingsSchema.safeParse(bad).success).toBe(false);
  });
});

describe('first-scan sign-in', () => {
  it('offers activation for an unused card in the series, then signs straight in', () => {
    const d = tiny();
    d.settings.cardSeries = [{ id: 's', type: 'student', ...CSE, label: 'CSE 22', active: true }];
    const first = resolveMemberCard(d, 'USN: 1JB22CS045', 'student');
    expect(first.ok).toBe(false);
    if (first.ok || !first.register) throw new Error('expected registration');
    expect(first.register.code).toBe('1JB22CS045');
    expect(first.register.details.department).toMatch(/Computer Science/);

    const m = registerFromCard(d, { code: '1JB22CS045', type: 'student', name: '  Riya   Sharma ' }, ctx);
    expect(m).toMatchObject({ memberNo: '1JB22CS045', name: 'Riya Sharma', type: 'student', status: 'active' });
    expect(m.department).toMatch(/Computer Science/);
    expect(checkIntegrity(d)).toEqual([]);

    const again = resolveMemberCard(d, '1JB22CS045', 'student');
    expect(again.ok && again.member.id).toBe(m.id);
    expect(() => registerFromCard(d, { code: '1JB22CS045', type: 'student', name: 'Copy Cat' }, ctx)).toThrow(/already registered/);
  });

  it('refuses cards outside any series, the wrong portal and inactive series', () => {
    const d = tiny();
    d.settings.cardSeries = [
      { id: 's', type: 'student', ...CSE, active: true },
      { id: 'f', type: 'faculty', first: 'SJBF001', last: 'SJBF050', active: true },
      { id: 'o', type: 'student', first: '1JB21CS001', last: '1JB21CS100', active: false },
    ];
    const reason = (code: string, p: 'student' | 'faculty') => { const r = resolveMemberCard(d, code, p); return r.ok ? '' : r.reason; };
    expect(reason('1JB22CS999', 'student')).toMatch(/isn’t in this library’s student card series/);
    expect(reason('SJBF010', 'student')).toMatch(/faculty card/);
    expect(reason('1JB21CS010', 'student')).toMatch(/isn’t registered/);
    expect(() => registerFromCard(d, { code: '1JB21CS010', type: 'student', name: 'Old Batch' }, ctx)).toThrow(/isn’t in an active/);
    expect(() => registerFromCard(d, { code: 'SJBF010', type: 'student', name: 'Wrong Way' }, ctx)).toThrow(/faculty card/);
  });

  it('upgrades v2 data with the example series', () => {
    const current = seed();
    const { cardSeries: _c, ...oldSettings } = current.settings;
    void _c;
    const v2 = { app: 'librax', schemaVersion: 2, updatedAt: NOW, data: { ...current, settings: oldSettings } };
    const res = parseEnvelope(JSON.parse(JSON.stringify(v2)));
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.migratedFrom).toBe(2);
      expect(res.envelope.data.settings.cardSeries.length).toBe(2);
    }
  });
});

describe('college ID cards AU1000–AU2500', () => {
  it('lets a real card like AU1296 activate and then sign in', () => {
    const d = tiny();
    d.settings.cardSeries = seed().settings.cardSeries;
    expect(inSeries('AU1296', { first: 'AU1000', last: 'AU2500' })).toBe(true);
    const r = resolveMemberCard(d, 'au1296', 'student');
    if (r.ok || !r.register) throw new Error('expected first-time activation');
    const m = registerFromCard(d, { code: r.register.code, type: 'student', name: 'Test Student' }, ctx);
    expect(m.memberNo).toBe('AU1296');
    const again = resolveMemberCard(d, 'AU1296', 'student');
    expect(again.ok).toBe(true);
    const outside = resolveMemberCard(d, 'AU2501', 'student');
    expect(outside.ok ? '' : outside.reason).toMatch(/AU1000 – AU2500/);
  });
});
