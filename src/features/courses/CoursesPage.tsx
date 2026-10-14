import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Archive, ArchiveRestore, BookPlus, GraduationCap, Info, Pencil, Plus, ScanLine, Trash2, Users } from 'lucide-react';
import type { Course } from '@/types/models';
import { useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { BookCover } from '@/components/books/BookCover';
import { AvailabilityBadge } from '@/components/books/AvailabilityBadge';
import { BarcodeScanner } from '@/components/scan/BarcodeScanner';
import { availabilityOf } from '@/services/common';
import { queueFor } from '@/services/reservations';
import { resolveScan } from '@/services/scan';
import { fmtDate } from '@/lib/dates';
import { usePatron } from '@/features/patron/usePatron';

/** Faculty-only: build course reading lists that become short-loan reserves for students. */
export default function CoursesPage() {
  const { data, memberId } = usePatron();
  const lib = useLibrary();
  const base = useBase();
  const { run, pending } = useAction();
  const [tab, setTab] = useState<'active' | 'archived'>('active');
  const [editing, setEditing] = useState<Course | 'new' | null>(null);
  const [form, setForm] = useState({ code: '', title: '', term: '' });
  const [formError, setFormError] = useState<string>();
  const [addingTo, setAddingTo] = useState<Course | null>(null);
  const [pick, setPick] = useState('');
  const [scanFor, setScanFor] = useState<Course | null>(null);
  const [removing, setRemoving] = useState<{ course: Course; bookId: string } | null>(null);

  const mine = useMemo(() => data.courses.filter((c) => c.facultyId === memberId).sort((a, b) => a.code.localeCompare(b.code)), [data.courses, memberId]);
  const shown = mine.filter((c) => c.status === tab);
  const days = data.settings.reserveLoanDays;

  const openForm = (c: Course | 'new') => {
    setEditing(c);
    setFormError(undefined);
    setForm(c === 'new' ? { code: '', title: '', term: '' } : { code: c.code, title: c.title, term: c.term ?? '' });
  };
  const saveForm = () => {
    const input = { code: form.code, title: form.title, term: form.term };
    const r = editing === 'new'
      ? run(() => lib.createCourse(input), (c) => `Course ${c.code} created`)
      : editing ? run(() => lib.updateCourse(editing.id, input), 'Course updated') : undefined;
    if (r) setEditing(null);
  };
  const addBook = (course: Course, bookId: string) => run(() => lib.setCourseBook(course.id, bookId, true), (c) => `Added to ${c.code} reserves`);

  return (
    <div>
      <PageHeader
        eyebrow="Faculty only"
        title="Course reserves"
        description={`Put required reading on reserve for your courses. Students then borrow those titles for ${days} days with no renewals, so the whole class gets a turn.`}
        actions={<Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => openForm('new')}>New course</Button>}
      />

      <Tabs label="Course status" value={tab} onChange={setTab} tabs={[
        { value: 'active', label: 'Active', count: mine.filter((c) => c.status === 'active').length },
        { value: 'archived', label: 'Archived', count: mine.filter((c) => c.status === 'archived').length },
      ]} />

      <div className="mt-4 space-y-4">
        {shown.length === 0 && (
          <div className="card">
            <EmptyState icon={GraduationCap} title={tab === 'active' ? 'No active courses yet' : 'No archived courses'}
              body={tab === 'active' ? 'Create a course, then add books by searching or scanning them.' : undefined}
              action={tab === 'active' ? <Button variant="primary" onClick={() => openForm('new')}>Create a course</Button> : undefined} />
          </div>
        )}
        {shown.map((c) => {
          const books = c.bookIds.map((id) => data.books.find((b) => b.id === id)).filter((b): b is NonNullable<typeof b> => !!b);
          const out = books.reduce((n, b) => n + availabilityOf(data, b.id).borrowed, 0);
          const waiting = books.reduce((n, b) => n + queueFor(data, b.id).length, 0);
          return (
            <section key={c.id} className="card overflow-hidden">
              <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-4">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-plum-soft font-display text-sm font-bold text-plum">{c.code.replace(/\d+$/, '') || c.code.slice(0, 2)}</span>
                <div className="min-w-0 flex-1">
                  <h2 className="font-display text-xl text-ink">{c.code} · {c.title}</h2>
                  <p className="text-xs text-ink-faint">{c.term ? `${c.term} · ` : ''}{books.length} title{books.length === 1 ? '' : 's'} on reserve · updated {fmtDate(c.updatedAt)}</p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {c.status === 'active' ? (
                    <>
                      <Button size="sm" variant="subtle" icon={<BookPlus className="h-3.5 w-3.5" />} onClick={() => { setAddingTo(c); setPick(''); }}>Add book</Button>
                      <Button size="sm" icon={<ScanLine className="h-3.5 w-3.5" />} onClick={() => setScanFor(c)}>Scan books</Button>
                      <Button size="sm" variant="ghost" onClick={() => openForm(c)} aria-label={`Edit ${c.code}`}><Pencil className="h-3.5 w-3.5" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => run(() => lib.setCourseStatus(c.id, 'archived'), `${c.code} archived — its books return to normal loans`)} aria-label={`Archive ${c.code}`}><Archive className="h-3.5 w-3.5" /></Button>
                    </>
                  ) : (
                    <Button size="sm" icon={<ArchiveRestore className="h-3.5 w-3.5" />} onClick={() => run(() => lib.setCourseStatus(c.id, 'active'), `${c.code} reactivated`)}>Reactivate</Button>
                  )}
                </div>
              </header>
              {c.status === 'active' && books.length > 0 && (
                <div className="flex flex-wrap gap-4 border-b border-line bg-surface-raised/50 px-5 py-2.5 text-xs text-ink-muted">
                  <span className="inline-flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> {out} cop{out === 1 ? 'y' : 'ies'} with students now</span>
                  <span>{waiting} student{waiting === 1 ? '' : 's'} waiting</span>
                  {waiting > 0 && <span className="text-plum">Consider asking the library for more copies</span>}
                </div>
              )}
              {books.length === 0 ? (
                <p className="px-5 py-6 text-sm text-ink-faint">No books on this list yet. Use <strong className="text-ink">Add book</strong> or <strong className="text-ink">Scan books</strong>.</p>
              ) : (
                <ul className="divide-y divide-line">
                  {books.map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-5 py-3">
                      <BookCover book={b} size="sm" className="w-9 shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Link to={`${base}/books/${b.id}`} className="truncate font-medium text-ink hover:text-brass">{b.title}</Link>
                        <p className="truncate text-xs text-ink-faint">{b.authors.join(', ')}</p>
                      </div>
                      <AvailabilityBadge a={availabilityOf(data, b.id)} compact />
                      {c.status === 'active' && (
                        <Button size="sm" variant="ghost" onClick={() => setRemoving({ course: c, bookId: b.id })} aria-label={`Remove ${b.title} from ${c.code}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="mt-6"><Callout tone="sky" icon={Info} title="How reserves work">
        Students borrowing a reserved title get a {days}-day loan and can’t renew it. Your own loans and other faculty keep normal terms.
        Loans made before a book went on reserve keep their original due dates. Archiving a course returns its books to normal loans.
      </Callout></div>

      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        busy={pending}
        title={editing === 'new' ? 'New course' : 'Edit course'}
        footer={<><Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button><Button variant="primary" loading={pending} onClick={saveForm}>{editing === 'new' ? 'Create course' : 'Save'}</Button></>}
      >
        <form className="grid gap-4 sm:grid-cols-[140px_1fr]" onSubmit={(e) => { e.preventDefault(); saveForm(); }}>
          <Field label="Course code" required hint="e.g. CS301"><Input data-autofocus value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))} className="font-mono uppercase" /></Field>
          <Field label="Course title" required error={formError}><Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} /></Field>
          <Field label="Term" hint="Optional, e.g. Monsoon 2026" className="sm:col-span-2"><Input value={form.term} onChange={(e) => setForm((f) => ({ ...f, term: e.target.value }))} /></Field>
          <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
        </form>
      </Dialog>

      <Dialog
        open={!!addingTo}
        onClose={() => setAddingTo(null)}
        busy={pending}
        title={addingTo ? `Add a book to ${addingTo.code}` : ''}
        footer={<><Button variant="ghost" onClick={() => setAddingTo(null)}>Close</Button><Button variant="primary" disabled={!pick} loading={pending} onClick={() => { if (addingTo && addBook(addingTo, pick)) { setPick(''); setAddingTo(null); } }}>Add to reserves</Button></>}
      >
        <Field label="Search the catalog">
          <SearchableSelect value={pick} onChange={setPick} placeholder="Title, author or ISBN"
            options={data.books.filter((b) => b.status === 'active' && !addingTo?.bookIds.includes(b.id)).map((b) => ({ value: b.id, label: b.title, description: `${b.authors.join(', ')} · ${b.isbn}` }))} />
        </Field>
      </Dialog>

      <BarcodeScanner
        open={!!scanFor}
        onClose={() => setScanFor(null)}
        title={scanFor ? `Scan books for ${scanFor.code}` : 'Scan books'}
        hint="Scan each book’s ISBN or copy label. Every match is added to the reading list; keep scanning, then press Done."
        onDetected={(code) => {
          if (!scanFor) return undefined;
          const r = resolveScan(data, code);
          if (r.kind === 'unknown-isbn') return 'That book isn’t in the catalog yet — ask the library to add it first.';
          if (r.kind === 'none') return `“${code}” isn’t a book barcode.`;
          const course = data.courses.find((c) => c.id === scanFor.id);
          if (course?.bookIds.includes(r.book.id)) return `“${r.book.title}” is already on ${scanFor.code}.`;
          return addBook(scanFor, r.book.id) ? `Added “${r.book.title}”. Scan the next book, or press Done.` : 'Couldn’t add that book.';
        }}
      />

      <ConfirmDialog
        open={!!removing}
        onClose={() => setRemoving(null)}
        title="Remove from reserves?"
        body={removing ? `“${data.books.find((b) => b.id === removing.bookId)?.title}” will go back to normal ${data.settings.loanDays}-day student loans.` : ''}
        confirmLabel="Remove"
        tone="danger"
        onConfirm={() => { if (removing) run(() => lib.setCourseBook(removing.course.id, removing.bookId, false), 'Removed from reserves'); setRemoving(null); }}
      />
    </div>
  );
}
