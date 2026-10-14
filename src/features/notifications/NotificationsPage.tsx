import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useData, useLibrary } from '@/app/providers';
import { useLinkFor, useRecipients } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { NotificationRow } from './NotificationRow';

export default function NotificationsPage() {
  const data = useData();
  const lib = useLibrary();
  const navigate = useNavigate();
  const recipients = useRecipients();
  const linkFor = useLinkFor();
  const [filter, setFilter] = useQueryState('show', 'all');
  const mine = useMemo(() => data.notifications.filter((n) => recipients.includes(n.recipient)), [data.notifications, recipients]);
  const unread = mine.filter((n) => !n.read).length;
  const list = filter === 'unread' ? mine.filter((n) => !n.read) : mine;
  return (
    <div>
      <PageHeader eyebrow="Inbox" title="Notifications" description="Due dates, holds, renewals and account changes. Reminders are generated once per due date."
        actions={<Button icon={<CheckCheck className="h-4 w-4" />} disabled={unread === 0} onClick={() => lib.markAllRead(recipients)}>Mark all read</Button>} />
      <Tabs label="Filter notifications" value={filter as 'all'} onChange={(v) => setFilter(v)} tabs={[{ value: 'all', label: 'All', count: mine.length }, { value: 'unread', label: 'Unread', count: unread }]} />
      <div className="card mt-4 overflow-hidden">
        {list.length === 0 ? <EmptyState icon={Bell} title={filter === 'unread' ? 'No unread notifications' : 'No notifications yet'} /> : (
          <ul className="divide-y divide-line">
            {list.slice(0, 200).map((n) => (
              <NotificationRow key={n.id} n={n} onOpen={() => { if (!n.read) lib.markRead([n.id]); const to = linkFor(n.link); if (to) navigate(to); }} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
