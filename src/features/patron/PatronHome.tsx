import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlarmClock, ArrowRight, BookOpen, GraduationCap, ListOrdered, Receipt, ScanLine, Sparkles } from 'lucide-react';
import { useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { PageHeader, StatCard } from '@/components/ui/Layout';
import { BookCard } from '@/components/books/BookCard';
import { Callout } from '@/components/ui/Feedback';
import { activeLoans, availabilityOf, isOverdue, memberBalance } from '@/services/common';
import { formatMoney } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { usePatron } from './usePatron';

export default function PatronHome() {
  const { data, memberId, member } = usePatron();
  const now = useNow();
  const base = useBase();
  const loans = activeLoans(data, memberId);
  const overdue = loans.filter((l) => isOverdue(l, now));
  const ready = data.reservations.filter((r) => r.memberId === memberId && r.status === 'ready');
  const featured = useMemo(() => data.books.filter((b) => b.featured && b.status === 'active').slice(0, 6), [data.books]);
  const recent = useMemo(() => [...data.books].filter((b) => b.status === 'active').sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 6), [data.books]);
  return (
    <div>
      <PageHeader eyebrow="Welcome back" title={member?.name ?? 'Reader'} description={data.settings.libraryName} />
      <div className="mb-6 space-y-2">
        {overdue.length > 0 && <Callout tone="rose" icon={AlarmClock} title={`${overdue.length} overdue item${overdue.length > 1 ? 's' : ''}`}>Please return them to stop fines accruing. <Link to={`${base}/my-books`} className="text-brass underline">View my books</Link></Callout>}
        {ready.map((r) => <Callout key={r.id} tone="sage" icon={ListOrdered} title="Ready for pickup">“{data.books.find((b) => b.id === r.bookId)?.title}” is held for you until {fmtDate(r.pickupBy)}.</Callout>)}
      </div>
      <Link to={`${base}/librarian`} className="card group mb-4 flex items-center gap-4 p-5 transition hover:border-plum/60">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-plum-soft"><Sparkles className="h-6 w-6 text-plum" aria-hidden /></span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg text-ink">Ask the AI Librarian</span>
          <span className="block text-sm text-ink-muted">“Anything on machine learning on the shelf?” “Renew my books.” It runs on this laptop — your questions never leave it.</span>
        </span>
        <ArrowRight className="h-5 w-5 text-ink-faint transition group-hover:translate-x-1 group-hover:text-plum" aria-hidden />
      </Link>
      {member?.type === 'student' && (
        <Link to={`${base}/self-checkout`} className="card group mb-6 flex items-center gap-4 p-5 transition hover:border-brass/60">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brass-soft"><ScanLine className="h-6 w-6 text-brass" aria-hidden /></span>
          <span className="min-w-0 flex-1">
            <span className="block font-display text-lg text-ink">Borrow it yourself</span>
            <span className="block text-sm text-ink-muted">Found a book on the shelf? Scan it with Self-checkout and skip the desk.</span>
          </span>
          <ArrowRight className="h-5 w-5 text-ink-faint transition group-hover:translate-x-1 group-hover:text-brass" aria-hidden />
        </Link>
      )}
      {member?.type === 'faculty' && (() => {
        const mine = data.courses.filter((c) => c.facultyId === memberId && c.status === 'active');
        const waiting = mine.flatMap((c) => c.bookIds).reduce((n, id) => n + data.reservations.filter((r) => r.bookId === id && r.status === 'waiting').length, 0);
        return (
          <Link to={`${base}/courses`} className="card group mb-6 flex items-center gap-4 p-5 transition hover:border-plum/60">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-plum-soft"><GraduationCap className="h-6 w-6 text-plum" aria-hidden /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-display text-lg text-ink">{mine.length ? `Your course reserves: ${mine.map((c) => c.code).join(', ')}` : 'Set up course reserves'}</span>
              <span className="block text-sm text-ink-muted">{mine.length ? `${mine.reduce((n, c) => n + c.bookIds.length, 0)} titles on reserve · ${waiting} student${waiting === 1 ? '' : 's'} waiting` : 'Put required reading on short loan so the whole class gets a turn.'}</span>
            </span>
            <ArrowRight className="h-5 w-5 text-ink-faint transition group-hover:translate-x-1 group-hover:text-plum" aria-hidden />
          </Link>
        );
      })()}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="On loan" value={loans.length} icon={BookOpen} tone="sky" to={`${base}/my-books`} />
        <StatCard label="Overdue" value={overdue.length} icon={AlarmClock} tone="rose" to={`${base}/my-books`} />
        <StatCard label="Reservations" value={data.reservations.filter((r) => r.memberId === memberId && (r.status === 'waiting' || r.status === 'ready')).length} icon={ListOrdered} tone="plum" to={`${base}/reservations`} />
        <StatCard label="Fines owed" value={formatMoney(memberBalance(data, memberId), data.settings.currency)} icon={Receipt} to={`${base}/fines`} />
      </div>
      {[{ t: 'Featured', books: featured }, { t: 'Recently added', books: recent }].map((s) => (
        <section key={s.t} className="mt-10">
          <div className="mb-4 flex items-end justify-between"><h2 className="font-display text-2xl text-ink">{s.t}</h2><Link to={`${base}/discover`} className="text-sm text-brass">Discover more</Link></div>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {s.books.map((b) => <BookCard key={b.id} book={b} to={`${base}/books/${b.id}`} availability={availabilityOf(data, b.id)} />)}
          </div>
        </section>
      ))}
    </div>
  );
}
