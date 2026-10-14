import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { subMonths } from 'date-fns';
import {
  AlarmClock, ArrowRight, BookCopy, BookOpen, BookPlus, CircleCheck, ClipboardList, Hourglass, ListOrdered, Receipt,
  Repeat, UserPlus, Users,
} from 'lucide-react';
import { useData, useNow, useSession } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { Card, PageHeader, StatCard } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { TrendChart, HBarChart, DonutChart } from '@/components/charts/Charts';
import { circulationTrend, dashboardMetrics, inventoryDistribution, overdueList, topBooks, categoryPopularity } from '@/services/reports';
import { COPY_STATUS_LABEL } from '@/services/inventory';
import { formatMoney } from '@/lib/money';
import { fmtDate, fmtRelative, toDate } from '@/lib/dates';
import { BookCover } from '@/components/books/BookCover';
import { queueFor } from '@/services/reservations';

export default function StaffDashboard() {
  const data = useData();
  const now = useNow();
  const session = useSession();
  const base = useBase();
  const cur = data.settings.currency;

  const m = useMemo(() => dashboardMetrics(data, now), [data, now]);
  const range = useMemo(() => ({ from: subMonths(toDate(now), 6).toISOString(), to: now }), [now]);
  const trend = useMemo(() => circulationTrend(data, range), [data, range]);
  const top = useMemo(() => topBooks(data, range, 6), [data, range]);
  const cats = useMemo(() => categoryPopularity(data, range).slice(0, 6), [data, range]);
  const inv = useMemo(() => inventoryDistribution(data).filter((x) => x.count > 0), [data]);
  const overdue = useMemo(() => overdueList(data, now).slice(0, 5), [data, now]);
  const readyHolds = useMemo(() => data.reservations.filter((r) => r.status === 'ready').sort((a, b) => (a.pickupBy ?? '').localeCompare(b.pickupBy ?? '')).slice(0, 5), [data.reservations]);
  const queues = useMemo(() => {
    const ids = [...new Set(data.reservations.filter((r) => r.status === 'waiting').map((r) => r.bookId))];
    return ids.map((id) => ({ book: data.books.find((b) => b.id === id)!, n: queueFor(data, id).length })).filter((x) => x.book).sort((a, b) => b.n - a.n).slice(0, 4);
  }, [data]);
  const recent = data.activity.slice(0, 7);
  const greeting = (() => {
    const h = toDate(now).getHours();
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
  })();

  const quick = [
    { to: `${base}/circulation?mode=issue`, label: 'Issue a book', icon: BookOpen },
    { to: `${base}/circulation?mode=return`, label: 'Return a book', icon: Repeat },
    { to: `${base}/books?new=1`, label: 'Add a title', icon: BookPlus },
    { to: `${base}/members?new=1`, label: 'Register member', icon: UserPlus },
  ];

  return (
    <div>
      <PageHeader
        eyebrow={new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }).format(toDate(now))}
        title={`${greeting}, ${session?.name.split(' ')[0] ?? ''}`}
        description={`Here’s what’s happening at ${data.settings.libraryName} today.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {quick.map((q) => (
          <Link key={q.label} to={q.to} className="group flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3 text-sm font-medium text-ink transition hover:border-brass/60 hover:bg-surface-raised">
            <q.icon className="h-[18px] w-[18px] text-brass" aria-hidden />
            <span className="flex-1">{q.label}</span>
            <ArrowRight className="h-4 w-4 text-ink-faint transition group-hover:translate-x-0.5 group-hover:text-brass" aria-hidden />
          </Link>
        ))}
      </div>

      <section aria-label="Key metrics" className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Catalog titles" value={m.titles} icon={BookOpen} to={`${base}/books`} />
        <StatCard label="Physical copies" value={m.copies} hint="Excluding withdrawn" icon={BookCopy} tone="sky" to={`${base}/inventory`} />
        <StatCard label="Available now" value={m.available} hint={m.copies ? `${Math.round((m.available / m.copies) * 100)}% of copies` : undefined} icon={CircleCheck} tone="sage" to={`${base}/inventory?status=available`} />
        <StatCard label="On loan" value={m.borrowed} icon={ClipboardList} tone="plum" to={`${base}/loans?state=active`} />
        <StatCard label="Active members" value={m.activeMembers} icon={Users} tone="sky" to={`${base}/members?status=active`} />
        <StatCard label="Overdue loans" value={m.overdue} icon={AlarmClock} tone="rose" to={`${base}/loans?state=overdue`} />
        <StatCard label="Open reservations" value={m.activeReservations} icon={ListOrdered} tone="plum" to={`${base}/reservations?status=open`} />
        <StatCard label="Outstanding fines" value={formatMoney(m.outstandingFines, cur)} hint={m.accruing ? `+${formatMoney(m.accruing, cur)} accruing` : undefined} icon={Receipt} tone="brass" to={`${base}/fines?status=outstanding`} />
      </section>

      <div className="mt-6 grid gap-4 xl:grid-cols-3">
        <Card title="Circulation trend" subtitle="Issues and returns, last 6 months" className="xl:col-span-2"
          action={<Link to={`${base}/reports`} className="text-xs font-medium text-brass hover:underline">Reports</Link>}>
          {trend.some((t) => t.issued || t.returned) ? <TrendChart data={trend} /> : <EmptyState icon={Repeat} title="No circulation yet" body="Issue a book and it will appear here." />}
        </Card>
        <Card title="Overdue alerts" subtitle={`${m.overdue} overdue`} bodyClassName="p-0"
          action={<Link to={`${base}/loans?state=overdue`} className="text-xs font-medium text-brass hover:underline">View all</Link>}>
          {overdue.length === 0 ? (
            <EmptyState icon={CircleCheck} title="Nothing overdue" body="Every loan is on time." />
          ) : (
            <ul className="divide-y divide-line">
              {overdue.map((o) => (
                <li key={o.loan.id}>
                  <Link to={`${base}/members/${o.loan.memberId}`} className="flex items-center gap-3 px-5 py-3 transition hover:bg-surface-raised">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{o.book?.title}</p>
                      <p className="truncate text-xs text-ink-muted">{o.member?.name} · due {fmtDate(o.loan.dueAt)}</p>
                    </div>
                    <div className="text-right">
                      <Badge tone="rose">{o.days}d late</Badge>
                      {o.amount > 0 && <p className="mt-1 text-[11px] text-ink-faint tabular">{formatMoney(o.amount, cur)}</p>}
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
        <Card title="Most borrowed" subtitle="Last 6 months">
          {top.length === 0 ? <EmptyState icon={BookOpen} title="No loans in this period" /> : (
            <ol className="space-y-3">
              {top.map((t, i) => (
                <li key={t.book.id}>
                  <Link to={`${base}/books/${t.book.id}`} className="flex items-center gap-3 rounded-control p-1 -m-1 transition hover:bg-surface-raised">
                    <span className="w-4 text-right font-display text-sm text-ink-faint tabular">{i + 1}</span>
                    <BookCover book={t.book} size="sm" className="w-9 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-ink">{t.book.title}</p>
                      <p className="truncate text-xs text-ink-faint">{t.book.authors.join(', ')}</p>
                    </div>
                    <span className="text-sm tabular text-ink-muted">{t.loans}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card title="Popular categories" subtitle="By loans, last 6 months">
          {cats.length === 0 ? <EmptyState icon={BookOpen} title="No loans in this period" /> : <HBarChart data={cats.map((c) => ({ name: c.category, value: c.loans }))} label="Loans" color="sage" />}
        </Card>
        <Card title="Inventory status" subtitle={`${data.copies.length} copies tracked`}>
          {inv.length === 0 ? <EmptyState icon={BookCopy} title="No copies yet" /> : (
            <DonutChart data={inv.map((x) => ({ name: COPY_STATUS_LABEL[x.status], value: x.count }))} centerLabel="copies" centerValue={data.copies.length} />
          )}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Reservation activity" bodyClassName="p-0"
          action={<Link to={`${base}/reservations`} className="text-xs font-medium text-brass hover:underline">Manage</Link>}>
          <div className="grid gap-0 sm:grid-cols-2 sm:divide-x sm:divide-line">
            <div className="p-5">
              <p className="eyebrow mb-3">Ready for pickup</p>
              {readyHolds.length === 0 ? <p className="text-sm text-ink-faint">No copies on hold.</p> : (
                <ul className="space-y-2.5">
                  {readyHolds.map((r) => (
                    <li key={r.id} className="text-sm">
                      <p className="truncate font-medium text-ink">{data.books.find((b) => b.id === r.bookId)?.title}</p>
                      <p className="text-xs text-ink-muted">{data.members.find((x) => x.id === r.memberId)?.name} · until {fmtDate(r.pickupBy)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="border-t border-line p-5 sm:border-t-0">
              <p className="eyebrow mb-3">Longest queues</p>
              {queues.length === 0 ? <p className="text-sm text-ink-faint">No one is waiting.</p> : (
                <ul className="space-y-2.5">
                  {queues.map((q) => (
                    <li key={q.book.id} className="flex items-center gap-2 text-sm">
                      <Hourglass className="h-3.5 w-3.5 shrink-0 text-plum" aria-hidden />
                      <span className="flex-1 truncate text-ink">{q.book.title}</span>
                      <Badge tone="plum">{q.n} waiting</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </Card>
        <Card title="Recent activity" bodyClassName="p-0"
          action={session?.role === 'admin' ? <Link to={`${base}/activity`} className="text-xs font-medium text-brass hover:underline">Full log</Link> : undefined}>
          {recent.length === 0 ? <EmptyState icon={ClipboardList} title="No activity yet" /> : (
            <ul className="divide-y divide-line">
              {recent.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-brass" aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-ink">{a.summary}</p>
                    <p className="text-xs text-ink-faint">{a.actor.name} · {fmtRelative(a.at)}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
