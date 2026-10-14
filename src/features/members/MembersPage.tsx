import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Download, UserPlus, Users } from 'lucide-react';
import type { Member } from '@/types/models';
import { useData, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import { MemberStatusBadge } from '@/components/ui/Status';
import { Badge } from '@/components/ui/Badge';
import { searchMembers } from '@/services/members';
import { activeLoans, borrowLimitFor, isOverdue, memberBalance } from '@/services/common';
import { exportMembersCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { formatMoney } from '@/lib/money';
import { initials } from '@/components/layout/ProfileMenu';
import { MemberForm } from './MemberForm';

export default function MembersPage() {
  const data = useData();
  const now = useNow();
  const base = useBase();
  const navigate = useNavigate();
  const [q, setQ] = useQueryState('q');
  const [type, setType] = useQueryState('type', 'all');
  const [status, setStatus] = useQueryState('status', 'all');
  const [isNew, setNew] = useQueryState('new');
  const dq = useDebounced(q);
  const cur = data.settings.currency;

  const rows = useMemo(() => searchMembers(data, { q: dq, type: type as Member['type'] | 'all', status: status as Member['status'] | 'all' }), [data, dq, type, status]);

  const columns: Column<Member>[] = [
    {
      key: 'name', header: 'Member', sortValue: (m) => m.name, hideOnMobile: true,
      render: (m) => (
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-[11px] font-semibold text-ink-muted">{initials(m.name)}</span>
          <div className="min-w-0"><p className="truncate font-medium text-ink">{m.name}</p><p className="truncate text-xs text-ink-faint">{m.email}</p></div>
        </div>
      ),
    },
    { key: 'no', header: 'Member no.', sortValue: (m) => m.memberNo, render: (m) => <span className="font-mono text-xs text-ink-muted">{m.memberNo}</span> },
    { key: 'type', header: 'Type', sortValue: (m) => m.type, render: (m) => <span className="capitalize text-ink-muted">{m.type}</span> },
    { key: 'dept', header: 'Department', sortValue: (m) => m.department, render: (m) => <span className="text-ink-muted">{m.department}</span>, className: 'hidden lg:table-cell', hideOnMobile: true },
    {
      key: 'loans', header: 'Loans', sortValue: (m) => activeLoans(data, m.id).length, align: 'right',
      render: (m) => {
        const loans = activeLoans(data, m.id);
        const od = loans.filter((l) => isOverdue(l, now)).length;
        return <span className="tabular">{loans.length}/{borrowLimitFor(m, data.settings)}{od > 0 && <Badge tone="rose" className="ml-2">{od} overdue</Badge>}</span>;
      },
    },
    { key: 'fines', header: 'Owed', sortValue: (m) => memberBalance(data, m.id), align: 'right', render: (m) => { const b = memberBalance(data, m.id); return <span className={b ? 'text-rose' : 'text-ink-faint'}>{b ? formatMoney(b, cur) : '—'}</span>; } },
    { key: 'status', header: 'Status', sortValue: (m) => m.status, render: (m) => <MemberStatusBadge status={m.status} /> },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="People"
        title="Members"
        description={`${data.members.filter((m) => m.status === 'active').length} active of ${data.members.length} registered members.`}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-members-${new Date().toISOString().slice(0, 10)}.csv`, exportMembersCsv(data))}>Export CSV</Button>
            <Button variant="primary" icon={<UserPlus className="h-4 w-4" />} onClick={() => setNew('1')}>Register member</Button>
          </>
        }
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} label="Search members" placeholder="Name, email, member number, department…" />
          <FilterSelect label="Membership type" value={type} onChange={setType} options={[{ value: 'all', label: 'All types' }, { value: 'student', label: 'Students' }, { value: 'faculty', label: 'Faculty' }, { value: 'staff', label: 'Staff' }]} />
          <FilterSelect label="Account status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, { value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }, { value: 'suspended', label: 'Suspended' }]} />
        </Toolbar>
        <DataTable
          caption="Members"
          rows={rows}
          columns={columns}
          rowKey={(m) => m.id}
          onRowClick={(m) => navigate(`${base}/members/${m.id}`)}
          resetKey={`${dq}|${type}|${status}`}
          mobileTitle={(m) => <div><p className="font-medium text-ink">{m.name}</p><p className="text-xs text-ink-faint">{m.email}</p></div>}
          empty={<EmptyState icon={Users} title={q || type !== 'all' || status !== 'all' ? 'No members match' : 'No members yet'} body="Adjust the filters or register a new member."
            action={<Button variant="primary" onClick={() => setNew('1')}>Register member</Button>} />}
        />
      </div>
      <MemberForm key={`new-${isNew}`} open={isNew === '1'} onClose={() => setNew('')} onSaved={(m) => navigate(`${base}/members/${m.id}`)} />
    </div>
  );
}
