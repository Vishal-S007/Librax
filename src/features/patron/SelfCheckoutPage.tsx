import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BookCheck, CheckCircle2, CircleX, GraduationCap, Keyboard, ScanLine, Sparkles } from 'lucide-react';
import type { Loan } from '@/types/models';
import { useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useToast } from '@/components/ui/Toast';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Badge } from '@/components/ui/Badge';
import { Callout } from '@/components/ui/Feedback';
import { BookCover } from '@/components/books/BookCover';
import { BarcodeScanner } from '@/components/scan/BarcodeScanner';
import { previewSelfCheckout, type SelfCheckoutPreview } from '@/services/selfCheckout';
import { activeLoans, borrowLimitFor, isOverdue, memberBalance } from '@/services/common';
import { formatMoney } from '@/lib/money';
import { fmtDate } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';
import { usePatron } from './usePatron';

/** Student-only: borrow a book without visiting the desk. */
export default function SelfCheckoutPage() {
  const { data, memberId, member } = usePatron();
  const lib = useLibrary();
  const now = useNow();
  const base = useBase();
  const toast = useToast();
  const [scanning, setScanning] = useState(false);
  const [code, setCode] = useState('');
  const [preview, setPreview] = useState<SelfCheckoutPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [session, setSession] = useState<Loan[]>([]);

  const loans = activeLoans(data, memberId);
  const limit = member ? borrowLimitFor(member, data.settings) : 0;
  const overdue = loans.filter((l) => isOverdue(l, now)).length;
  const owed = memberBalance(data, memberId);
  // Re-run the checks against live data so the preview never goes stale.
  const live = useMemo(() => (preview?.ok ? previewSelfCheckout(data, memberId, preview.copy.barcode, now) : preview), [preview, data, memberId, now]);

  const look = (raw: string): string | undefined => {
    const p = previewSelfCheckout(data, memberId, raw, now);
    setPreview(p);
    if (!p.ok) return p.reason;
    setScanning(false);
    return undefined;
  };

  const borrow = () => {
    if (!live?.ok || !live.canBorrow || busy) return;
    setBusy(true);
    try {
      const loan = lib.selfCheckout(live.copy.id);
      setSession((s) => [loan, ...s]);
      setPreview(null);
      toast.success('Enjoy your book!', `Due back ${fmtDate(loan.dueAt)}.`);
    } catch (e) {
      toast.error('Couldn’t borrow this book', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        eyebrow="Students only"
        title="Self-checkout"
        description="Borrow a book yourself: scan it, check the due date, done. No queue at the desk."
      />

      <div className="grid gap-4 lg:grid-cols-[1.25fr_1fr]">
        <section className="card overflow-hidden">
          <div className="paper-grain flex flex-col items-center px-6 py-10 text-center">
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              className="flex h-20 w-20 items-center justify-center rounded-3xl border border-brass/40 bg-brass-soft"
            >
              <ScanLine className="h-9 w-9 text-brass" aria-hidden />
            </motion.div>
            <h2 className="mt-5 font-display text-2xl text-ink">Scan the book you want</h2>
            <p className="mt-1.5 max-w-sm text-sm text-ink-muted">Use the barcode on the back cover (ISBN) or the LIBRAX label inside the cover.</p>
            <Button variant="primary" size="lg" className="mt-6" icon={<ScanLine className="h-5 w-5" />} onClick={() => setScanning(true)} disabled={member?.status !== 'active'}>
              Scan a book
            </Button>
            <form
              className="mt-5 flex w-full max-w-sm gap-2"
              onSubmit={(e) => { e.preventDefault(); if (code.trim()) { look(code); setCode(''); } }}
            >
              <label htmlFor="sc-code" className="sr-only">Barcode or ISBN</label>
              <div className="relative flex-1">
                <Keyboard className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
                <Input id="sc-code" value={code} onChange={(e) => setCode(e.target.value)} placeholder="…or type the ISBN" className="pl-9 font-mono" />
              </div>
              <Button type="submit" disabled={!code.trim()}>Find</Button>
            </form>
          </div>

          <AnimatePresence mode="wait">
            {live && (
              <motion.div key={live.ok ? live.copy.id : 'err'} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="border-t border-line p-5">
                {!live.ok ? (
                  <Callout tone="rose" icon={CircleX} title="Can’t borrow this one here">{live.reason}{live.book && <> <Link to={`${base}/books/${live.book.id}`} className="text-brass underline">Open the book page</Link></>}</Callout>
                ) : (
                  <div className="flex flex-col gap-5 sm:flex-row">
                    <BookCover book={live.book} className="w-28 shrink-0 self-center sm:self-start" />
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-xl text-ink">{live.book.title}</h3>
                      <p className="text-sm text-ink-muted">{live.book.authors.join(', ')} · <span className="font-mono">{live.copy.barcode}</span></p>
                      {live.reserveCodes.length > 0 && (
                        <div className="mt-2"><Badge tone="plum"><GraduationCap className="h-3 w-3" /> Course reserve · {live.reserveCodes.join(', ')} · {data.settings.reserveLoanDays}-day loan, no renewals</Badge></div>
                      )}
                      <ul className="mt-4 grid gap-1.5 sm:grid-cols-2" aria-label="Borrowing checks">
                        {live.checks.map((c) => (
                          <li key={c.id} className="flex items-start gap-2 text-[13px]">
                            {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-label="Passed" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose" aria-label="Failed" />}
                            <span className={c.ok ? 'text-ink-muted' : 'text-rose'}>{c.ok ? c.label : c.detail}</span>
                          </li>
                        ))}
                      </ul>
                      <div className="mt-5 flex flex-wrap items-center gap-3">
                        <Button variant="primary" size="lg" icon={<BookCheck className="h-5 w-5" />} disabled={!live.canBorrow} loading={busy} onClick={borrow}>
                          Borrow until {fmtDate(live.dueAt)}
                        </Button>
                        <Button variant="ghost" onClick={() => setPreview(null)}>Cancel</Button>
                      </div>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>

        <aside className="space-y-4">
          <section className="card p-5">
            <p className="eyebrow mb-3">Your borrowing</p>
            <div className="grid grid-cols-3 gap-2 text-center">
              {[['On loan', `${loans.length}/${limit}`], ['Overdue', String(overdue)], ['Owed', formatMoney(owed, data.settings.currency)]].map(([l, v]) => (
                <div key={l} className="rounded-control bg-surface-sunken p-3">
                  <p className={cn('font-display text-xl tabular', l === 'Overdue' && overdue ? 'text-rose' : 'text-ink')}>{v}</p>
                  <p className="text-[11px] text-ink-faint">{l}</p>
                </div>
              ))}
            </div>
            {member?.status !== 'active' && <p className="mt-3 text-sm text-rose">Your membership is {member?.status}. Visit the desk to reactivate it.</p>}
          </section>

          <section className="card p-5">
            <p className="eyebrow mb-3">Borrowed just now</p>
            {session.length === 0 ? (
              <p className="flex items-center gap-2 text-sm text-ink-faint"><Sparkles className="h-4 w-4" aria-hidden /> Books you borrow here will appear in this list.</p>
            ) : (
              <ul className="space-y-3">
                {session.map((l) => {
                  const b = data.books.find((x) => x.id === l.bookId);
                  return (
                    <li key={l.id} className="flex items-center gap-3">
                      {b && <BookCover book={b} size="sm" className="w-9 shrink-0" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-ink">{b?.title}</p>
                        <p className="text-xs text-ink-muted">Due {fmtDate(l.dueAt)}</p>
                      </div>
                      <CheckCircle2 className="h-5 w-5 text-sage" aria-label="Borrowed" />
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="mt-4 text-xs text-ink-faint">Return books at the circulation desk or the drop box. <Link to={`${base}/my-books`} className="text-brass">See all my books</Link></p>
          </section>
        </aside>
      </div>

      <BarcodeScanner
        open={scanning}
        onClose={() => setScanning(false)}
        onDetected={look}
        title="Scan the book to borrow"
        hint="Scan the ISBN on the back cover or the LIBRAX label inside. A copy reserved for you is used first."
        placeholder="ISBN or LBX-000123"
      />
    </div>
  );
}
