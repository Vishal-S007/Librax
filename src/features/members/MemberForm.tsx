import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { zodFormResolver } from '@/lib/formResolver';
import type { Member } from '@/types/models';
import { memberInputSchema, type MemberFormValues, type MemberInput } from '@/services/validation';
import { useData, useLibrary } from '@/app/providers';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, RadioGroup } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { DomainError, errorMessage } from '@/lib/errors';
import { borrowLimitFor } from '@/services/common';

export function MemberForm({ open, onClose, member, onSaved }: { open: boolean; onClose: () => void; member?: Member; onSaved?: (m: Member) => void }) {
  const lib = useLibrary();
  const data = useData();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const defaults: MemberFormValues = {
    name: member?.name ?? '',
    email: member?.email ?? '',
    phone: member?.phone ?? '',
    type: member?.type ?? 'student',
    department: member?.department ?? '',
    borrowLimit: member?.borrowLimit ?? '',
  };
  const { register, handleSubmit, control, watch, formState: { errors }, setError, reset } = useForm<MemberFormValues, unknown, MemberInput>({
    resolver: zodFormResolver(memberInputSchema), defaultValues: defaults, mode: 'onTouched',
  });
  const type = watch('type');
  const policyLimit = borrowLimitFor({ type, borrowLimit: undefined } as Member, data.settings);
  const departments = [...new Set(data.members.map((m) => m.department))].sort();
  const close = () => { if (!saving) { reset(defaults); onClose(); } };

  const submit = handleSubmit((v) => {
    setSaving(true);
    try {
      const saved = member ? lib.updateMember(member.id, v) : lib.createMember(v);
      toast.success(member ? 'Member updated' : 'Member registered', `${saved.name} · ${saved.memberNo}`);
      reset(defaults);
      onClose();
      onSaved?.(saved);
    } catch (e) {
      if (e instanceof DomainError && e.code === 'duplicate_email') setError('email', { message: e.message });
      else toast.error('Could not save member', errorMessage(e));
    } finally {
      setSaving(false);
    }
  });

  return (
    <Dialog
      open={open}
      onClose={close}
      busy={saving}
      size="lg"
      title={member ? `Edit ${member.name}` : 'Register a member'}
      description="Use fictional details in this demo — data stays in this browser."
      footer={<><Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button><Button variant="primary" loading={saving} onClick={() => void submit()}>{member ? 'Save member' : 'Register'}</Button></>}
    >
      <form noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }} className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" required error={errors.name?.message} className="sm:col-span-2">
          <Input {...register('name')} data-autofocus autoComplete="off" />
        </Field>
        <Field label="Email" required error={errors.email?.message}>
          <Input type="email" {...register('email')} autoComplete="off" />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <Input type="tel" {...register('phone')} autoComplete="off" />
        </Field>
        <div className="sm:col-span-2">
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <RadioGroup
                name="membership-type"
                legend="Membership type"
                value={field.value}
                onChange={field.onChange}
                options={[
                  { value: 'student', label: 'Student', hint: `${data.settings.loanDays}-day loans · ${data.settings.maxBorrowStudent} items` },
                  { value: 'faculty', label: 'Faculty', hint: `${data.settings.facultyLoanDays}-day loans · ${data.settings.maxBorrowFaculty} items` },
                  { value: 'staff', label: 'Staff', hint: `${data.settings.loanDays}-day loans · ${data.settings.maxBorrowStaff} items` },
                ]}
              />
            )}
          />
          {errors.type && <p role="alert" className="mt-1 text-xs text-rose">{errors.type.message}</p>}
        </div>
        <Field label="Department" required error={errors.department?.message}>
          <Input {...register('department')} list="member-departments" />
        </Field>
        <datalist id="member-departments">{departments.map((d) => <option key={d} value={d} />)}</datalist>
        <Field label="Borrowing limit override" error={errors.borrowLimit?.message} hint={`Leave blank to use the ${type} policy (${policyLimit})`}>
          <Input type="number" min={1} max={100} {...register('borrowLimit')} />
        </Field>
      </form>
    </Dialog>
  );
}
