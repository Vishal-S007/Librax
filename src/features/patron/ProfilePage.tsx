import { Card, KeyValue, PageHeader } from '@/components/ui/Layout';
import { MemberStatusBadge } from '@/components/ui/Status';
import { borrowLimitFor, loanDaysFor, renewalLimitFor } from '@/services/common';
import { fmtDate } from '@/lib/dates';
import { usePatron } from './usePatron';

export default function ProfilePage() {
  const { data, member } = usePatron();
  if (!member) return <p className="text-ink-muted">Member record not found.</p>;
  const s = data.settings;
  return (
    <div>
      <PageHeader eyebrow="Account" title={member.name} description={`${member.memberNo} · ${member.department}`} actions={<MemberStatusBadge status={member.status} />} />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Details"><KeyValue items={[{ label: 'Email', value: member.email }, { label: 'Phone', value: member.phone ?? '—' }, { label: 'Membership', value: <span className="capitalize">{member.type}</span> }, { label: 'Member since', value: fmtDate(member.registeredAt) }]} /></Card>
        <Card title="Borrowing privileges"><KeyValue items={[{ label: 'Loan period', value: `${loanDaysFor(member, s)} days` }, { label: 'Items at once', value: borrowLimitFor(member, s) }, { label: 'Renewals per loan', value: renewalLimitFor(member, s) }, { label: 'Hold pickup window', value: `${s.pickupDays} days` }]} /></Card>
      </div>
      <p className="mt-4 text-xs text-ink-faint">Contact the library to update your details. This is a demonstration account stored only in this browser.</p>
    </div>
  );
}
