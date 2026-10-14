import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { BookMarked, Download, Repeat } from 'lucide-react';
import type { Loan } from '@/types/models';
import { useData, useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction } from '@/hooks/useAction';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import { LoanStateBadge } from '@/components/ui/Status';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { isOverdue, overdueFine } from '@/services/common';
import { exportLoansCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { daysUntil, fmtDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';

type State = 'active' | 'overdue' | 'returned' | 'all';

export default function LoansPage() {
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const base = useBase();
  const { run } = useAction();
  const navigate = useNavigate();
  const [state, setState] = useQueryState('state', 'active');
  const [q, setQ] = useQueryState('q');
  const [focus] = useQueryState('focus');
  const [returning, setReturning] = useState<Loan | null>(null);
  const dq = useDebounced(q).trim().toLowerCase();
  const books = useMemo(() => new Map(data.books.map((b) => [b.id, b])), [data.books]);
  const members = useMemo(() => new Map(data.members.map((m) => [m.id, m])), [data.members]);
  const copies = useMemo(() => new Map(data.copies.map((c) => [c.id, c])), [data.copies]);
  const cur = data.settings.currency;

  const counts = useMemo(() => ({
    active: data.loans.filter((l) => !l.returnedAt).length,
    overdue: data.loans.filter((l) => isOverdue(l, now)).length,
    returned: data.loans.filter((l) => l.returnedAt).length,
    all: data.loans.length,
  }), [data.loans, now]);

  const rows = useMemo(() => data.loans.filter((l) => {
    if (focus && l.id === focus) return true;
    if (state === 'active' && l.returnedAt) return false;
    if (state === 'overdue' && !isOverdue(l, now)) return false;
    if (state === 'returned' && !l.returnedAt) return false;
    if (!dq) return true;
    return `${books.get(l.bookId)?.title} ${members.get(l.memberId)?.name} ${members.get(l.memberId)?.memberNo} ${copies.get(l.copyId)?.barcode}`.toLowerCase().includes(dq);
  }), [data.loans, state, dq, books, members, copies, now, focus]);

  const columns: Column<Loan>[] = [
    {
      key: 'title', header: 'Title', sortValue: (l) => books.get(l.bookId)?.title ?? '', hideOnMobile: true,
      render: (l) => (
        <div className={l.id === focus ? 'rounded ring-2 ring-brass ring-offset-2 ring-offset-surface' : undefined}>
          <Link to={`${base}/books/${l.bookId}`} className="line-clamp-1 font-medium text-ink hover:text-brass">{books.get(l.bookId)?.title}</Link>
          <p className="font-mono text-xs text-ink-faint">{copies.get(l.copyId)?.barcode}</p>
        </div>
      ),
    },
    { key: 'member', header: 'Member', sortValue: (l) => members.get(l.memberId)?.name ?? '', render: (l) => <Link to={`${base}/members/${l.memberId}`} className="hover:text-brass">{members.get(l.memberId)?.name}</Link> },
    { key: 'issued', header: 'Issued', sortValue: (l) => l.issuedAt, render: (l) => <span className="text-ink-muted">{fmtDate(l.issuedAt)}</span>, className: 'hidden lg:table-cell', hideOnMobile: true },
    {
      key: 'due', header: state === 'returned' ? 'Returned' : 'Due', sortValue: (l) => (state === 'returned' ? l.returnedAt ?? '' : l.dueAt),
      render: (l) => {
        if (l.returnedAt) return <span className="text-ink-muted">{fmtDate(l.returnedAt)}</span>;
        const d = daysUntil(l.dueAt, now);
        return <span className={d < 0 ? 'text-rose' : 'text-ink-muted'}>{fmtDate(l.dueAt)}<span className="block text-[11px] text-ink-faint">{d < 0 ? `${-d}d late` : d === 0 ? 'today' : `in ${d}d`}</span></span>;
      },
    },
    {
      key: 'fine', header: 'Fine', align: 'right', sortValue: (l) => (l.returnedAt ? 0 : overdueFine(l.dueAt, now, data.settings).amount),
      render: (l) => {
        if (l.returnedAt) { const f = data.fines.find((x) => x.id === l.fineId); return f ? <span className="tabular">{formatMoney(f.assessed, cur)}</span> : <span className="text-ink-faint">—</span>; }
        const a = overdueFine(l.dueAt, now, data.settings).amount;
        return a ? <span className="text-rose tabular" title="Accruing — recorded on return">{formatMoney(a, cur)}*</span> : <span className="text-ink-faint">—</span>;
      },
    },
    { key: 'state', header: 'State', sortValue: (l) => (l.returnedAt ? 2 : isOverdue(l, now) ? 0 : 1), render: (l) => <LoanStateBadge loan={l} now={now} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (l) => (l.returnedAt ? null : (
        <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => run(() => lib.renew(l.id), (x) => `Renewed — due ${fmtDate(x.dueAt)}`, { errorTitle: 'Renewal refused' })}>Renew</Button>
          <Button size="sm" onClick={() => setReturning(l)}>Return</Button>
        </div>
      )),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Circulation"
        title="Loans"
        description="All circulation records. Fines marked * are accruing and are recorded when the item is returned."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-loans-${new Date().toISOString().slice(0, 10)}.csv`, exportLoansCsv(data, now))}>Export CSV</Button>
            <Button variant="primary" icon={<Repeat className="h-4 w-4" />} onClick={() => navigate(`${base}/circulation`)}>Circulation desk</Button>
          </>
        }
      />
      <Tabs label="Loan state" value={state as State} onChange={(v) => setState(v)} tabs={[
        { value: 'active', label: 'Active', count: counts.active },
        { value: 'overdue', label: 'Overdue', count: counts.overdue },
        { value: 'returned', label: 'Returned', count: counts.returned },
        { value: 'all', label: 'All', count: counts.all },
      ]} />
      <div className="card mt-4 overflow-hidden">
        <Toolbar><SearchInput value={q} onChange={setQ} label="Search loans" placeholder="Title, member, member number or barcode…" /></Toolbar>
        <DataTable
          caption="Loans"
          rows={rows}
          columns={columns}
          rowKey={(l) => l.id}
          initialSort={state === 'returned' ? { key: 'due', dir: 'desc' } : { key: 'due', dir: 'asc' }}
          resetKey={`${state}|${dq}`}
          pageSize={15}
          mobileTitle={(l) => <p className="font-medium text-ink">{books.get(l.bookId)?.title}</p>}
          empty={<EmptyState icon={BookMarked} title={state === 'overdue' ? 'Nothing overdue' : 'No loans here'} body={dq ? 'No loans match your search.' : state === 'overdue' ? 'Every active loan is within its due date.' : 'Issue a book from the circulation desk.'} />}
        />
      </div>
      <ConfirmDialog
        open={!!returning}
        onClose={() => setReturning(null)}
        title="Confirm return"
        body={returning ? <>Check in “{books.get(returning.bookId)?.title}” ({copies.get(returning.copyId)?.barcode}) from {members.get(returning.memberId)?.name}?{overdueFine(returning.dueAt, now, data.settings).amount > 0 && <> A fine of <strong className="text-ink">{formatMoney(overdueFine(returning.dueAt, now, data.settings).amount, cur)}</strong> will be recorded.</>}</> : ''}
        confirmLabel="Return book"
        onConfirm={() => {
          if (returning) run(() => lib.returnLoan(returning.id), (r) => `Returned${r.fine ? ` · fine ${formatMoney(r.fine.assessed, cur)}` : ''}${r.heldFor ? ' · held for next reservation' : ''}`);
          setReturning(null);
        }}
      />
    </div>
  );
}
