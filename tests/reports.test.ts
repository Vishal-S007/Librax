import { describe, expect, it } from 'vitest';
import { categoryPopularity, circulationTrend, dashboardMetrics, fineSummary, inventoryDistribution, topBooks } from '@/services/reports';
import { issueLoan, returnLoan } from '@/services/circulation';
import { emptyData } from '@/repositories/schema';
import { ctx, ctxAt, daysFrom, NOW, seed, tiny } from './helpers';

describe('dashboard metrics and reports', () => {
  it('are calculated from records and update when data changes', () => {
    const d = tiny();
    const before = dashboardMetrics(d, NOW);
    expect(before).toMatchObject({ titles: 1, copies: 2, available: 2, borrowed: 0, overdue: 0 });
    const { loan } = issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctxAt(daysFrom(NOW, -20)));
    const after = dashboardMetrics(d, NOW);
    expect(after).toMatchObject({ available: 1, borrowed: 1, overdue: 1 });
    expect(after.accruing).toBeGreaterThan(0);
    returnLoan(d, loan.id, ctx);
    expect(dashboardMetrics(d, NOW).outstandingFines).toBeGreaterThan(0);
  });

  it('handle an empty library without errors', () => {
    const d = emptyData();
    expect(dashboardMetrics(d, NOW).titles).toBe(0);
    const range = { from: daysFrom(NOW, -30), to: NOW };
    expect(circulationTrend(d, range).every((b) => b.issued === 0)).toBe(true);
    expect(topBooks(d, range)).toEqual([]);
    expect(inventoryDistribution(d).every((x) => x.count === 0)).toBe(true);
  });

  it('respect date ranges on the seeded library', () => {
    const d = seed();
    const all = { from: '2000-01-01T00:00:00.000Z', to: NOW };
    const none = { from: '2001-01-01T00:00:00.000Z', to: '2001-02-01T00:00:00.000Z' };
    const issuedAll = circulationTrend(d, all).reduce((a, b) => a + b.issued, 0);
    expect(issuedAll).toBe(d.loans.length);
    expect(categoryPopularity(d, none)).toEqual([]);
    expect(fineSummary(d, all).assessed).toBeGreaterThan(0);
  });
});
