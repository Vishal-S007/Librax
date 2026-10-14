import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Archive, ArchiveRestore, ArrowLeft, Bookmark, BookmarkCheck, BookOpen, CopyPlus, Pencil, ListOrdered, MoreHorizontal,
  GraduationCap, Package, Printer, X,
} from 'lucide-react';
import type { Copy } from '@/types/models';
import { useData, useLibrary, useNow, useSession } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { isStaff } from '@/routes/nav';
import { BookCover } from '@/components/books/BookCover';
import { BookCard } from '@/components/books/BookCard';
import { AvailabilityBadge } from '@/components/books/AvailabilityBadge';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, KeyValue } from '@/components/ui/Layout';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { CopyStatusBadge, LoanStateBadge, ReservationStatusBadge } from '@/components/ui/Status';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { activeLoans, availabilityOf } from '@/services/common';
import { relatedBooks } from '@/services/catalog';
import { isOpen, queueFor, queuePosition } from '@/services/reservations';
import { fmtDate } from '@/lib/dates';
import { formatIsbn } from '@/lib/isbn';
import { BookForm } from './BookForm';
import { CopyForm } from '@/features/inventory/CopyForm';
import { CopyStatusDialog } from '@/features/inventory/CopyStatusDialog';
import { printCopyLabels } from '@/lib/printLabels';
import { reservesFor } from '@/services/courses';
import { useToast } from '@/components/ui/Toast';

export default function BookDetailPage() {
  const { id = '' } = useParams();
  const data = useData();
  const lib = useLibrary();
  const session = useSession();
  const now = useNow();
  const base = useBase();
  const navigate = useNavigate();
  const { run, pending } = useAction();
  const toast = useToast();
  const staff = isStaff(session?.role);
  const memberId = session?.memberId;
  const book = data.books.find((b) => b.id === id);
  const [editing, setEditing] = useState(false);
  const [addingCopy, setAddingCopy] = useState(false);
  const [editCopy, setEditCopy] = useState<Copy | null>(null);
  const [statusCopy, setStatusCopy] = useState<Copy | null>(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const a = useMemo(() => (book ? availabilityOf(data, book.id) : null), [data, book]);
  const copies = useMemo(() => data.copies.filter((c) => c.bookId === id).sort((x, y) => x.barcode.localeCompare(y.barcode)), [data.copies, id]);
  const related = useMemo(() => (book ? relatedBooks(data, book, 6) : []), [data, book]);
  const queue = useMemo(() => queueFor(data, id), [data, id]);
  const history = useMemo(() => data.loans.filter((l) => l.bookId === id).sort((x, y) => y.issuedAt.localeCompare(x.issuedAt)), [data.loans, id]);
  const myOpenReservation = memberId ? data.reservations.find((r) => r.bookId === id && r.memberId === memberId && isOpen(r)) : undefined;
  const myLoan = memberId ? activeLoans(data, memberId).find((l) => l.bookId === id) : undefined;
  const saved = memberId ? (data.saved[memberId] ?? []).includes(id) : false;
  const member = memberId ? data.members.find((m) => m.id === memberId) : undefined;

  if (!book || (!staff && book.status !== 'active')) {
    return (
      <div className="card">
        <EmptyState icon={BookOpen} title="Title not found" body="It may have been archived or the link is out of date."
          action={<Button onClick={() => navigate(staff ? `${base}/books` : `${base}/discover`)}>Back to {staff ? 'catalog' : 'discovery'}</Button>} />
      </div>
    );
  }

  const reserve = () => {
    if (!memberId) return;
    run(() => lib.reserve(memberId, book.id), (r) => (r.status === 'ready' ? 'A copy is on hold for you — collect it at the desk' : `Reserved — you are #${queuePosition(lib.store.getState(), r)} in the queue`));
  };

  return (
    <div>
      <button onClick={() => navigate(-1)} className="mb-5 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back
      </button>

      <section className="grid gap-8 md:grid-cols-[220px_1fr] lg:grid-cols-[260px_1fr]">
        <div className="mx-auto w-44 md:w-full">
          <BookCover book={book} size="lg" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="brass">{book.category}</Badge>
            {book.status === 'archived' && <Badge tone="neutral">Archived</Badge>}
            {a && <AvailabilityBadge a={a} />}
            {book.featured && <Badge tone="plum">Featured</Badge>}
            {reservesFor(data, book.id).map((c) => (
              <Badge key={c.id} tone="sky"><GraduationCap className="h-3 w-3" aria-hidden /> Required for {c.code}</Badge>
            ))}
          </div>
          <h1 className="mt-3 font-display text-3xl leading-tight text-ink sm:text-[40px]">{book.title}</h1>
          {book.subtitle && <p className="mt-1 font-display text-lg text-ink-muted">{book.subtitle}</p>}
          <p className="mt-3 text-[15px] text-ink-muted">by <span className="text-ink">{book.authors.join(', ')}</span></p>

          <div className="mt-5 flex flex-wrap gap-2">
            {staff ? (
              <>
                <Button variant="primary" icon={<CopyPlus className="h-4 w-4" />} onClick={() => setAddingCopy(true)} disabled={book.status !== 'active'}>Add copy</Button>
                <Button icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Edit details</Button>
                {book.status === 'active' ? (
                  <Button variant="ghost" icon={<Archive className="h-4 w-4" />} onClick={() => setConfirmArchive(true)}>Archive</Button>
                ) : (
                  <Button variant="ghost" icon={<ArchiveRestore className="h-4 w-4" />} onClick={() => run(() => lib.setBookArchived(book.id, false), 'Title restored')}>Restore</Button>
                )}
              </>
            ) : (
              <>
                {myLoan ? (
                  <Button variant="secondary" onClick={() => navigate(`${base}/my-books`)}>On loan to you · due {fmtDate(myLoan.dueAt)}</Button>
                ) : myOpenReservation ? (
                  <Button variant="secondary" icon={<X className="h-4 w-4" />} onClick={() => setConfirmCancel(true)}>Cancel reservation</Button>
                ) : (
                  <Button variant="primary" icon={<ListOrdered className="h-4 w-4" />} onClick={reserve} loading={pending}
                    disabled={!a || a.total === 0 || member?.status !== 'active'}>
                    {a && a.available > 0 ? 'Place hold' : 'Reserve'}
                  </Button>
                )}
                {memberId && (
                  <Button
                    variant="secondary"
                    aria-pressed={saved}
                    icon={saved ? <BookmarkCheck className="h-4 w-4 text-brass" /> : <Bookmark className="h-4 w-4" />}
                    onClick={() => run(() => lib.toggleSaved(memberId, book.id), (s) => (s ? 'Saved to your reading list' : 'Removed from saved books'))}
                  >
                    {saved ? 'Saved' : 'Save'}
                  </Button>
                )}
              </>
            )}
          </div>

          {!staff && myOpenReservation && (
            <div className="mt-4 max-w-xl">
              {myOpenReservation.status === 'ready' ? (
                <Callout tone="sage" title="Ready for pickup">A copy is on hold for you until {fmtDate(myOpenReservation.pickupBy)}. Collect it at the circulation desk.</Callout>
              ) : (
                <Callout tone="sky" title={`You are #${queuePosition(data, myOpenReservation)} in the queue`}>We’ll notify you as soon as a copy is held for you.</Callout>
              )}
            </div>
          )}
          {!staff && member && member.status !== 'active' && (
            <div className="mt-4 max-w-xl"><Callout tone="rose" title="Membership not active">Reservations are unavailable until your membership is reactivated.</Callout></div>
          )}

          {reservesFor(data, book.id).length > 0 && (
            <div className="mt-4 max-w-xl">
              <Callout tone="sky" icon={GraduationCap} title={`Course reserve · ${reservesFor(data, book.id).map((c) => `${c.code} ${c.title}`).join(' · ')}`}>
                {member?.type === 'student' || staff
                  ? `Students borrow this title for ${data.settings.reserveLoanDays} days and can’t renew it, so everyone in the course gets a turn.`
                  : 'Required reading for this course. Faculty loans keep normal terms.'}
              </Callout>
            </div>
          )}

          {book.description && <p className="mt-6 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{book.description}</p>}

          <div className="mt-6 max-w-2xl rounded-card border border-line bg-surface p-5">
            <KeyValue items={[
              { label: 'ISBN', value: <span className="font-mono">{formatIsbn(book.isbn)}</span> },
              { label: 'Publisher', value: book.publisher },
              { label: 'Published', value: book.publicationYear },
              { label: 'Edition', value: book.edition ?? '—' },
              { label: 'Language', value: book.language },
              { label: 'Pages', value: book.pageCount },
              ...(a ? [{ label: 'Copies', value: `${a.available} available · ${a.borrowed} on loan · ${a.onHold} on hold${a.unavailable ? ` · ${a.unavailable} out of service` : ''}` }] : []),
              { label: 'Waiting list', value: queue.length ? `${queue.length} member${queue.length > 1 ? 's' : ''}` : 'None' },
            ]} />
            {book.tags.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-line pt-4">
                {book.tags.map((t) => (
                  <Link key={t} to={staff ? `${base}/books?q=${encodeURIComponent(t)}` : `${base}/discover?tag=${encodeURIComponent(t)}`} className="rounded-full border border-line px-2.5 py-0.5 text-xs text-ink-muted hover:border-brass hover:text-brass">
                    #{t}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      {staff && (
        <div className="mt-10 grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Card title={`Physical copies (${copies.length})`} bodyClassName="p-0"
            action={
              <div className="flex gap-1.5">
                <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} disabled={copies.filter((c) => c.status !== 'withdrawn').length === 0}
                  onClick={() => {
                    const ok = printCopyLabels(copies.filter((c) => c.status !== 'withdrawn').map((c) => ({ copy: c, book })), data.settings.libraryName);
                    if (!ok) toast.error('Pop-up blocked', 'Allow pop-ups for this site to print labels.');
                  }}>
                  Print labels
                </Button>
                <Button size="sm" icon={<CopyPlus className="h-3.5 w-3.5" />} onClick={() => setAddingCopy(true)} disabled={book.status !== 'active'}>Add</Button>
              </div>
            }>
            {copies.length === 0 ? (
              <EmptyState icon={Package} title="No copies yet" body="Add a physical copy so this title can circulate." />
            ) : (
              <ul className="divide-y divide-line">
                {copies.map((c) => {
                  const loan = c.status === 'borrowed' ? data.loans.find((l) => l.copyId === c.id && !l.returnedAt) : undefined;
                  const hold = c.status === 'on_hold' ? data.reservations.find((r) => r.copyId === c.id && r.status === 'ready') : undefined;
                  const who = data.members.find((m) => m.id === (loan?.memberId ?? hold?.memberId));
                  return (
                    <li key={c.id} className="flex flex-wrap items-center gap-3 px-5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm text-ink">{c.barcode}</p>
                        <p className="text-xs text-ink-faint">{c.shelfLocation} · {c.condition}{who ? ` · ${loan ? `with ${who.name}, due ${fmtDate(loan.dueAt)}` : `held for ${who.name}`}` : ''}</p>
                      </div>
                      <CopyStatusBadge status={c.status} />
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setEditCopy(c)} aria-label={`Edit copy ${c.barcode}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" onClick={() => setStatusCopy(c)} aria-label={`Change status of ${c.barcode}`}><MoreHorizontal className="h-4 w-4" /></Button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>
          <Card title="Reservation queue" bodyClassName="p-0">
            {queue.length === 0 && !data.reservations.some((r) => r.bookId === id && r.status === 'ready') ? (
              <EmptyState icon={ListOrdered} title="No one is waiting" />
            ) : (
              <ol className="divide-y divide-line">
                {data.reservations.filter((r) => r.bookId === id && r.status === 'ready').map((r) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-6 text-ink-faint">—</span>
                    <span className="flex-1 truncate text-ink">{data.members.find((m) => m.id === r.memberId)?.name}</span>
                    <ReservationStatusBadge status="ready" />
                  </li>
                ))}
                {queue.map((r, i) => (
                  <li key={r.id} className="flex items-center gap-3 px-5 py-3 text-sm">
                    <span className="w-6 font-display text-ink-faint tabular">#{i + 1}</span>
                    <Link to={`${base}/members/${r.memberId}`} className="flex-1 truncate text-ink hover:text-brass">{data.members.find((m) => m.id === r.memberId)?.name}</Link>
                    <span className="text-xs text-ink-faint">since {fmtDate(r.createdAt)}</span>
                  </li>
                ))}
              </ol>
            )}
          </Card>
          <Card title={`Loan history (${history.length})`} bodyClassName="p-0" className="xl:col-span-2">
            {history.length === 0 ? <EmptyState icon={BookOpen} title="Never borrowed yet" /> : (
              <ul className="divide-y divide-line">
                {history.slice(0, 12).map((l) => (
                  <li key={l.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
                    <Link to={`${base}/members/${l.memberId}`} className="min-w-[140px] flex-1 truncate text-ink hover:text-brass">{data.members.find((m) => m.id === l.memberId)?.name}</Link>
                    <span className="font-mono text-xs text-ink-faint">{data.copies.find((c) => c.id === l.copyId)?.barcode}</span>
                    <span className="text-xs text-ink-muted">{fmtDate(l.issuedAt)} → {l.returnedAt ? fmtDate(l.returnedAt) : `due ${fmtDate(l.dueAt)}`}</span>
                    <LoanStateBadge loan={l} now={now} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      )}

      {related.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-4 font-display text-2xl text-ink">You might also like</h2>
          <div className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 lg:grid-cols-6">
            {related.map((b) => <BookCard key={b.id} book={b} to={`${base}/books/${b.id}`} availability={availabilityOf(data, b.id)} />)}
          </div>
        </section>
      )}

      {staff && (
        <>
          <BookForm key={`${book.id}-${book.updatedAt}`} open={editing} onClose={() => setEditing(false)} book={book} />
          <CopyForm key={`new-${addingCopy}`} open={addingCopy} onClose={() => setAddingCopy(false)} bookId={book.id} />
          <CopyForm key={editCopy?.id ?? 'none'} open={!!editCopy} onClose={() => setEditCopy(null)} copy={editCopy ?? undefined} />
          <CopyStatusDialog key={statusCopy?.id ?? 'none'} copy={statusCopy} onClose={() => setStatusCopy(null)} />
          <ConfirmDialog
            open={confirmArchive}
            onClose={() => setConfirmArchive(false)}
            tone="danger"
            title="Archive this title?"
            body="It will be hidden from discovery and cannot be reserved or issued. Loan history is kept and you can restore it later."
            confirmLabel="Archive title"
            onConfirm={() => { run(() => lib.setBookArchived(book.id, true), 'Title archived'); setConfirmArchive(false); }}
          />
        </>
      )}
      {myOpenReservation && (
        <ConfirmDialog
          open={confirmCancel}
          onClose={() => setConfirmCancel(false)}
          tone="danger"
          title="Cancel your reservation?"
          body={myOpenReservation.status === 'ready' ? 'The copy held for you will be released to the next person in the queue.' : 'You will lose your place in the queue.'}
          confirmLabel="Cancel reservation"
          onConfirm={() => { run(() => lib.cancelReservation(myOpenReservation.id), 'Reservation cancelled'); setConfirmCancel(false); }}
        />
      )}
    </div>
  );
}
