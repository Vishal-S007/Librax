import { Link } from 'react-router-dom';
import { BookOpen } from 'lucide-react';
import { useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { Card, PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { LoanStateBadge } from '@/components/ui/Status';
import { BookCover } from '@/components/books/BookCover';
import { activeLoans, overdueFine, renewalLimitFor } from '@/services/common';
import { daysUntil, fmtDate } from '@/lib/dates';
import { formatMoney } from '@/lib/money';
import { usePatron } from './usePatron';

export default function MyBooksPage() {
  const { data, memberId, member } = usePatron();
  const lib = useLibrary();
  const now = useNow();
  const base = useBase();
  const { run, pending } = useAction();
  const loans = activeLoans(data, memberId).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  const history = data.loans.filter((l) => l.memberId === memberId && l.returnedAt).sort((a, b) => (b.returnedAt ?? '').localeCompare(a.returnedAt ?? ''));
  const title = (id: string) => data.books.find((b) => b.id === id);
  return (
    <div>
      <PageHeader eyebrow="Account" title="My books" description="Renew loans when no one is waiting and you are within the renewal limit." />
      <Card title={`On loan (${loans.length})`} bodyClassName="p-0">
        {loans.length === 0 ? <EmptyState icon={BookOpen} title="Nothing on loan" action={<Link to={`${base}/discover`} className="text-sm text-brass">Discover books</Link>} /> : (
          <ul className="divide-y divide-line">
            {loans.map((l) => {
              const b = title(l.bookId); const d = daysUntil(l.dueAt, now); const fine = overdueFine(l.dueAt, now, data.settings).amount;
              return (
                <li key={l.id} className="flex flex-wrap items-center gap-4 px-5 py-4">
                  {b && <BookCover book={b} size="sm" className="w-12 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <Link to={`${base}/books/${l.bookId}`} className="font-medium text-ink hover:text-brass">{b?.title}</Link>
                    <p className="text-xs text-ink-muted">Due {fmtDate(l.dueAt)} · {d < 0 ? `${-d} days late` : d === 0 ? 'due today' : `${d} days left`} · renewals {l.renewals}/{member ? renewalLimitFor(member, data.settings) : 0}</p>
                    {fine > 0 && <p className="text-xs text-rose">Accruing fine: {formatMoney(fine, data.settings.currency)}</p>}
                  </div>
                  <LoanStateBadge loan={l} now={now} />
                  <Button size="sm" disabled={pending} onClick={() => run(() => lib.renew(l.id), (x) => `Renewed — now due ${fmtDate(x.dueAt)}`, { errorTitle: 'Renewal not approved' })}>Renew</Button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <Card title={`Borrowing history (${history.length})`} className="mt-6" bodyClassName="p-0">
        {history.length === 0 ? <EmptyState icon={BookOpen} title="No past loans yet" /> : (
          <ul className="divide-y divide-line">
            {history.slice(0, 40).map((l) => (
              <li key={l.id} className="flex flex-wrap gap-3 px-5 py-3 text-sm">
                <Link to={`${base}/books/${l.bookId}`} className="min-w-0 flex-1 truncate text-ink hover:text-brass">{title(l.bookId)?.title}</Link>
                <span className="text-xs text-ink-muted">{fmtDate(l.issuedAt)} → {fmtDate(l.returnedAt)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
