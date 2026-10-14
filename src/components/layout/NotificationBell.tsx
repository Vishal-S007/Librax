import { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, CheckCheck } from 'lucide-react';
import { useData, useLibrary } from '@/app/providers';
import { useBase, useLinkFor, useRecipients } from '@/hooks/useRole';
import { Popover } from './Popover';
import { NotificationRow } from '@/features/notifications/NotificationRow';
import { EmptyState } from '@/components/ui/Feedback';

export function NotificationBell() {
  const [open, setOpen] = useState(false);
  const data = useData();
  const lib = useLibrary();
  const recipients = useRecipients();
  const linkFor = useLinkFor();
  const navigate = useNavigate();
  const base = useBase();
  const mine = useMemo(() => data.notifications.filter((n) => recipients.includes(n.recipient)), [data.notifications, recipients]);
  const unread = mine.filter((n) => !n.read).length;
  const close = useCallback(() => setOpen(false), []);
  const inboxPath = `${base}/notifications`;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-control p-2 text-ink-muted transition hover:bg-surface-raised hover:text-ink"
        aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <Bell className="h-5 w-5" />
        {unread > 0 && (
          <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brass px-1 text-[10px] font-bold text-brass-ink tabular">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      <Popover open={open} onClose={close} label="Notifications" className="w-[min(92vw,400px)]">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold text-ink">Notifications</p>
          <button
            onClick={() => lib.markAllRead(recipients)}
            disabled={unread === 0}
            className="flex items-center gap-1 text-xs font-medium text-brass disabled:text-ink-faint"
          >
            <CheckCheck className="h-3.5 w-3.5" /> Mark all read
          </button>
        </div>
        <div className="max-h-[60vh] overflow-y-auto">
          {mine.length === 0 ? (
            <EmptyState icon={Bell} title="You're all caught up" body="New activity on your account will appear here." />
          ) : (
            <ul className="divide-y divide-line">
              {mine.slice(0, 8).map((n) => (
                <NotificationRow
                  key={n.id}
                  n={n}
                  compact
                  onOpen={() => {
                    if (!n.read) lib.markRead([n.id]);
                    const to = linkFor(n.link);
                    setOpen(false);
                    if (to) navigate(to);
                  }}
                />
              ))}
            </ul>
          )}
        </div>
        <div className="border-t border-line p-2">
          <button onClick={() => { setOpen(false); navigate(inboxPath); }} className="w-full rounded-control py-2 text-center text-[13px] font-medium text-ink-muted hover:bg-surface hover:text-ink">
            View all notifications
          </button>
        </div>
      </Popover>
    </div>
  );
}
