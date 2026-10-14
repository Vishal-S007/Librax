import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodFormResolver } from '@/lib/formResolver';
import type { Copy } from '@/types/models';
import { copyInputSchema, type CopyFormValues, type CopyInput } from '@/services/validation';
import { useData, useLibrary } from '@/app/providers';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { SearchableSelect } from '@/components/ui/SearchableSelect';
import { useToast } from '@/components/ui/Toast';
import { DomainError, errorMessage } from '@/lib/errors';
import { toInputDate } from '@/lib/dates';
import { nextBarcode } from '@/services/inventory';

interface Props {
  open: boolean;
  onClose: () => void;
  bookId?: string;
  copy?: Copy;
}

export function CopyForm({ open, onClose, bookId: fixedBookId, copy }: Props) {
  const lib = useLibrary();
  const data = useData();
  const toast = useToast();
  const [bookId, setBookId] = useState(copy?.bookId ?? fixedBookId ?? '');
  const [bookError, setBookError] = useState<string>();
  const [saving, setSaving] = useState(false);
  const defaults: CopyFormValues = {
    barcode: copy?.barcode ?? '',
    shelfLocation: copy?.shelfLocation ?? '',
    condition: copy?.condition ?? 'new',
    acquiredAt: toInputDate(copy?.acquiredAt ?? new Date().toISOString()),
    notes: copy?.notes ?? '',
  };
  const { register, handleSubmit, formState: { errors }, setError, reset } = useForm<CopyFormValues, unknown, CopyInput>({
    resolver: zodFormResolver(copyInputSchema), defaultValues: defaults, mode: 'onTouched',
  });
  const close = () => { if (!saving) { reset(defaults); onClose(); } };

  const submit = handleSubmit((values) => {
    if (!copy && !bookId) { setBookError('Choose a title'); return; }
    setSaving(true);
    try {
      if (copy) {
        lib.updateCopy(copy.id, values);
        toast.success('Copy updated');
      } else {
        const c = lib.createCopy(bookId, values);
        toast.success('Copy added', c.status === 'on_hold' ? `${c.barcode} was placed on hold for the next reservation.` : `${c.barcode} is now available.`);
      }
      reset(defaults);
      onClose();
    } catch (e) {
      if (e instanceof DomainError && e.code === 'duplicate_barcode') setError('barcode', { message: e.message });
      else toast.error('Could not save copy', errorMessage(e));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={saving}
      title={copy ? `Edit copy ${copy.barcode}` : 'Add a physical copy'}
      description={copy ? 'Status changes are made from the copy’s action menu.' : 'New copies start as available — or go straight on hold if someone is waiting.'}
      footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void submit()}>{copy ? 'Save copy' : 'Add copy'}</Button></>}
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
        {!copy && !fixedBookId && (
          <Field label="Title" required error={bookError} className="sm:col-span-2">
            <SearchableSelect
              value={bookId}
              onChange={(v) => { setBookId(v); setBookError(undefined); }}
              placeholder="Search the catalog"
              options={data.books.filter((b) => b.status === 'active').map((b) => ({ value: b.id, label: b.title, description: `${b.authors.join(', ')} · ${b.isbn}` }))}
            />
          </Field>
        )}
        <Field label="Barcode" error={errors.barcode?.message} hint={copy ? undefined : `Leave blank to auto-assign (${nextBarcode(data)})`}>
          <Input {...register('barcode')} className="font-mono uppercase" data-autofocus={!!fixedBookId || !!copy || undefined} />
        </Field>
        <Field label="Shelf location" required error={errors.shelfLocation?.message} hint="e.g. CS-A3.12">
          <Input {...register('shelfLocation')} />
        </Field>
        <Field label="Condition" required error={errors.condition?.message}>
          <Select {...register('condition')}>
            {['new', 'good', 'fair', 'worn', 'poor'].map((c) => <option key={c} value={c}>{c[0]!.toUpperCase() + c.slice(1)}</option>)}
          </Select>
        </Field>
        <Field label="Acquisition date" required error={errors.acquiredAt?.message}>
          <Input type="date" {...register('acquiredAt')} max={toInputDate(new Date().toISOString())} />
        </Field>
        <Field label="Notes" error={errors.notes?.message} className="sm:col-span-2">
          <Textarea {...register('notes')} rows={2} />
        </Field>
      </form>
    </Dialog>
  );
}
