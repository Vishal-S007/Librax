import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Plus, Receipt } from 'lucide-react';
import type { Fine, FineSettlement } from '@/types/models';
import { useData, useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction } from '@/hooks/useAction';
import { PageHeader, StatCard, Tabs } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { Callout, EmptyState } from '@/components/ui/Feedback';
import { FineStatusBadge } from '@/components/ui/Status';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { fineBalance, fineStatus } from '@/services/common';
import { fineSummary } from '@/services/reports';
import { exportFinesCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { formatMoney, parseMoney, toDecimalString, currencySymbol } from '@/lib/money';
import { fmtDate, fmtDateTime } from '@/lib/dates';
import { Info } from 'lucide-react';

type Mode = 'settle' | 'adjust' | 'waive' | 'history';

export default function FinesPage() {
  const data = useData();
  const lib = useLibrary();
  const base = useBase();
  const { run, pending } = useAction();
  const [status, setStatus] = useQueryState('status', 'outstanding');
  const [q, setQ] = useQueryState('q');
  const [focus] = useQueryState('focus');
  const dq = useDebounced(q).trim().toLowerCase();
  const cur = data.settings.currency;
  const members = useMemo(() => new Map(data.members.map((m) => [m.id, m])), [data.members]);
  const summary = useMemo(() => fineSummary(data, { from: '0000', to: '9999' }), [data]);

  const [active, setActive] = useState<{ fine: Fine; mode: Mode } | null>(null);
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<FineSettlement['method']>('cash');
  const [reference, setReference] = useState('');
  const [reason, setReason] = useState('');
  const [direction, setDirection] = useState<'reduce' | 'increase'>('reduce');
  const [formError, setFormError] = useState<string>();
  const [adding, setAdding] = useState(false);
  const [newFine, setNewFine] = useState({ memberId: '', kind: 'damage' as 'damage' | 'lost' | 'manual', amount: '', description: '' });

  const open = (fine: Fine, mode: Mode) => {
    setActive({ fine, mode });
    setAmount(mode === 'settle' ? toDecimalString(fineBalance(fine), cur) : '');
    setReason(''); setReference(''); setMethod('cash'); setDirection('reduce'); setFormError(undefined);
  };
  const liveFine = active ? data.fines.find((f) => f.id === active.fine.id) ?? active.fine : null;

  const counts = useMemo(() => ({
    outstanding: data.fines.filter((f) => fineStatus(f) === 'outstanding').length,
    settled: data.fines.filter((f) => fineStatus(f) === 'settled').length,
    waived: data.fines.filter((f) => fineStatus(f) === 'waived').length,
    all: data.fines.length,
  }), [data.fines]);

  const rows = useMemo(() => data.fines
    .filter((f) => f.id === focus || status === 'all' || fineStatus(f) === status)
    .filter((f) => {
      if (!dq) return true;
      const m = members.get(f.memberId);
      return `${m?.name} ${m?.memberNo} ${f.description}`.toLowerCase().includes(dq);
    }), [data.fines, status, dq, members, focus]);

  const columns: Column<Fine>[] = [
    {
      key: 'member', header: 'Member', sortValue: (f) => members.get(f.memberId)?.name ?? '', hideOnMobile: true,
      render: (f) => (
        <div className={f.id === focus ? 'rounded ring-2 ring-brass ring-offset-2 ring-offset-surface' : undefined}>
          <Link to={`${base}/members/${f.memberId}`} className="font-medium text-ink hover:text-brass">{members.get(f.memberId)?.name}</Link>
          <p className="font-mono text-xs text-ink-faint">{members.get(f.memberId)?.memberNo}</p>
        </div>
      ),
    },
    { key: 'desc', header: 'Reason', sortValue: (f) => f.kind, render: (f) => <span className="line-clamp-2 text-ink-muted"><span className="capitalize text-ink">{f.kind}</span> · {f.description}</span> },
    { key: 'date', header: 'Recorded', sortValue: (f) => f.createdAt, render: (f) => <span className="text-ink-muted">{fmtDate(f.createdAt)}</span>, className: 'hidden lg:table-cell', hideOnMobile: true },
    { key: 'assessed', header: 'Assessed', align: 'right', sortValue: (f) => f.assessed, render: (f) => formatMoney(f.assessed, cur) },
    { key: 'balance', header: 'Balance', align: 'right', sortValue: (f) => fineBalance(f), render: (f) => <span className={fineBalance(f) ? 'font-medium text-rose' : 'text-ink-faint'}>{formatMoney(fineBalance(f), cur)}</span> },
    { key: 'status', header: 'Status', sortValue: (f) => fineStatus(f), render: (f) => <FineStatusBadge status={fineStatus(f)} /> },
    {
      key: 'actions', header: '', align: 'right',
      render: (f) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {fineBalance(f) > 0 && <Button size="sm" variant="subtle" onClick={() => open(f, 'settle')}>Record payment</Button>}
          <Button size="sm" variant="ghost" onClick={() => open(f, 'adjust')}>Adjust</Button>
          {fineBalance(f) > 0 && <Button size="sm" variant="ghost" onClick={() => open(f, 'waive')}>Waive</Button>}
          <Button size="sm" variant="ghost" onClick={() => open(f, 'history')}>History</Button>
        </div>
      ),
    },
  ];

  const submit = () => {
    if (!active || !liveFine) return;
    setFormError(undefined);
    if (active.mode === 'settle') {
      const v = parseMoney(amount, cur);
      if (v === null || v <= 0) { setFormError('Enter a valid amount'); return; }
      if (run(() => lib.settleFine(liveFine.id, v, method, reference), `Recorded ${formatMoney(v, cur)} payment`)) setActive(null);
    } else if (active.mode === 'adjust') {
      const v = parseMoney(amount, cur);
      if (v === null || v <= 0) { setFormError('Enter a positive amount'); return; }
      if (reason.trim().length < 3) { setFormError('Give a reason (at least 3 characters)'); return; }
      const signed = direction === 'reduce' ? -v : v;
      if (run(() => lib.adjustFine(liveFine.id, signed, reason), 'Fine adjusted')) setActive(null);
    } else if (active.mode === 'waive') {
      if (reason.trim().length < 3) { setFormError('Give a reason (at least 3 characters)'); return; }
      if (run(() => lib.waiveFine(liveFine.id, reason), 'Fine waived')) setActive(null);
    }
  };

  const addCharge = () => {
    const v = parseMoney(newFine.amount, cur);
    if (!newFine.memberId) { setFormError('Choose a member'); return; }
    if (v === null || v <= 0) { setFormError('Enter a valid amount'); return; }
    if (!newFine.description.trim()) { setFormError('Describe the charge'); return; }
    const r = run(() => lib.addFine({ memberId: newFine.memberId, amount: v, kind: newFine.kind, description: newFine.description }), 'Charge recorded');
    if (r) { setAdding(false); setNewFine({ memberId: '', kind: 'damage', amount: '', description: '' }); setFormError(undefined); }
  };

  const titles: Record<Mode, string> = { settle: 'Record a desk payment', adjust: 'Adjust fine', waive: 'Waive remaining balance', history: 'Fine history' };

  return (
    <div>
      <PageHeader
        eyebrow="Accounts"
        title="Fines"
        description="All amounts are stored as whole minor units (no floating point). Payments are recorded locally — no online payment is processed."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-fines-${new Date().toISOString().slice(0, 10)}.csv`, exportFinesCsv(data))}>Export CSV</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => { setAdding(true); setFormError(undefined); }}>Add charge</Button>
          </>
        }
      />
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatCard label="Outstanding" value={formatMoney(summary.outstanding, cur)} icon={Receipt} tone="rose" />
        <StatCard label="Total assessed" value={formatMoney(summary.assessed, cur)} icon={Receipt} />
        <StatCard label="Collected at desk" value={formatMoney(summary.collected, cur)} icon={Receipt} tone="sage" />
        <StatCard label="Net adjustments" value={formatMoney(summary.adjusted, cur)} icon={Receipt} tone="sky" />
      </div>
      <Tabs label="Fine status" value={status as 'outstanding'} onChange={(v) => setStatus(v)} tabs={[
        { value: 'outstanding', label: 'Outstanding', count: counts.outstanding },
        { value: 'settled', label: 'Settled', count: counts.settled },
        { value: 'waived', label: 'Waived', count: counts.waived },
        { value: 'all', label: 'All', count: counts.all },
      ]} />
      <div className="card mt-4 overflow-hidden">
        <Toolbar><SearchInput value={q} onChange={setQ} label="Search fines" placeholder="Member name, member number or reason…" /></Toolbar>
        <DataTable
          caption="Fines"
          rows={rows}
          columns={columns}
          rowKey={(f) => f.id}
          initialSort={{ key: 'date', dir: 'desc' }}
          resetKey={`${status}|${dq}`}
          mobileTitle={(f) => <p className="font-medium text-ink">{members.get(f.memberId)?.name}</p>}
          empty={<EmptyState icon={Receipt} title={status === 'outstanding' ? 'No outstanding fines' : 'No fines here'} body={dq ? 'Nothing matches your search.' : undefined} />}
        />
      </div>

      <Dialog
        open={!!active}
        onClose={() => setActive(null)}
        busy={pending}
        title={active ? titles[active.mode] : ''}
        description={liveFine ? `${members.get(liveFine.memberId)?.name} · balance ${formatMoney(fineBalance(liveFine), cur)}` : undefined}
        footer={active?.mode === 'history'
          ? <Button onClick={() => setActive(null)}>Close</Button>
          : <><Button variant="ghost" onClick={() => setActive(null)}>Cancel</Button><Button variant={active?.mode === 'waive' ? 'danger' : 'primary'} loading={pending} onClick={submit}>{active?.mode === 'settle' ? 'Record payment' : active?.mode === 'waive' ? 'Waive balance' : 'Save adjustment'}</Button></>}
      >
        {liveFine && active && (
          <div className="space-y-4">
            <p className="text-sm text-ink-muted">{liveFine.description}</p>
            {active.mode === 'settle' && (
              <>
                <Callout tone="sky" icon={Info}>This records money taken at the desk. LIBRAX does not process card or online payments.</Callout>
                <Field label={`Amount (${currencySymbol(cur).trim()})`} required error={formError}>
                  <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} data-autofocus />
                </Field>
                <Field label="Method">
                  <Select value={method} onChange={(e) => setMethod(e.target.value as FineSettlement['method'])}>
                    <option value="cash">Cash at desk</option>
                    <option value="card_at_desk">Card terminal at desk</option>
                    <option value="waiver_note">Signed waiver note</option>
                    <option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Receipt reference" hint="Optional"><Input value={reference} onChange={(e) => setReference(e.target.value)} /></Field>
              </>
            )}
            {active.mode === 'adjust' && (
              <>
                <Field label="Direction">
                  <Select value={direction} onChange={(e) => setDirection(e.target.value as 'reduce' | 'increase')}>
                    <option value="reduce">Reduce balance</option>
                    <option value="increase">Increase balance</option>
                  </Select>
                </Field>
                <Field label={`Amount (${currencySymbol(cur).trim()})`} required><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Field label="Reason" required error={formError} hint="Recorded permanently in the audit trail"><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} /></Field>
              </>
            )}
            {active.mode === 'waive' && (
              <Field label="Reason for waiver" required error={formError}><Textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} data-autofocus /></Field>
            )}
            {active.mode === 'history' && (
              <ol className="space-y-3 border-l border-line pl-4 text-sm">
                <li><p className="text-ink">Assessed {formatMoney(liveFine.assessed, cur)}</p><p className="text-xs text-ink-faint">{fmtDateTime(liveFine.createdAt)}</p></li>
                {[...liveFine.adjustments.map((a) => ({ at: a.at, text: `Adjusted ${formatMoney(a.amount, cur)} — ${a.reason}`, by: a.by })),
                  ...liveFine.settlements.map((s) => ({ at: s.at, text: `Payment ${formatMoney(s.amount, cur)} (${s.method.replace(/_/g, ' ')}${s.reference ? `, ${s.reference}` : ''})`, by: s.by }))]
                  .sort((x, y) => x.at.localeCompare(y.at))
                  .map((e, i) => <li key={i}><p className="text-ink">{e.text}</p><p className="text-xs text-ink-faint">{fmtDateTime(e.at)} · {e.by}</p></li>)}
              </ol>
            )}
          </div>
        )}
      </Dialog>

      <Dialog
        open={adding}
        onClose={() => setAdding(false)}
        busy={pending}
        title="Add a charge"
        description="For damaged or lost items, or other manual charges."
        footer={<><Button variant="ghost" onClick={() => setAdding(false)}>Cancel</Button><Button variant="primary" loading={pending} onClick={addCharge}>Record charge</Button></>}
      >
        <div className="space-y-4">
          <Field label="Member" required>
            <SearchableSelect value={newFine.memberId} onChange={(v) => setNewFine((s) => ({ ...s, memberId: v }))} placeholder="Search members"
              options={data.members.map((m) => ({ value: m.id, label: m.name, description: m.memberNo }))} />
          </Field>
          <Field label="Type">
            <Select value={newFine.kind} onChange={(e) => setNewFine((s) => ({ ...s, kind: e.target.value as 'damage' | 'lost' | 'manual' }))}>
              <option value="damage">Damage</option><option value="lost">Lost item</option><option value="manual">Other</option>
            </Select>
          </Field>
          <Field label={`Amount (${currencySymbol(cur).trim()})`} required><Input inputMode="decimal" value={newFine.amount} onChange={(e) => setNewFine((s) => ({ ...s, amount: e.target.value }))} /></Field>
          <Field label="Description" required error={formError}><Textarea rows={2} value={newFine.description} onChange={(e) => setNewFine((s) => ({ ...s, description: e.target.value }))} /></Field>
        </div>
      </Dialog>
    </div>
  );
}
