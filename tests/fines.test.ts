import { describe, expect, it } from 'vitest';
import { addManualFine, adjustFine, settleFine, waiveFine, accruingFines } from '@/services/fines';
import { fineBalance, fineStatus, memberBalance, overdueFine } from '@/services/common';
import { issueLoan } from '@/services/circulation';
import { DEFAULT_SETTINGS } from '@/repositories/schema';
import { formatMoney, parseMoney, toDecimalString } from '@/lib/money';
import { ctx, ctxAt, daysFrom, NOW, tiny } from './helpers';

describe('fine calculation', () => {
  const s = { ...DEFAULT_SETTINGS, fineRatePerDay: 500, fineGraceDays: 1, maxFinePerLoan: 3000 };
  const due = '2026-10-01T18:29:00.000Z';
  it('charges nothing on time or within grace', () => {
    expect(overdueFine(due, '2026-10-01T10:00:00.000Z', s).amount).toBe(0);
    expect(overdueFine(due, daysFrom(due, 1), s).amount).toBe(0);
  });
  it('charges days beyond grace and caps the total', () => {
    expect(overdueFine(due, daysFrom(due, 4), s)).toMatchObject({ days: 4, chargeableDays: 3, amount: 1500 });
    expect(overdueFine(due, daysFrom(due, 30), s).amount).toBe(3000);
    expect(overdueFine(due, daysFrom(due, 30), { ...s, maxFinePerLoan: 0 }).amount).toBe(29 * 500);
  });
});

describe('fine management', () => {
  it('records manual charges, partial and full settlements', () => {
    const d = tiny();
    const f = addManualFine(d, { memberId: 's1', amount: 12345, kind: 'damage', description: 'Spine broken' }, ctx);
    settleFine(d, f.id, { amount: 2345, method: 'cash' }, ctx);
    expect(fineBalance(f)).toBe(10000);
    expect(fineStatus(f)).toBe('outstanding');
    expect(() => settleFine(d, f.id, { amount: 10001, method: 'cash' }, ctx)).toThrow(/exceeds/);
    settleFine(d, f.id, { amount: 10000, method: 'card_at_desk', reference: 'R1' }, ctx);
    expect(fineStatus(f)).toBe('settled');
    expect(d.activity.filter((a) => a.type === 'fine.settled')).toHaveLength(2);
  });

  it('requires reasons for adjustments and never goes negative', () => {
    const d = tiny();
    const f = addManualFine(d, { memberId: 's1', amount: 1000, kind: 'manual', description: 'Test' }, ctx);
    expect(() => adjustFine(d, f.id, { amount: -100, reason: '' }, ctx)).toThrow(/reason/);
    expect(() => adjustFine(d, f.id, { amount: -1001, reason: 'Too much' }, ctx)).toThrow(/negative/);
    adjustFine(d, f.id, { amount: -400, reason: 'Goodwill' }, ctx);
    expect(fineBalance(f)).toBe(600);
    waiveFine(d, f.id, 'First offence', ctx);
    expect(fineStatus(f)).toBe('waived');
    expect(memberBalance(d, 's1')).toBe(0);
  });

  it('reports fines accruing on unreturned overdue loans', () => {
    const d = tiny();
    issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -20)));
    const acc = accruingFines(d, NOW, 's1');
    expect(acc).toHaveLength(1);
    expect(acc[0]!.amount).toBeGreaterThan(0);
  });
});

describe('money helpers (no floating point)', () => {
  it('parses and formats minor units exactly', () => {
    expect(parseMoney('0.1', 'INR')).toBe(10);
    expect(parseMoney('1,234.56', 'INR')).toBe(123456);
    expect(parseMoney('12.345', 'INR')).toBeNull();
    expect(parseMoney('abc', 'INR')).toBeNull();
    expect(parseMoney('500', 'JPY')).toBe(500);
    expect(formatMoney(123456, 'INR')).toBe('₹1,234.56');
    expect(formatMoney(-5, 'USD')).toBe('−$0.05');
    expect(toDecimalString(30000, 'INR')).toBe('300.00');
  });
});
