import type { Fine, FineKind, FineSettlement, LibraryData } from '@/types/models';
import { DomainError } from '@/lib/errors';
import { newId } from '@/lib/ids';
import { formatMoney } from '@/lib/money';
import { activeLoans, fineBalance, getFine, getMember, isOverdue, log, notify, overdueFine, type Ctx } from './common';

export function addManualFine(
  d: LibraryData,
  input: { memberId: string; amount: number; kind: Exclude<FineKind, 'overdue'>; description: string; loanId?: string },
  ctx: Ctx,
): Fine {
  const member = getMember(d, input.memberId);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new DomainError('Enter an amount greater than zero.', 'invalid_amount');
  if (!input.description.trim()) throw new DomainError('Add a short description.', 'missing_reason');
  const fine: Fine = {
    id: newId('fn'),
    memberId: member.id,
    loanId: input.loanId,
    kind: input.kind,
    assessed: input.amount,
    description: input.description.trim(),
    createdAt: ctx.now,
    adjustments: [],
    settlements: [],
  };
  d.fines.push(fine);
  const money = formatMoney(input.amount, d.settings.currency);
  log(d, ctx, 'fine.assessed', `${money} ${input.kind} charge for ${member.name}`, { kind: 'fine', id: fine.id, label: member.name }, {
    amount: input.amount, kind: input.kind,
  });
  notify(d, ctx, {
    recipient: member.id, kind: 'fine_changed', title: 'New charge on your account',
    body: `${money}: ${fine.description}`, link: { kind: 'fine', id: fine.id },
  });
  return fine;
}

/** Signed adjustment (negative reduces the balance). The balance may never drop below zero. */
export function adjustFine(d: LibraryData, fineId: string, input: { amount: number; reason: string }, ctx: Ctx): Fine {
  const fine = getFine(d, fineId);
  if (!Number.isSafeInteger(input.amount) || input.amount === 0) throw new DomainError('Adjustment must be a non-zero amount.', 'invalid_amount');
  if (input.reason.trim().length < 3) throw new DomainError('A reason is required for every adjustment.', 'missing_reason');
  if (fineBalance(fine) + input.amount < 0) throw new DomainError('The adjustment would make the balance negative.', 'negative_balance');
  fine.adjustments.push({ id: newId('adj'), amount: input.amount, reason: input.reason.trim(), at: ctx.now, by: ctx.actor.name });
  const member = getMember(d, fine.memberId);
  const money = formatMoney(input.amount, d.settings.currency);
  log(d, ctx, 'fine.adjusted', `Adjusted fine for ${member.name} by ${money}`, { kind: 'fine', id: fine.id, label: member.name }, {
    amount: input.amount, reason: input.reason.trim(), balance: fineBalance(fine),
  });
  notify(d, ctx, {
    recipient: fine.memberId, kind: 'fine_changed', title: 'Fine adjusted',
    body: `A charge was adjusted by ${money}. New balance: ${formatMoney(fineBalance(fine), d.settings.currency)}.`,
    link: { kind: 'fine', id: fine.id },
  });
  return fine;
}

export function waiveFine(d: LibraryData, fineId: string, reason: string, ctx: Ctx): Fine {
  const bal = fineBalance(getFine(d, fineId));
  if (bal <= 0) throw new DomainError('Nothing left to waive.', 'zero_balance');
  return adjustFine(d, fineId, { amount: -bal, reason: `Waived: ${reason}` }, ctx);
}

/** Records a payment taken at the desk. This is a local record only — no online payment is processed. */
export function settleFine(
  d: LibraryData,
  fineId: string,
  input: { amount: number; method: FineSettlement['method']; reference?: string },
  ctx: Ctx,
): Fine {
  const fine = getFine(d, fineId);
  const bal = fineBalance(fine);
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new DomainError('Enter an amount greater than zero.', 'invalid_amount');
  if (input.amount > bal) throw new DomainError(`Amount exceeds the outstanding balance of ${formatMoney(bal, d.settings.currency)}.`, 'overpayment');
  fine.settlements.push({
    id: newId('pay'), amount: input.amount, method: input.method, reference: input.reference?.trim() || undefined, at: ctx.now, by: ctx.actor.name,
  });
  const member = getMember(d, fine.memberId);
  const money = formatMoney(input.amount, d.settings.currency);
  log(d, ctx, 'fine.settled', `Recorded ${money} settlement from ${member.name}`, { kind: 'fine', id: fine.id, label: member.name }, {
    amount: input.amount, method: input.method, remaining: fineBalance(fine),
  });
  notify(d, ctx, {
    recipient: fine.memberId, kind: 'fine_changed', title: 'Payment recorded',
    body: `${money} was recorded at the desk. Remaining: ${formatMoney(fineBalance(fine), d.settings.currency)}.`,
    link: { kind: 'fine', id: fine.id },
  });
  return fine;
}

/** Fines currently accruing on overdue loans that have not been returned yet (not yet recorded). */
export function accruingFines(d: LibraryData, now: string, memberId?: string) {
  return activeLoans(d, memberId)
    .filter((l) => isOverdue(l, now))
    .map((l) => ({ loan: l, ...overdueFine(l.dueAt, now, d.settings) }))
    .filter((x) => x.amount > 0);
}
