import { describe, expect, it } from 'vitest';
import { issueLoan, returnLoan } from '@/services/circulation';
import { cancelReservation, expireReservations, placeReservation, queuePosition } from '@/services/reservations';
import { changeCopyStatus } from '@/services/inventory';
import { setMemberStatus } from '@/services/members';
import { assertConsistent, ctx, ctxAt, daysFrom, NOW, tiny } from './helpers';

function allOut() {
  const d = tiny();
  issueLoan(d, { memberId: 's1', copyId: 'c1' }, ctx);
  const l2 = issueLoan(d, { memberId: 's2', copyId: 'c2' }, ctx).loan;
  return { d, l2 };
}

describe('reservation queue', () => {
  it('queues first-come first-served and reports positions', () => {
    const { d } = allOut();
    const a = placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctxAt(daysFrom(NOW, 1)));
    const b = placeReservation(d, { memberId: 'f1', bookId: 'b1' }, ctxAt(daysFrom(NOW, 2)));
    expect(queuePosition(d, a)).toBe(1);
    expect(queuePosition(d, b)).toBe(2);
  });

  it('prevents duplicate open reservations and reserving a title already on loan', () => {
    const { d } = allOut();
    placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    expect(() => placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx)).toThrow(/already have an open/);
    expect(() => placeReservation(d, { memberId: 's1', bookId: 'b1' }, ctx)).toThrow(/on loan/);
  });

  it('holds a returned copy for the first in line and keeps records consistent', () => {
    const { d, l2 } = allOut();
    const a = placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    placeReservation(d, { memberId: 'f1', bookId: 'b1' }, ctxAt(daysFrom(NOW, 1)));
    const r = returnLoan(d, l2.id, ctxAt(daysFrom(NOW, 2)));
    expect(r.heldFor?.id).toBe(a.id);
    expect(d.copies.find((c) => c.id === 'c2')!.status).toBe('on_hold');
    expect(d.reservations.find((x) => x.id === a.id)!.status).toBe('ready');
    expect(d.notifications.some((n) => n.recipient === 's3' && n.kind === 'reservation_ready')).toBe(true);
    assertConsistent(d);
  });

  it('skips inactive members in the queue', () => {
    const { d, l2 } = allOut();
    placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    const b = placeReservation(d, { memberId: 'f1', bookId: 'b1' }, ctxAt(daysFrom(NOW, 1)));
    setMemberStatus(d, 's3', 'suspended', ctx);
    const r = returnLoan(d, l2.id, ctxAt(daysFrom(NOW, 2)));
    expect(r.heldFor?.id).toBe(b.id);
    assertConsistent(d);
  });

  it('passes a held copy on when a ready reservation is cancelled', () => {
    const { d, l2 } = allOut();
    const a = placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    const b = placeReservation(d, { memberId: 'f1', bookId: 'b1' }, ctxAt(daysFrom(NOW, 1)));
    returnLoan(d, l2.id, ctxAt(daysFrom(NOW, 2)));
    cancelReservation(d, a.id, ctxAt(daysFrom(NOW, 3)));
    expect(d.reservations.find((x) => x.id === b.id)!.status).toBe('ready');
    expect(d.copies.find((c) => c.id === 'c2')!.status).toBe('on_hold');
    assertConsistent(d);
  });

  it('expires uncollected holds after the pickup window', () => {
    const { d, l2 } = allOut();
    const a = placeReservation(d, { memberId: 's3', bookId: 'b1' }, ctx);
    returnLoan(d, l2.id, ctxAt(daysFrom(NOW, 1)));
    expect(expireReservations(d, ctxAt(daysFrom(NOW, 2)))).toBe(0);
    expect(expireReservations(d, ctxAt(daysFrom(NOW, 1 + d.settings.pickupDays + 1)))).toBe(1);
    expect(d.reservations.find((x) => x.id === a.id)!.status).toBe('expired');
    expect(d.copies.find((c) => c.id === 'c2')!.status).toBe('available');
    assertConsistent(d);
  });

  it('places an immediate hold when a copy is on the shelf', () => {
    const d = tiny();
    const r = placeReservation(d, { memberId: 's1', bookId: 'b1' }, ctx);
    expect(r.status).toBe('ready');
    expect(d.copies.filter((c) => c.status === 'on_hold')).toHaveLength(1);
    assertConsistent(d);
  });

  it('serves the queue when a repaired copy returns to the shelf', () => {
    const d = tiny();
    changeCopyStatus(d, 'c1', 'maintenance', ctx);
    issueLoan(d, { memberId: 's1', copyId: 'c2' }, ctx);
    const r = placeReservation(d, { memberId: 's2', bookId: 'b1' }, ctx);
    expect(r.status).toBe('waiting');
    changeCopyStatus(d, 'c1', 'available', ctx);
    expect(d.reservations[0]!.status).toBe('ready');
    assertConsistent(d);
  });
});
