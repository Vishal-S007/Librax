import { AlarmClock, BellRing, BookCheck, BookDown, CircleAlert, ListOrdered, Receipt, RefreshCw, Sparkles, type LucideIcon } from 'lucide-react';
import type { AppNotification, NotificationKind } from '@/types/models';
import { fmtRelative } from '@/lib/dates';
import { cn } from '@/lib/cn';

const META: Record<NotificationKind, { icon: LucideIcon; tone: string }> = {
  issued: { icon: BookDown, tone: 'text-sky bg-sky-soft' },
  returned: { icon: BookCheck, tone: 'text-sage bg-sage-soft' },
  due_soon: { icon: AlarmClock, tone: 'text-brass bg-brass-soft' },
  overdue: { icon: CircleAlert, tone: 'text-rose bg-rose-soft' },
  reservation_placed: { icon: ListOrdered, tone: 'text-sky bg-sky-soft' },
  reservation_ready: { icon: BellRing, tone: 'text-plum bg-plum-soft' },
  reservation_expired: { icon: ListOrdered, tone: 'text-rose bg-rose-soft' },
  reservation_cancelled: { icon: ListOrdered, tone: 'text-ink-muted bg-surface-sunken' },
  renewal_approved: { icon: RefreshCw, tone: 'text-sage bg-sage-soft' },
  renewal_rejected: { icon: RefreshCw, tone: 'text-rose bg-rose-soft' },
  fine_changed: { icon: Receipt, tone: 'text-brass bg-brass-soft' },
  system: { icon: Sparkles, tone: 'text-brass bg-brass-soft' },
};

export function NotificationRow({ n, onOpen, compact }: { n: AppNotification; onOpen: () => void; compact?: boolean }) {
  const m = META[n.kind];
  return (
    <li>
      <button onClick={onOpen} className={cn('flex w-full gap-3 text-left transition hover:bg-surface', compact ? 'px-4 py-3' : 'px-5 py-4')}>
        <span className={cn('mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', m.tone)}>
          <m.icon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            <span className={cn('truncate text-[13.5px]', n.read ? 'font-medium text-ink-muted' : 'font-semibold text-ink')}>{n.title}</span>
            {!n.read && <span className="h-2 w-2 shrink-0 rounded-full bg-brass" aria-label="Unread" />}
          </span>
          <span className={cn('mt-0.5 block text-[13px] leading-snug text-ink-muted', compact && 'line-clamp-2')}>{n.body}</span>
          <span className="mt-1 block text-[11px] text-ink-faint">{fmtRelative(n.createdAt)}</span>
        </span>
      </button>
    </li>
  );
}
