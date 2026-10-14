import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, BookOpen, IdCard, Mail, Pencil, Phone, Power, Receipt, Repeat, UserX } from 'lucide-react';
import { printMemberCards } from '@/lib/printLabels';
import { useToast } from '@/components/ui/Toast';
import type { MemberStatus } from '@/types/models';
import { useData, useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { Card, KeyValue, StatCard, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { FineStatusBadge, LoanStateBadge, MemberStatusBadge, ReservationStatusBadge } from '@/components/ui/Status';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { activeLoans, borrowLimitFor, fineBalance, fineStatus, isOverdue, loanDaysFor, memberBalance, renewalLimitFor } from '@/services/common';
import { queuePosition } from '@/services/reservations';
import { accruingFines } from '@/services/fines';
import { formatMoney } from '@/lib/money';
import { fmtDate, daysUntil } from '@/lib/dates';
import { initials } from '@/components/layout/ProfileMenu';
import { MemberForm } from './MemberForm';

export default function MemberDetailPage() {
  const { id = '' } = useParams();
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const base = useBase();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [statusTo, setStatusTo] = useState<MemberStatus | null>(null);
  const [returning, setReturning] = useState<string | null>(null);
  const [tab, setTab] = useState<'loans' | 'history' | 'reservations' | 'fines'>('loans');
  const member = data.members.find((m) => m.id === id);
  const cur = data.settings.currency;

  const loans = useMemo(() => activeLoans(data, id).sort((a, b) => a.dueAt.localeCompare(b.dueAt)), [data, id]);
  const history = useMemo(() => data.loans.filter((l) => l.memberId === id && l.returnedAt).sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? '')), [data.loans, id]);
  const reservations = useMemo(() => data.reservations.filter((r) => r.memberId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.reservations, id]);
  const fines = useMemo(() => data.fines.filter((f) => f.memberId === id).sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [data.fines, id]);
  const accruing = useMemo(() => accruingFines(data, now, id).reduce((a, b) => a + b.amount, 0), [data, now, id]);

  if (!member) {
    return <div className="card"><EmptyState icon={UserX} title="Member not found" action={<Button onClick={() => navigate(`${base}/members`)}>Back to members</Button>} /></div>;
  }
  const title = (bookId: string) => data.books.find((b) => b.id === bookId)?.title ?? 'Unknown title';
  const balance = memberBalance(data, id);
  const returningLoan = loans.find((l) => l.id === returning);

  return (
    <div>
      <button onClick={() => navigate(`${base}/members`)} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Members
      </button>

      <section className="card mb-6 flex flex-col gap-5 p-6 md:flex-row md:items-center">
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-brass to-[rgb(var(--sage))] font-display text-xl text-brass-ink">{initials(member.name)}</span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl text-ink">{member.name}</h1>
            <MemberStatusBadge status={member.status} />
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            <span className="font-mono">{member.memberNo}</span> · <span className="capitalize">{member.type}</span> · {member.department}
          </p>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-muted">
            <span className="inline-flex items-center gap-1.5"><Mail className="h-3.5 w-3.5" />{member.email}</span>
            {member.phone && <span className="inline-flex items-center gap-1.5"><Phone className="h-3.5 w-3.5" />{member.phone}</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="primary" icon={<BookOpen className="h-4 w-4" />} disabled={member.status !== 'active'} onClick={() => navigate(`${base}/circulation?mode=issue&member=${member.id}`)}>Issue book</Button>
          <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit</Button>
          <Button icon={<IdCard className="h-4 w-4" />} onClick={() => {
            if (!printMemberCards([member], data.settings.libraryName)) toast.error('Pop-up blocked', 'Allow pop-ups for this site to print the card.');
          }}>Print card</Button>
          {member.status === 'active' ? (
            <>
              <Button variant="ghost" icon={<Power className="h-4 w-4" />} onClick={() => setStatusTo('inactive')}>Deactivate</Button>
              <Button variant="ghost" onClick={() => setStatusTo('suspended')}>Suspend</Button>
            </>
          ) : (
            <Button variant="subtle" icon={<Power className="h-4 w-4" />} onClick={() => setStatusTo('active')}>Reactivate</Button>
          )}
        </div>
      </section>

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="On loan" value={`${loans.length}/${borrowLimitFor(member, data.settings)}`} hint={`${loanDaysFor(member, data.settings)}-day loan period`} icon={BookOpen} tone="sky" />
        <StatCard label="Overdue" value={loans.filter((l) => isOverdue(l, now)).length} icon={Repeat} tone="rose" />
        <StatCard label="Outstanding" value={formatMoney(balance, cur)} hint={accruing ? `+${formatMoney(accruing, cur)} accruing` : undefined} icon={Receipt} tone="brass" to={`${base}/fines?q=${encodeURIComponent(member.memberNo)}`} />
        <StatCard label="Lifetime loans" value={history.length + loans.length} hint={`Member since ${fmtDate(member.registeredAt)}`} icon={BookOpen} tone="sage" />
      </div>

      <Tabs
        label="Member records"
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'loans', label: 'Current loans', count: loans.length },
          { value: 'history', label: 'History', count: history.length },
          { value: 'reservations', label: 'Reservations', count: reservations.length },
          { value: 'fines', label: 'Fines', count: fines.length },
        ]}
      />

      <div className="mt-4">
        {tab === 'loans' && (
          <Card bodyClassName="p-0">
            {loans.length === 0 ? <EmptyState icon={BookOpen} title="No books on loan" /> : (
              <ul className="divide-y divide-line">
                {loans.map((l) => {
                  const d = daysUntil(l.dueAt, now);
                  return (
                    <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                      <div className="min-w-0 flex-1">
                        <Link to={`${base}/books/${l.bookId}`} className="font-medium text-ink hover:text-brass">{title(l.bookId)}</Link>
                        <p className="text-xs text-ink-muted">
                          <span className="font-mono">{data.copies.find((c) => c.id === l.copyId)?.barcode}</span> · issued {fmtDate(l.issuedAt)} · due {fmtDate(l.dueAt)}
                          {' · '}{d < 0 ? `${-d} days late` : d === 0 ? 'due today' : `${d} days left`} · renewals {l.renewals}/{renewalLimitFor(member, data.settings)}
                        </p>
                      </div>
                      <LoanStateBadge loan={l} now={now} />
                      <Button size="sm" onClick={() => run(() => lib.renew(l.id), (x) => `Renewed — now due ${fmtDate(x.dueAt)}`)} disabled={pending}>Renew</Button>
                      <Button size="sm" variant="primary" onClick={() => setReturning(l.id)}>Return</Button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
        )}
        {tab === 'history' && (
          <Card bodyClassName="p-0">
            {history.length === 0 ? <EmptyState icon={BookOpen} title="No returned loans yet" /> : (
              <ul className="divide-y divide-line">
                {history.slice(0, 50).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Link to={`${base}/books/${l.bookId}`} className="min-w-0 flex-1 truncate text-ink hover:text-brass">{title(l.bookId)}</Link>
                    <span className="text-xs text-ink-muted">{fmtDate(l.issuedAt)} → {fmtDate(l.returnedAt)}</span>
                    {l.fineId && <span className="text-xs text-rose">late</span>}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {tab === 'reservations' && (
          <Card bodyClassName="p-0">
            {reservations.length === 0 ? <EmptyState icon={BookOpen} title="No reservations" /> : (
              <ul className="divide-y divide-line">
                {reservations.map((r) => (
                  <li key={r.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Link to={`${base}/books/${r.bookId}`} className="min-w-0 flex-1 truncate text-ink hover:text-brass">{title(r.bookId)}</Link>
                    <span className="text-xs text-ink-muted">placed {fmtDate(r.createdAt)}{r.status === 'waiting' ? ` · #${queuePosition(data, r)} in queue` : r.status === 'ready' ? ` · pickup by ${fmtDate(r.pickupBy)}` : ''}</span>
                    <ReservationStatusBadge status={r.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
        {tab === 'fines' && (
          <Card bodyClassName="p-0" action={<Link to={`${base}/fines?q=${encodeURIComponent(member.memberNo)}`} className="text-xs font-medium text-brass">Manage fines</Link>} title="Fines">
            {fines.length === 0 ? <EmptyState icon={Receipt} title="No fines on record" /> : (
              <ul className="divide-y divide-line">
                {fines.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0 flex-1"><p className="truncate text-ink">{f.description}</p><p className="text-xs text-ink-faint">{fmtDate(f.createdAt)} · assessed {formatMoney(f.assessed, cur)}</p></div>
                    <span className="tabular text-ink">{formatMoney(fineBalance(f), cur)}</span>
                    <FineStatusBadge status={fineStatus(f)} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>

      <Card title="Profile" className="mt-6">
        <KeyValue items={[
          { label: 'Registered', value: fmtDate(member.registeredAt) },
          { label: 'Last updated', value: fmtDate(member.updatedAt) },
          { label: 'Borrowing limit', value: member.borrowLimit ? `${member.borrowLimit} (override)` : `${borrowLimitFor(member, data.settings)} (policy)` },
          { label: 'Renewals allowed per loan', value: renewalLimitFor(member, data.settings) },
        ]} />
      </Card>

      <MemberForm key={member.updatedAt} open={editing} onClose={() => setEditing(false)} member={member} />
      <ConfirmDialog
        open={!!statusTo}
        onClose={() => setStatusTo(null)}
        tone={statusTo === 'active' ? 'primary' : 'danger'}
        title={statusTo === 'active' ? `Reactivate ${member.name}?` : `${statusTo === 'suspended' ? 'Suspend' : 'Deactivate'} ${member.name}?`}
        body={statusTo === 'active'
          ? 'They will be able to borrow and reserve again.'
          : `They will not be able to borrow or reserve. Open reservations will be cancelled and held copies passed to the next person. Their ${loans.length} current loan(s) and all history are kept.`}
        confirmLabel={statusTo === 'active' ? 'Reactivate' : statusTo === 'suspended' ? 'Suspend' : 'Deactivate'}
        onConfirm={() => {
          if (statusTo) run(() => lib.setMemberStatus(member.id, statusTo), (r) => `${r.member.name} is now ${r.member.status}${r.cancelledReservations ? ` · ${r.cancelledReservations} reservation(s) cancelled` : ''}`);
          setStatusTo(null);
        }}
      />
      <ConfirmDialog
        open={!!returningLoan}
        onClose={() => setReturning(null)}
        title="Confirm return"
        body={returningLoan ? `Check in “${title(returningLoan.bookId)}” from ${member.name}? Any overdue fine is calculated with the current policy.` : ''}
        confirmLabel="Return book"
        onConfirm={() => {
          if (returningLoan) run(() => lib.returnLoan(returningLoan.id), (r) => `Returned${r.fine ? ` · fine ${formatMoney(r.fine.assessed, cur)}` : ''}${r.heldFor ? ' · held for next reservation' : ''}`);
          setReturning(null);
        }}
      />
    </div>
  );
}
