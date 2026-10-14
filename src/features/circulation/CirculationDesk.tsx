import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { BookCheck, BookDown, CheckCircle2, CircleX, RefreshCw, ScanLine, TriangleAlert, Undo2, UserRound } from 'lucide-react';
import type { Loan, Reservation, Fine } from '@/types/models';
import { useData, useLibrary, useNow } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useToast } from '@/components/ui/Toast';
import { PageHeader, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Checkbox, Input, Textarea } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { SearchInput } from '@/components/ui/Toolbar';
import { Badge } from '@/components/ui/Badge';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { CopyStatusBadge, MemberStatusBadge } from '@/components/ui/Status';
import { BookCover } from '@/components/books/BookCover';
import { dueDateFor, issueChecks, loanDaysForBook, renewalChecks, type Check } from '@/services/circulation';
import { activeLoans, availabilityOf, borrowLimitFor, isOverdue, loanDaysFor, memberBalance, overdueFine } from '@/services/common';
import { queueFor } from '@/services/reservations';
import { resolveScan } from '@/services/scan';
import { BarcodeScanner, ScanButton } from '@/components/scan/BarcodeScanner';
import { formatMoney } from '@/lib/money';
import { fmtDate, daysUntil, nowISO } from '@/lib/dates';
import { errorMessage } from '@/lib/errors';
import { cn } from '@/lib/cn';

type Mode = 'issue' | 'return' | 'renew';

function Checklist({ checks }: { checks: Check[] }) {
  if (checks.length === 0) return null;
  return (
    <ul className="space-y-2" aria-label="Eligibility checks">
      {checks.map((c) => (
        <li key={c.id} className="flex items-start gap-2.5 text-sm">
          {c.ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage" aria-label="Passed" /> : <CircleX className="mt-0.5 h-4 w-4 shrink-0 text-rose" aria-label="Failed" />}
          <div>
            <p className={cn('font-medium', c.ok ? 'text-ink' : 'text-rose')}>{c.label}</p>
            <p className="text-xs text-ink-muted">{c.detail}</p>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Panel({ step, title, children }: { step: number; title: string; children: ReactNode }) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brass-soft text-xs font-bold text-brass">{step}</span>
        <h2 className="font-sans text-sm font-semibold text-ink">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Receipt({ icon: Icon, title, lines, onDone, doneLabel }: { icon: typeof BookCheck; title: string; lines: ReactNode[]; onDone: () => void; doneLabel: string }) {
  return (
    <motion.div initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }} className="card mx-auto max-w-lg p-8 text-center" role="status">
      <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-sage-soft"><Icon className="h-7 w-7 text-sage" /></span>
      <h2 className="mt-4 font-display text-2xl text-ink">{title}</h2>
      <div className="mt-4 space-y-1.5 text-sm text-ink-muted">{lines.map((l, i) => <p key={i}>{l}</p>)}</div>
      <Button variant="primary" className="mt-6" onClick={onDone} data-autofocus>{doneLabel}</Button>
    </motion.div>
  );
}

export default function CirculationDesk() {
  const [mode, setMode] = useQueryState('mode', 'issue');
  return (
    <div>
      <PageHeader eyebrow="Circulation" title="Circulation desk" description="Issue, return and renew with every policy checked before anything changes." />
      <Tabs
        label="Circulation mode"
        value={mode as Mode}
        onChange={(v) => setMode(v)}
        tabs={[{ value: 'issue', label: 'Issue' }, { value: 'return', label: 'Return' }, { value: 'renew', label: 'Renew' }]}
      />
      <div className="mt-5">
        <AnimatePresence mode="wait">
          <motion.div key={mode} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.15 }}>
            {mode === 'return' ? <ReturnFlow /> : mode === 'renew' ? <RenewFlow /> : <IssueFlow />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ---------------- Issue ---------------- */

function IssueFlow() {
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const base = useBase();
  const toast = useToast();
  const [memberParam] = useQueryState('member');
  const [memberId, setMemberId] = useState<string>(memberParam);
  const [copyId, setCopyId] = useState<string>('');
  const [scan, setScan] = useState('');
  const [scanError, setScanError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ loan: Loan; fulfilled?: Reservation } | null>(null);
  const member = data.members.find((m) => m.id === memberId);
  const copy = data.copies.find((c) => c.id === copyId);
  const book = copy ? data.books.find((b) => b.id === copy.bookId) : undefined;
  const checks = useMemo(() => issueChecks(data, memberId || undefined, copyId || undefined, now), [data, memberId, copyId, now]);
  const ready = !!member && !!copy && checks.every((c) => c.ok);
  const cur = data.settings.currency;

  const memberOptions = useMemo(() => data.members.map((m) => ({
    value: m.id, label: m.name, description: `${m.memberNo} · ${m.type} · ${m.department}`, keywords: m.email,
    meta: m.status !== 'active' ? <MemberStatusBadge status={m.status} /> : undefined,
  })), [data.members]);

  const copyOptions = useMemo(() => {
    const books = new Map(data.books.map((b) => [b.id, b]));
    return data.copies
      .filter((c) => c.status === 'available' || (c.status === 'on_hold' && data.reservations.some((r) => r.copyId === c.id && r.status === 'ready' && r.memberId === memberId)))
      .filter((c) => books.get(c.bookId)?.status === 'active')
      .map((c) => {
        const b = books.get(c.bookId)!;
        return { value: c.id, label: `${b.title}`, description: `${c.barcode} · ${c.shelfLocation}`, keywords: `${b.isbn} ${b.authors.join(' ')}`, meta: c.status === 'on_hold' ? <Badge tone="plum">Held for member</Badge> : undefined };
      })
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [data, memberId]);

  const heldForMember = useMemo(() => (memberId ? data.reservations.filter((r) => r.memberId === memberId && r.status === 'ready') : []), [data.reservations, memberId]);

  const [scanning, setScanning] = useState(false);

  /** Accepts a copy barcode or the ISBN printed on the book. Returns an error message, or undefined on success. */
  const applyCode = (raw: string): string | undefined => {
    const r = resolveScan(data, raw, memberId || undefined);
    if (r.kind === 'copy') { setCopyId(r.copy.id); return undefined; }
    if (r.kind === 'book') {
      if (r.copy) { setCopyId(r.copy.id); return undefined; }
      const a = availabilityOf(data, r.book.id);
      return `“${r.book.title}” has no copy free to issue — ${a.borrowed} on loan, ${a.onHold} on hold${a.waiting ? `, ${a.waiting} waiting` : ''}.`;
    }
    if (r.kind === 'unknown-isbn') return `ISBN ${r.isbn} isn’t in the catalog yet.`;
    return `“${raw.trim()}” isn’t a LIBRAX barcode or a valid ISBN.`;
  };
  const lookup = () => {
    if (!scan.trim()) return;
    const err = applyCode(scan);
    setScanError(err);
    if (!err) setScan('');
  };
  const onCameraScan = (code: string) => {
    const err = applyCode(code);
    if (!err) { setScanError(undefined); setScanning(false); return undefined; }
    return err;
  };

  const issue = () => {
    if (!ready || busy || !member || !copy) return;
    setBusy(true);
    try {
      const r = lib.issue(member.id, copy.id);
      setDone(r);
    } catch (e) {
      toast.error('Issue blocked', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const b = data.books.find((x) => x.id === done.loan.bookId);
    return (
      <Receipt
        icon={BookDown}
        title="Book issued"
        lines={[
          <>“<span className="text-ink">{b?.title}</span>” to <span className="text-ink">{member?.name}</span></>,
          <>Due back <strong className="text-ink">{fmtDate(done.loan.dueAt)}</strong></>,
          ...(done.fulfilled ? ['Their reservation for this title was fulfilled.'] : []),
        ]}
        doneLabel="Issue another"
        onDone={() => { setDone(null); setCopyId(''); }}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_1fr_0.9fr]">
      <Panel step={1} title="Member">
        <Field label="Find member">
          <SearchableSelect value={memberId} onChange={(v) => { setMemberId(v); }} options={memberOptions} placeholder="Name, member number or email" />
        </Field>
        {member ? (
          <div className="mt-4 rounded-control border border-line bg-surface-raised p-4">
            <div className="flex items-center justify-between gap-2">
              <Link to={`${base}/members/${member.id}`} className="font-medium text-ink hover:text-brass">{member.name}</Link>
              <MemberStatusBadge status={member.status} />
            </div>
            <p className="mt-0.5 text-xs text-ink-faint">{member.memberNo} · <span className="capitalize">{member.type}</span></p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
              <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-faint">On loan</dt><dd className="font-display text-lg tabular text-ink">{activeLoans(data, member.id).length}/{borrowLimitFor(member, data.settings)}</dd></div>
              <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-faint">Overdue</dt><dd className="font-display text-lg tabular text-ink">{activeLoans(data, member.id).filter((l) => isOverdue(l, now)).length}</dd></div>
              <div className="rounded-md bg-surface p-2"><dt className="text-[11px] text-ink-faint">Owes</dt><dd className="font-display text-lg tabular text-ink">{formatMoney(memberBalance(data, member.id), cur)}</dd></div>
            </dl>
            {heldForMember.length > 0 && (
              <div className="mt-3">
                <p className="eyebrow mb-1.5">Waiting for pickup</p>
                <ul className="space-y-1.5">
                  {heldForMember.map((r) => {
                    const c = data.copies.find((x) => x.id === r.copyId);
                    return (
                      <li key={r.id}>
                        <button onClick={() => r.copyId && setCopyId(r.copyId)} className="flex w-full items-center gap-2 rounded-md border border-plum/30 bg-plum-soft/50 px-2.5 py-1.5 text-left text-xs hover:border-plum">
                          <span className="flex-1 truncate text-ink">{data.books.find((b) => b.id === r.bookId)?.title}</span>
                          <span className="font-mono text-ink-muted">{c?.barcode}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon={UserRound} title="Choose a member" body="Search by name, member number or email." className="py-8" />
        )}
      </Panel>

      <Panel step={2} title="Copy">
        <Field label="Copy barcode or book ISBN" error={scanError} hint="Scan with the camera, a USB scanner, or type and press Enter">
          <div className="flex gap-2">
            <Input value={scan} onChange={(e) => setScan(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); lookup(); } }} placeholder="LBX-000123 or 978…" className="font-mono uppercase" />
            <ScanButton onClick={() => setScanning(true)} label="Scan with camera" />
          </div>
        </Field>
        <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onCameraScan} title="Scan the book to issue"
          hint="Scan the ISBN on the back cover or the LIBRAX copy label. A copy held for this member is picked first." />
        <div className="my-3 flex items-center gap-3 text-xs text-ink-faint"><span className="h-px flex-1 bg-line" />or search<span className="h-px flex-1 bg-line" /></div>
        <SearchableSelect value={copyId} onChange={setCopyId} options={copyOptions} placeholder="Title, author or ISBN" emptyText="No available copies match" />
        {copy && book ? (
          <div className="mt-4 flex gap-3 rounded-control border border-line bg-surface-raised p-3">
            <BookCover book={book} size="sm" className="w-12 shrink-0" />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-ink">{book.title}</p>
              <p className="truncate text-xs text-ink-faint">{book.authors.join(', ')}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs">
                <span className="font-mono text-ink-muted">{copy.barcode}</span>
                <CopyStatusBadge status={copy.status} />
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon={ScanLine} title="Scan or search a copy" className="py-8" />
        )}
      </Panel>

      <Panel step={3} title="Checks & confirm">
        {!member && !copy ? (
          <p className="text-sm text-ink-faint">Select a member and a copy to run the borrowing rules.</p>
        ) : (
          <Checklist checks={checks} />
        )}
        {member && copy && (
          <div className="mt-5 rounded-control border border-line bg-surface-raised p-3 text-sm">
            <p className="text-ink-muted">Due date</p>
            <p className="font-display text-xl text-ink">{fmtDate(dueDateFor(member, data, nowISO(), copy.bookId))}</p>
            <p className="text-xs text-ink-faint">{loanDaysForBook(data, member, copy.bookId)}-day {loanDaysForBook(data, member, copy.bookId) < loanDaysFor(member, data.settings) ? 'course-reserve' : member.type} loan period</p>
          </div>
        )}
        <Button variant="primary" size="lg" className="mt-5 w-full justify-center" disabled={!ready} loading={busy} onClick={issue} icon={<BookDown className="h-4 w-4" />}>
          Issue book
        </Button>
      </Panel>
    </div>
  );
}

/* ---------------- Return ---------------- */

function LoanPicker({ value, onChange, filter }: { value: string; onChange: (id: string) => void; filter?: (l: Loan) => boolean }) {
  const data = useData();
  const now = useNow();
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const onCameraScan = (code: string): string | undefined => {
    const r = resolveScan(data, code);
    const open = activeLoans(data).filter((l) => (filter ? filter(l) : true));
    if (r.kind === 'copy') {
      const loan = open.find((l) => l.copyId === r.copy.id);
      if (!loan) return `Copy ${r.copy.barcode} is not on loan.`;
      onChange(loan.id); setQ(''); setScanning(false); return undefined;
    }
    if (r.kind === 'book') {
      const matches = open.filter((l) => l.bookId === r.book.id);
      if (matches.length === 0) return `No copy of “${r.book.title}” is on loan.`;
      if (matches.length === 1) { onChange(matches[0]!.id); setQ(''); setScanning(false); return undefined; }
      setQ(r.book.title); setScanning(false); return undefined; // several copies out: show them all
    }
    if (r.kind === 'unknown-isbn') return `ISBN ${r.isbn} isn’t in the catalog.`;
    return `“${code}” isn’t a LIBRAX barcode or ISBN.`;
  };
  const loans = useMemo(() => {
    const qq = q.trim().toLowerCase();
    return activeLoans(data)
      .filter((l) => (filter ? filter(l) : true))
      .map((l) => ({ l, b: data.books.find((x) => x.id === l.bookId), m: data.members.find((x) => x.id === l.memberId), c: data.copies.find((x) => x.id === l.copyId) }))
      .filter((x) => !qq || `${x.c?.barcode} ${x.b?.title} ${x.m?.name} ${x.m?.memberNo}`.toLowerCase().includes(qq))
      .sort((a, b) => a.l.dueAt.localeCompare(b.l.dueAt));
  }, [data, q, filter]);
  return (
    <div>
      <div className="flex gap-2">
        <SearchInput value={q} onChange={setQ} label="Find active loan" placeholder="Barcode, title or member" />
        <ScanButton onClick={() => setScanning(true)} label="Scan the returned book" />
      </div>
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onCameraScan} title="Scan the book"
        hint="Scan the copy label or the ISBN. If several copies of that title are out, you’ll pick the right one." />
      <ul className="mt-3 max-h-[420px] space-y-1.5 overflow-y-auto pr-1" role="listbox" aria-label="Active loans">
        {loans.length === 0 && <li className="py-10 text-center text-sm text-ink-faint">{q ? 'No active loan matches.' : 'No active loans.'}</li>}
        {loans.slice(0, 60).map(({ l, b, m, c }) => {
          const od = isOverdue(l, now);
          return (
            <li key={l.id}>
              <button
                role="option"
                aria-selected={value === l.id}
                onClick={() => onChange(l.id)}
                className={cn('flex w-full items-center gap-3 rounded-control border p-2.5 text-left transition', value === l.id ? 'border-brass bg-brass-soft/40' : 'border-line hover:border-line-strong')}
              >
                {b && <BookCover book={b} size="sm" className="w-8 shrink-0" />}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{b?.title}</p>
                  <p className="truncate text-xs text-ink-muted">{m?.name} · <span className="font-mono">{c?.barcode}</span></p>
                </div>
                <Badge tone={od ? 'rose' : 'sky'}>{od ? `${-daysUntil(l.dueAt, now)}d late` : `due ${fmtDate(l.dueAt)}`}</Badge>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function ReturnFlow() {
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const toast = useToast();
  const [loanId, setLoanId] = useState('');
  const [damaged, setDamaged] = useState(false);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ title: string; member: string; fine?: Fine; heldFor?: Reservation; damaged: boolean } | null>(null);
  const loan = data.loans.find((l) => l.id === loanId && !l.returnedAt);
  const book = loan ? data.books.find((b) => b.id === loan.bookId) : undefined;
  const member = loan ? data.members.find((m) => m.id === loan.memberId) : undefined;
  const fine = loan ? overdueFine(loan.dueAt, now, data.settings) : null;
  const next = loan ? queueFor(data, loan.bookId).find((r) => data.members.find((m) => m.id === r.memberId)?.status === 'active') : undefined;
  const cur = data.settings.currency;

  const confirm = () => {
    if (!loan || busy) return;
    setBusy(true);
    try {
      const r = lib.returnLoan(loan.id, { damaged, note: note.trim() || undefined });
      setDone({ title: book?.title ?? '', member: member?.name ?? '', fine: r.fine, heldFor: r.heldFor, damaged });
      setLoanId(''); setDamaged(false); setNote('');
    } catch (e) {
      toast.error('Return failed', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    const heldMember = done.heldFor ? data.members.find((m) => m.id === done.heldFor!.memberId)?.name : undefined;
    return (
      <Receipt
        icon={BookCheck}
        title="Return recorded"
        lines={[
          <>“<span className="text-ink">{done.title}</span>” from {done.member}</>,
          done.fine ? <span className="text-rose">Overdue fine recorded: {formatMoney(done.fine.assessed, cur)}</span> : 'No fine — returned on time or within the grace period.',
          done.damaged ? 'Copy marked damaged and taken out of circulation.' : done.heldFor ? <>Copy placed <strong className="text-ink">on hold for {heldMember}</strong> (next in queue).</> : 'Copy is back on the shelf.',
        ]}
        doneLabel="Return another"
        onDone={() => setDone(null)}
      />
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Panel step={1} title="Find the loan"><LoanPicker value={loanId} onChange={setLoanId} /></Panel>
      <Panel step={2} title="Confirm return">
        {!loan || !book ? (
          <EmptyState icon={Undo2} title="Select a loan" body="Scan the copy’s barcode or search by title or member." className="py-10" />
        ) : (
          <div className="space-y-4">
            <div className="flex gap-3">
              <BookCover book={book} size="sm" className="w-14 shrink-0" />
              <div className="min-w-0">
                <p className="font-medium text-ink">{book.title}</p>
                <p className="text-sm text-ink-muted">{member?.name} · {member?.memberNo}</p>
                <p className="text-xs text-ink-faint">Issued {fmtDate(loan.issuedAt)} · due {fmtDate(loan.dueAt)}</p>
              </div>
            </div>
            {fine && fine.days > 0 ? (
              <Callout tone={fine.amount > 0 ? 'rose' : 'brass'} icon={TriangleAlert} title={`${fine.days} day${fine.days > 1 ? 's' : ''} late`}>
                {fine.amount > 0
                  ? <>A fine of <strong className="text-ink">{formatMoney(fine.amount, cur)}</strong> will be recorded ({fine.chargeableDays} chargeable day{fine.chargeableDays > 1 ? 's' : ''} × {formatMoney(data.settings.fineRatePerDay, cur)}{data.settings.maxFinePerLoan && fine.amount === data.settings.maxFinePerLoan ? ', capped' : ''}).</>
                  : <>Within the {data.settings.fineGraceDays}-day grace period — no fine.</>}
              </Callout>
            ) : (
              <Callout tone="sage" icon={CheckCircle2}>On time — no fine.</Callout>
            )}
            {next && !damaged && (
              <Callout tone="sky" title="Reservation waiting">
                This copy will be held for <strong className="text-ink">{data.members.find((m) => m.id === next.memberId)?.name}</strong> for {data.settings.pickupDays} days.
              </Callout>
            )}
            <Checkbox label="Copy returned damaged — take out of circulation" checked={damaged} onChange={(e) => setDamaged(e.target.checked)} />
            {damaged && (
              <Field label="Damage note" hint="Recorded on the copy. Add a damage charge from Fines if needed.">
                <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
              </Field>
            )}
            <Button variant="primary" size="lg" className="w-full justify-center" onClick={confirm} loading={busy} icon={<BookCheck className="h-4 w-4" />}>Confirm return</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}

/* ---------------- Renew ---------------- */

function RenewFlow() {
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const toast = useToast();
  const [loanId, setLoanId] = useState('');
  const [busy, setBusy] = useState(false);
  const loan = data.loans.find((l) => l.id === loanId && !l.returnedAt);
  const member = loan ? data.members.find((m) => m.id === loan.memberId) : undefined;
  const checks = useMemo(() => (loanId ? renewalChecks(data, loanId, now) : []), [data, loanId, now]);
  const ok = !!loan && checks.every((c) => c.ok);
  const newDue = loan && member ? dueDateFor(member, data, loan.dueAt > now ? loan.dueAt : now) : undefined;

  const renew = () => {
    if (!loan || busy) return;
    setBusy(true);
    try {
      const l = lib.renew(loan.id);
      toast.success('Renewed', `Now due ${fmtDate(l.dueAt)}.`);
    } catch (e) {
      toast.error('Renewal refused', errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
      <Panel step={1} title="Find the loan"><LoanPicker value={loanId} onChange={setLoanId} /></Panel>
      <Panel step={2} title="Renewal rules">
        {!loan ? (
          <EmptyState icon={RefreshCw} title="Select a loan" className="py-10" />
        ) : (
          <div className="space-y-5">
            <p className="text-sm text-ink-muted">
              “<span className="text-ink">{data.books.find((b) => b.id === loan.bookId)?.title}</span>” · {member?.name} · due {fmtDate(loan.dueAt)}
            </p>
            <Checklist checks={checks} />
            {ok && newDue && <p className="text-sm text-ink-muted">New due date: <strong className="text-ink">{fmtDate(newDue)}</strong></p>}
            <Button variant="primary" size="lg" className="w-full justify-center" disabled={!ok} loading={busy} onClick={renew} icon={<RefreshCw className="h-4 w-4" />}>Renew loan</Button>
          </div>
        )}
      </Panel>
    </div>
  );
}
