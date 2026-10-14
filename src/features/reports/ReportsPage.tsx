import { useMemo } from 'react';
import { subDays, subMonths, startOfDay, endOfDay } from 'date-fns';
import { BarChart3, Download } from 'lucide-react';
import { useData, useNow } from '@/app/providers';
import { useQueryState } from '@/hooks/useQueryState';
import { Card, PageHeader, StatCard } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { FilterSelect } from '@/components/ui/Toolbar';
import { Input } from '@/components/ui/Input';
import { ColumnChart, DonutChart, HBarChart, TrendChart } from '@/components/charts/Charts';
import {
  categoryPopularity, circulationTrend, fineMonthly, fineSummary, inventoryDistribution, memberActivity, overdueList, reservationStats, topBooks,
} from '@/services/reports';
import { COPY_STATUS_LABEL } from '@/services/inventory';
import { downloadText, toCsv } from '@/lib/csv';
import { formatMoney, toDecimalString } from '@/lib/money';
import { fmtDate, fromInputDate, toDate, toInputDate } from '@/lib/dates';
import { ListOrdered, Receipt, Repeat, Users } from 'lucide-react';

const PRESETS = [
  { value: '30d', label: 'Last 30 days' },
  { value: '90d', label: 'Last 90 days' },
  { value: '6m', label: 'Last 6 months' },
  { value: '12m', label: 'Last 12 months' },
  { value: 'custom', label: 'Custom range' },
];

function CsvButton({ name, headers, rows }: { name: string; headers: string[]; rows: (string | number | undefined)[][] }) {
  return (
    <button onClick={() => downloadText(`librax-${name}-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(headers, rows))}
      className="inline-flex items-center gap-1 text-xs font-medium text-brass hover:underline" aria-label={`Export ${name} as CSV`}>
      <Download className="h-3.5 w-3.5" /> CSV
    </button>
  );
}

export default function ReportsPage() {
  const data = useData();
  const now = useNow();
  const [preset, setPreset] = useQueryState('range', '6m');
  const [fromParam, setFrom] = useQueryState('from');
  const [toParam, setTo] = useQueryState('to');
  const cur = data.settings.currency;

  const range = useMemo(() => {
    const end = toDate(now);
    if (preset === 'custom') {
      const f = fromInputDate(fromParam);
      const t = fromInputDate(toParam);
      const from = f ? startOfDay(toDate(f)) : subMonths(end, 1);
      const to = t ? endOfDay(toDate(t)) : end;
      return from.getTime() <= to.getTime() ? { from: from.toISOString(), to: to.toISOString() } : { from: to.toISOString(), to: from.toISOString() };
    }
    const from = preset === '30d' ? subDays(end, 30) : preset === '90d' ? subDays(end, 90) : preset === '12m' ? subMonths(end, 12) : subMonths(end, 6);
    return { from: from.toISOString(), to: end.toISOString() };
  }, [preset, fromParam, toParam, now]);

  const trend = useMemo(() => circulationTrend(data, range), [data, range]);
  const top = useMemo(() => topBooks(data, range, 10), [data, range]);
  const cats = useMemo(() => categoryPopularity(data, range), [data, range]);
  const members = useMemo(() => memberActivity(data, range, 10), [data, range]);
  const inv = useMemo(() => inventoryDistribution(data), [data]);
  const res = useMemo(() => reservationStats(data, range), [data, range]);
  const fines = useMemo(() => fineSummary(data, range), [data, range]);
  const fineTrend = useMemo(() => fineMonthly(data, 6, now), [data, now]);
  const overdue = useMemo(() => overdueList(data, now), [data, now]);
  const issued = trend.reduce((a, b) => a + b.issued, 0);

  return (
    <div>
      <PageHeader eyebrow="Insights" title="Reports" description={`Calculated live from stored records · ${fmtDate(range.from)} – ${fmtDate(range.to)}`}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <FilterSelect label="Date range" value={preset} onChange={setPreset} options={PRESETS} />
            {preset === 'custom' && (
              <>
                <Input type="date" aria-label="From date" value={fromParam || toInputDate(range.from)} max={toInputDate(now)} onChange={(e) => setFrom(e.target.value)} className="w-auto" />
                <Input type="date" aria-label="To date" value={toParam || toInputDate(range.to)} max={toInputDate(now)} onChange={(e) => setTo(e.target.value)} className="w-auto" />
              </>
            )}
          </div>
        } />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Loans issued" value={issued} icon={Repeat} />
        <StatCard label="Active borrowers" value={memberActivity(data, range, 10_000).length} icon={Users} tone="sky" />
        <StatCard label="Reservations placed" value={res.created} hint={`${res.fulfilled} fulfilled · ${res.expired} expired`} icon={ListOrdered} tone="plum" />
        <StatCard label="Fines assessed" value={formatMoney(fines.assessed, cur)} hint={`${formatMoney(fines.collected, cur)} collected`} icon={Receipt} tone="rose" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card title="Borrowing trend" className="xl:col-span-2" action={<CsvButton name="borrowing-trend" headers={['period', 'issued', 'returned']} rows={trend.map((t) => [t.label, t.issued, t.returned])} />}>
          {issued === 0 && trend.every((t) => !t.returned) ? <EmptyState icon={BarChart3} title="No circulation in this range" /> : <TrendChart data={trend} height={280} />}
        </Card>
        <Card title="Inventory distribution" subtitle="Current" action={<CsvButton name="inventory-distribution" headers={['status', 'copies']} rows={inv.map((i) => [i.status, i.count])} />}>
          {data.copies.length === 0 ? <EmptyState icon={BarChart3} title="No copies" /> : <DonutChart data={inv.filter((i) => i.count).map((i) => ({ name: COPY_STATUS_LABEL[i.status], value: i.count }))} centerLabel="copies" centerValue={data.copies.length} />}
        </Card>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Popular titles" action={<CsvButton name="popular-titles" headers={['title', 'isbn', 'loans']} rows={top.map((t) => [t.book.title, t.book.isbn, t.loans])} />}>
          {top.length === 0 ? <EmptyState icon={BarChart3} title="No loans in this range" /> : <HBarChart data={top.map((t) => ({ name: t.book.title, value: t.loans }))} label="Loans" />}
        </Card>
        <Card title="Popular categories" action={<CsvButton name="popular-categories" headers={['category', 'loans']} rows={cats.map((c) => [c.category, c.loans])} />}>
          {cats.length === 0 ? <EmptyState icon={BarChart3} title="No loans in this range" /> : <HBarChart data={cats.map((c) => ({ name: c.category, value: c.loans }))} label="Loans" color="sage" />}
        </Card>
        <Card title="Member activity" subtitle="Most active borrowers" bodyClassName="p-0"
          action={<CsvButton name="member-activity" headers={['member_no', 'name', 'loans', 'late']} rows={members.map((m) => [m.member.memberNo, m.member.name, m.loans, m.late])} />}>
          {members.length === 0 ? <EmptyState icon={Users} title="No borrowing in this range" /> : (
            <table className="w-full text-sm">
              <thead><tr className="border-b border-line text-left text-[11px] uppercase tracking-wider text-ink-faint"><th className="px-5 py-2.5 font-semibold">Member</th><th className="px-5 py-2.5 text-right font-semibold">Loans</th><th className="px-5 py-2.5 text-right font-semibold">Late</th></tr></thead>
              <tbody>{members.map((m) => (
                <tr key={m.member.id} className="border-b border-line/60 last:border-0"><td className="px-5 py-2.5 text-ink">{m.member.name}<span className="ml-2 text-xs capitalize text-ink-faint">{m.member.type}</span></td><td className="px-5 py-2.5 text-right tabular">{m.loans}</td><td className="px-5 py-2.5 text-right tabular text-ink-muted">{m.late}</td></tr>
              ))}</tbody>
            </table>
          )}
        </Card>
        <Card title="Reservation activity" action={<CsvButton name="reservations" headers={['status', 'count']} rows={Object.entries(res).map(([k, v]) => [k, v])} />}>
          {res.created === 0 ? <EmptyState icon={ListOrdered} title="No reservations in this range" /> : (
            <ColumnChart data={[{ label: 'Waiting', v: res.waiting }, { label: 'Ready', v: res.ready }, { label: 'Fulfilled', v: res.fulfilled }, { label: 'Cancelled', v: res.cancelled }, { label: 'Expired', v: res.expired }]} keys={[{ key: 'v', name: 'Reservations', color: 'plum' }]} />
          )}
        </Card>
        <Card title="Fines — last 6 months" subtitle={`Outstanding now: ${formatMoney(fines.outstanding, cur)} · ${fines.counts.outstanding} open, ${fines.counts.settled} settled, ${fines.counts.waived} waived`}
          action={<CsvButton name="fines-monthly" headers={['month', `assessed_${cur}`, `collected_${cur}`]} rows={fineTrend.map((f) => [f.label, toDecimalString(f.assessed, cur), toDecimalString(f.collected, cur)])} />}>
          <ColumnChart data={fineTrend} keys={[{ key: 'assessed', name: 'Assessed', color: 'rose' }, { key: 'collected', name: 'Collected', color: 'sage' }]} format={(v) => formatMoney(v, cur)} />
        </Card>
        <Card title={`Overdue loans (${overdue.length})`} subtitle="As of now" bodyClassName="p-0"
          action={<CsvButton name="overdue" headers={['title', 'barcode', 'member_no', 'member', 'due', 'days_late', `accruing_${cur}`]} rows={overdue.map((o) => [o.book?.title, o.copy?.barcode, o.member?.memberNo, o.member?.name, fmtDate(o.loan.dueAt), o.days, toDecimalString(o.amount, cur)])} />}>
          {overdue.length === 0 ? <EmptyState icon={Repeat} title="Nothing overdue" /> : (
            <ul className="max-h-80 divide-y divide-line overflow-y-auto">{overdue.map((o) => (
              <li key={o.loan.id} className="flex items-center gap-3 px-5 py-2.5 text-sm">
                <div className="min-w-0 flex-1"><p className="truncate text-ink">{o.book?.title}</p><p className="text-xs text-ink-faint">{o.member?.name} · due {fmtDate(o.loan.dueAt)}</p></div>
                <span className="text-xs text-rose">{o.days}d · {formatMoney(o.amount, cur)}</span>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>
      <div className="mt-6 flex justify-end"><Button variant="ghost" onClick={() => window.print()}>Print this report</Button></div>
    </div>
  );
}
