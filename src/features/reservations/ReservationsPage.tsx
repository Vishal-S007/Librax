import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookDown, Download, ListOrdered, Plus, X } from 'lucide-react';
import type { Reservation } from '@/types/models';
import { useData, useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction } from '@/hooks/useAction';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { ReservationStatusBadge } from '@/components/ui/Status';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { isOpen, queuePosition } from '@/services/reservations';
import { availabilityOf } from '@/services/common';
import { exportReservationsCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { fmtDate } from '@/lib/dates';
import { Info } from 'lucide-react';

type Status = 'open' | 'ready' | 'waiting' | 'closed' | 'all';

export default function ReservationsPage() {
  const data = useData();
  const lib = useLibrary();
  const base = useBase();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const [status, setStatus] = useQueryState('status', 'open');
  const [q, setQ] = useQueryState('q');
  const [cancelling, setCancelling] = useState<Reservation | null>(null);
  const [creating, setCreating] = useState(false);
  const [newMember, setNewMember] = useState('');
  const [newBook, setNewBook] = useState('');
  const dq = useDebounced(q).trim().toLowerCase();
  const books = useMemo(() => new Map(data.books.map((b) => [b.id, b])), [data.books]);
  const members = useMemo(() => new Map(data.members.map((m) => [m.id, m])), [data.members]);

  const match = (r: Reservation, s: string) =>
    s === 'all' || (s === 'open' && isOpen(r)) || (s === 'closed' && !isOpen(r)) || r.status === s;
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const s of ['open', 'ready', 'waiting', 'closed', 'all']) c[s] = data.reservations.filter((r) => match(r, s)).length;
    return c;
  }, [data.reservations]);

  const rows = useMemo(() => data.reservations
    .filter((r) => match(r, status))
    .filter((r) => !dq || `${books.get(r.bookId)?.title} ${members.get(r.memberId)?.name} ${members.get(r.memberId)?.memberNo}`.toLowerCase().includes(dq)),
  [data.reservations, status, dq, books, members]);

  const columns: Column<Reservation>[] = [
    { key: 'title', header: 'Title', sortValue: (r) => books.get(r.bookId)?.title ?? '', hideOnMobile: true, render: (r) => <Link to={`${base}/books/${r.bookId}`} className="line-clamp-1 font-medium text-ink hover:text-brass">{books.get(r.bookId)?.title}</Link> },
    { key: 'member', header: 'Member', sortValue: (r) => members.get(r.memberId)?.name ?? '', render: (r) => <Link to={`${base}/members/${r.memberId}`} className="hover:text-brass">{members.get(r.memberId)?.name}</Link> },
    { key: 'placed', header: 'Placed', sortValue: (r) => r.createdAt, render: (r) => <span className="text-ink-muted">{fmtDate(r.createdAt)}</span> },
    {
      key: 'queue', header: 'Queue / pickup', sortValue: (r) => r.pickupBy ?? String(queuePosition(data, r) ?? 99),
      render: (r) => r.status === 'waiting' ? <span className="tabular">#{queuePosition(data, r)}</span>
        : r.status === 'ready' ? <span className="text-plum">by {fmtDate(r.pickupBy)}</span>
          : <span className="text-ink-faint">{r.closedAt ? `closed ${fmtDate(r.closedAt)}` : '—'}</span>,
    },
    { key: 'status', header: 'Status', sortValue: (r) => r.status, render: (r) => <ReservationStatusBadge status={r.status} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (r) => !isOpen(r) ? null : (
        <div className="flex justify-end gap-1.5">
          {r.status === 'ready' && <Button size="sm" variant="subtle" icon={<BookDown className="h-3.5 w-3.5" />} onClick={() => navigate(`${base}/circulation?mode=issue&member=${r.memberId}`)}>Issue</Button>}
          <Button size="sm" variant="ghost" icon={<X className="h-3.5 w-3.5" />} onClick={() => setCancelling(r)}>Cancel</Button>
        </div>
      ),
    },
  ];

  const create = () => {
    const r = run(() => lib.reserve(newMember, newBook), (x) => (x.status === 'ready' ? 'Hold placed — a copy is waiting at the desk' : `Reservation placed · #${queuePosition(lib.store.getState(), x)} in queue`));
    if (r) { setCreating(false); setNewBook(''); setNewMember(''); }
  };
  const a = newBook ? availabilityOf(data, newBook) : null;

  return (
    <div>
      <PageHeader
        eyebrow="Circulation"
        title="Reservations"
        description="First-come, first-served queues per title. Returned copies are held automatically for the next active member."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-reservations-${new Date().toISOString().slice(0, 10)}.csv`, exportReservationsCsv(data))}>Export CSV</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>New reservation</Button>
          </>
        }
      />
      <Tabs label="Reservation status" value={status as Status} onChange={(v) => setStatus(v)} tabs={[
        { value: 'open', label: 'Open', count: counts.open },
        { value: 'ready', label: 'Ready', count: counts.ready },
        { value: 'waiting', label: 'Waiting', count: counts.waiting },
        { value: 'closed', label: 'History', count: counts.closed },
        { value: 'all', label: 'All', count: counts.all },
      ]} />
      <div className="card mt-4 overflow-hidden">
        <Toolbar><SearchInput value={q} onChange={setQ} label="Search reservations" placeholder="Title, member name or number…" /></Toolbar>
        <DataTable
          caption="Reservations"
          rows={rows}
          columns={columns}
          rowKey={(r) => r.id}
          initialSort={{ key: 'placed', dir: 'desc' }}
          resetKey={`${status}|${dq}`}
          mobileTitle={(r) => <p className="font-medium text-ink">{books.get(r.bookId)?.title}</p>}
          empty={<EmptyState icon={ListOrdered} title="No reservations here" body={dq ? 'Nothing matches your search.' : 'Reservations placed by members will appear here.'} />}
        />
      </div>

      <ConfirmDialog
        open={!!cancelling}
        onClose={() => setCancelling(null)}
        tone="danger"
        title="Cancel reservation?"
        body={cancelling ? <>{members.get(cancelling.memberId)?.name}’s reservation for “{books.get(cancelling.bookId)?.title}” will be cancelled and they will be notified.{cancelling.status === 'ready' && ' The held copy will pass to the next person in the queue, or back to the shelf.'}</> : ''}
        confirmLabel="Cancel reservation"
        onConfirm={() => { if (cancelling) run(() => lib.cancelReservation(cancelling.id), 'Reservation cancelled'); setCancelling(null); }}
      />

      <Dialog
        open={creating}
        onClose={() => setCreating(false)}
        busy={pending}
        title="New reservation"
        description="Place a reservation on behalf of a member."
        footer={<><Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button><Button variant="primary" disabled={!newMember || !newBook} loading={pending} onClick={create}>Place reservation</Button></>}
      >
        <div className="space-y-4">
          <Field label="Member" required>
            <SearchableSelect value={newMember} onChange={setNewMember} placeholder="Search members"
              options={data.members.filter((m) => m.status === 'active').map((m) => ({ value: m.id, label: m.name, description: `${m.memberNo} · ${m.type}` }))} />
          </Field>
          <Field label="Title" required>
            <SearchableSelect value={newBook} onChange={setNewBook} placeholder="Search the catalog"
              options={data.books.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.title, description: b.authors.join(', ') }))} />
          </Field>
          {a && (
            <Callout tone="sky" icon={Info}>
              {a.available > 0 && a.waiting === 0 ? 'A copy is on the shelf — it will be placed on hold immediately.' : `All copies are out. The member will join a queue of ${a.waiting}.`}
            </Callout>
          )}
        </div>
      </Dialog>
    </div>
  );
}
