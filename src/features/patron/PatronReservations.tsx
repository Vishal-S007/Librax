import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ListOrdered } from 'lucide-react';
import { useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { Card, PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { ReservationStatusBadge } from '@/components/ui/Status';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isOpen, queuePosition } from '@/services/reservations';
import { fmtDate } from '@/lib/dates';
import { usePatron } from './usePatron';

export default function PatronReservations() {
  const { data, memberId } = usePatron();
  const lib = useLibrary();
  const base = useBase();
  const { run } = useAction();
  const [cancel, setCancel] = useState<string | null>(null);
  const mine = data.reservations.filter((r) => r.memberId === memberId).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const open = mine.filter(isOpen);
  const closed = mine.filter((r) => !isOpen(r));
  const t = (id: string) => data.books.find((b) => b.id === id)?.title;
  const list = (rs: typeof mine, actions: boolean) => (
    <ul className="divide-y divide-line">
      {rs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5 text-sm">
          <div className="min-w-0 flex-1">
            <Link to={`${base}/books/${r.bookId}`} className="font-medium text-ink hover:text-brass">{t(r.bookId)}</Link>
            <p className="text-xs text-ink-muted">Placed {fmtDate(r.createdAt)}{r.status === 'waiting' ? ` · #${queuePosition(data, r)} in queue` : r.status === 'ready' ? ` · collect by ${fmtDate(r.pickupBy)}` : ''}</p>
          </div>
          <ReservationStatusBadge status={r.status} />
          {actions && <Button size="sm" variant="ghost" onClick={() => setCancel(r.id)}>Cancel</Button>}
        </li>
      ))}
    </ul>
  );
  return (
    <div>
      <PageHeader eyebrow="Account" title="My reservations" description={`Held copies wait ${data.settings.pickupDays} days for pickup before passing to the next person.`} />
      <Card title={`Open (${open.length})`} bodyClassName="p-0">{open.length ? list(open, true) : <EmptyState icon={ListOrdered} title="No open reservations" body="Reserve a title from its page when every copy is out." />}</Card>
      <Card title={`History (${closed.length})`} className="mt-6" bodyClassName="p-0">{closed.length ? list(closed, false) : <EmptyState icon={ListOrdered} title="No past reservations" />}</Card>
      <ConfirmDialog open={!!cancel} onClose={() => setCancel(null)} tone="danger" title="Cancel reservation?" body="You will lose your place in the queue." confirmLabel="Cancel reservation"
        onConfirm={() => { if (cancel) run(() => lib.cancelReservation(cancel), 'Reservation cancelled'); setCancel(null); }} />
    </div>
  );
}
