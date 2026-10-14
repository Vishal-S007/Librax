import { useEffect, useMemo, useState } from 'react';
import { Info, Save } from 'lucide-react';
import type { Settings } from '@/types/models';
import { useData, useLibrary } from '@/app/providers';
import { useAction } from '@/hooks/useAction';
import { Card, PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Checkbox, Input, Select } from '@/components/ui/Input';
import { Callout } from '@/components/ui/Feedback';
import { CardSeriesCard } from './CardSeriesCard';
import { settingsSchema } from '@/repositories/schema';
import { SUPPORTED_CURRENCIES, currencySymbol, parseMoney, toDecimalString } from '@/lib/money';

type Form = Record<keyof Settings, string | boolean>;
const MONEY: (keyof Settings)[] = ['fineRatePerDay', 'maxFinePerLoan', 'blockBorrowingAbove'];
const INTS: (keyof Settings)[] = ['loanDays', 'facultyLoanDays', 'maxBorrowStudent', 'maxBorrowFaculty', 'maxBorrowStaff', 'renewalLimit', 'facultyRenewalLimit', 'fineGraceDays', 'pickupDays', 'dueSoonDays', 'reserveLoanDays'];

function toForm(s: Settings): Form {
  const f = { ...s } as unknown as Form;
  for (const k of MONEY) f[k] = toDecimalString(s[k] as number, s.currency);
  for (const k of INTS) f[k] = String(s[k]);
  return f;
}

export default function SettingsPage() {
  const data = useData();
  const lib = useLibrary();
  const { run, pending } = useAction();
  const initial = useMemo(() => toForm(data.settings), [data.settings]);
  const [form, setForm] = useState<Form>(initial);
  useEffect(() => setForm(initial), [initial]);
  const [errors, setErrors] = useState<Partial<Record<keyof Settings, string>>>({});
  const set = (k: keyof Settings, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));
  const dirty = JSON.stringify(form) !== JSON.stringify(initial);
  const cur = String(form.currency);
  const sym = currencySymbol(cur).trim();

  const save = () => {
    const errs: Partial<Record<keyof Settings, string>> = {};
    const out: Record<string, unknown> = { ...form, cardSeries: data.settings.cardSeries };
    for (const k of MONEY) {
      const v = parseMoney(String(form[k]), cur);
      if (v === null) errs[k] = 'Enter an amount like 5.00'; else out[k] = v;
    }
    for (const k of INTS) {
      const n = Number(form[k]);
      if (String(form[k]).trim() === '' || !Number.isInteger(n)) errs[k] = 'Enter a whole number'; else out[k] = n;
    }
    if (Object.keys(errs).length === 0) {
      const parsed = settingsSchema.safeParse(out);
      if (!parsed.success) for (const i of parsed.error.issues) errs[i.path[0] as keyof Settings] ??= i.message;
      else if (run(() => lib.updateSettings(parsed.data), 'Settings saved')) { setErrors({}); return; }
    }
    setErrors(errs);
  };

  const num = (k: keyof Settings, label: string, hint?: string, suffix?: string) => (
    <Field label={label} error={errors[k]} hint={hint}>
      <div className="relative">
        <Input type="number" inputMode="numeric" value={String(form[k])} onChange={(e) => set(k, e.target.value)} className={suffix ? 'pr-14' : undefined} />
        {suffix && <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-ink-faint">{suffix}</span>}
      </div>
    </Field>
  );
  const money = (k: keyof Settings, label: string, hint?: string) => (
    <Field label={`${label} (${sym})`} error={errors[k]} hint={hint}>
      <Input inputMode="decimal" value={String(form[k])} onChange={(e) => set(k, e.target.value)} />
    </Field>
  );

  return (
    <div>
      <PageHeader eyebrow="System" title="Library settings" description="Policies used throughout circulation, reservations and fines."
        actions={<>
          <Button variant="ghost" disabled={!dirty || pending} onClick={() => { setForm(initial); setErrors({}); }}>Discard</Button>
          <Button variant="primary" icon={<Save className="h-4 w-4" />} disabled={!dirty} loading={pending} onClick={save}>Save settings</Button>
        </>} />
      <div className="mb-6"><Callout tone="sky" icon={Info} title="When changes take effect">
        Loan periods and limits apply to loans issued after saving — existing due dates are not changed. Renewal limits apply at the next renewal.
        Fine rate, grace period and cap apply to every return processed after saving; fines already recorded are never recalculated. The pickup period applies to new holds.
      </Callout></div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Library">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Library name" error={errors.libraryName} className="sm:col-span-2"><Input value={String(form.libraryName)} onChange={(e) => set('libraryName', e.target.value)} /></Field>
            <Field label="Currency" error={errors.currency} hint="Existing amounts keep their minor units">
              <Select value={cur} onChange={(e) => set('currency', e.target.value)}>{SUPPORTED_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}</Select>
            </Field>
            <Field label="Theme" error={errors.theme}>
              <Select value={String(form.theme)} onChange={(e) => set('theme', e.target.value)}>
                <option value="dark">Dark</option><option value="light">Light</option><option value="system">Match system</option>
              </Select>
            </Field>
          </div>
        </Card>
        <Card title="Loans">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('loanDays', 'Student & staff loan period', undefined, 'days')}
            {num('facultyLoanDays', 'Faculty loan period', undefined, 'days')}
            {num('maxBorrowStudent', 'Student borrowing limit', undefined, 'items')}
            {num('maxBorrowFaculty', 'Faculty borrowing limit', undefined, 'items')}
            {num('maxBorrowStaff', 'Staff borrowing limit', undefined, 'items')}
            {num('dueSoonDays', 'Due-soon reminder', 'Days before the due date', 'days')}
          </div>
        </Card>
        <Card title="Renewals & reservations">
          <div className="grid gap-4 sm:grid-cols-2">
            {num('renewalLimit', 'Renewals per loan (students/staff)')}
            {num('facultyRenewalLimit', 'Renewals per loan (faculty)')}
            {num('pickupDays', 'Hold pickup window', undefined, 'days')}
            {num('reserveLoanDays', 'Course-reserve student loan', 'Faculty set reserves; no renewals', 'days')}
            <div className="flex items-end pb-2"><Checkbox label="Block renewal of overdue items" checked={!!form.blockRenewalWhenOverdue} onChange={(e) => set('blockRenewalWhenOverdue', e.target.checked)} /></div>
          </div>
        </Card>
        <Card title="Fines">
          <div className="grid gap-4 sm:grid-cols-2">
            {money('fineRatePerDay', 'Daily fine')}
            {num('fineGraceDays', 'Grace period', 'Late days that are free', 'days')}
            {money('maxFinePerLoan', 'Maximum per loan', '0 means no cap')}
            {money('blockBorrowingAbove', 'Block borrowing above', '0 disables the check')}
          </div>
        </Card>
        <CardSeriesCard />
      </div>
    </div>
  );
}
