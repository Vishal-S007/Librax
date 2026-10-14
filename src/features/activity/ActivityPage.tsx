import { useMemo } from 'react';
import { Activity as ActivityIcon } from 'lucide-react';
import type { Activity } from '@/types/models';
import { useData } from '@/app/providers';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/ui/Layout';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import { Badge, type Tone } from '@/components/ui/Badge';
import { fmtDateTime } from '@/lib/dates';
import { ROLE_LABEL } from '@/services/session';

const GROUPS: { value: string; label: string; tone: Tone }[] = [
  { value: 'book', label: 'Catalog', tone: 'brass' },
  { value: 'copy', label: 'Inventory', tone: 'sky' },
  { value: 'member', label: 'Members', tone: 'plum' },
  { value: 'loan', label: 'Circulation', tone: 'sage' },
  { value: 'reservation', label: 'Reservations', tone: 'plum' },
  { value: 'fine', label: 'Fines', tone: 'rose' },
  { value: 'course', label: 'Course reserves', tone: 'plum' },
  { value: 'settings', label: 'Settings', tone: 'neutral' },
  { value: 'data', label: 'Data', tone: 'neutral' },
];

export default function ActivityPage() {
  const data = useData();
  const [q, setQ] = useQueryState('q');
  const [group, setGroup] = useQueryState('type', 'all');
  const dq = useDebounced(q).trim().toLowerCase();
  const rows = useMemo(() => data.activity.filter((a) => (group === 'all' || a.type.startsWith(`${group}.`)) &&
    (!dq || `${a.summary} ${a.actor.name} ${a.entity?.label ?? ''} ${Object.values(a.meta ?? {}).join(' ')}`.toLowerCase().includes(dq))), [data.activity, group, dq]);
  const columns: Column<Activity>[] = [
    { key: 'at', header: 'When', sortValue: (a) => a.at, render: (a) => <span className="whitespace-nowrap text-ink-muted">{fmtDateTime(a.at)}</span> },
    { key: 'type', header: 'Area', sortValue: (a) => a.type, render: (a) => { const g = GROUPS.find((x) => a.type.startsWith(`${x.value}.`)); return <Badge tone={g?.tone ?? 'neutral'}>{a.type}</Badge>; } },
    {
      key: 'summary', header: 'Event', hideOnMobile: true,
      render: (a) => (
        <div><p className="text-ink">{a.summary}</p>
          {a.meta && <p className="mt-0.5 line-clamp-2 text-xs text-ink-faint">{Object.entries(a.meta).map(([k, v]) => `${k}: ${v}`).join(' · ')}</p>}
        </div>
      ),
    },
    { key: 'actor', header: 'Actor', sortValue: (a) => a.actor.name, render: (a) => <span className="text-ink-muted">{a.actor.name}<span className="block text-[11px] text-ink-faint">{ROLE_LABEL[a.actor.role]}</span></span> },
  ];
  return (
    <div>
      <PageHeader eyebrow="Audit" title="Activity log" description={`${data.activity.length} recorded operations. Actors are demonstration identities; no secrets are logged.`} />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} label="Search activity" placeholder="Search events, people, titles…" />
          <FilterSelect label="Area" value={group} onChange={setGroup} options={[{ value: 'all', label: 'All areas' }, ...GROUPS.map((g) => ({ value: g.value, label: g.label }))]} />
        </Toolbar>
        <DataTable caption="Activity log" rows={rows} columns={columns} rowKey={(a) => a.id} initialSort={{ key: 'at', dir: 'desc' }} pageSize={20} resetKey={`${group}|${dq}`}
          mobileTitle={(a) => <p className="text-ink">{a.summary}</p>}
          empty={<EmptyState icon={ActivityIcon} title="No matching activity" />} />
      </div>
    </div>
  );
}
