import { useState } from 'react';
import type { Copy, CopyStatus } from '@/types/models';
import { useLibrary } from '@/app/providers';
import { Dialog } from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Textarea, RadioGroup } from '@/components/ui/Input';
import { Callout } from '@/components/ui/Feedback';
import { COPY_STATUS_LABEL, COPY_TRANSITIONS } from '@/services/inventory';
import { useAction } from '@/hooks/useAction';
import { Info } from 'lucide-react';

const HINTS: Partial<Record<CopyStatus, string>> = {
  available: 'Back on the shelf (or straight to the next reservation)',
  maintenance: 'Being repaired or processed',
  damaged: 'Needs assessment before it can circulate',
  lost: 'Cannot be located',
  withdrawn: 'Permanently retired — cannot be undone',
};

export function CopyStatusDialog({ copy, onClose }: { copy: Copy | null; onClose: () => void }) {
  const lib = useLibrary();
  const { run, pending } = useAction();
  const allowed = copy ? COPY_TRANSITIONS[copy.status] : [];
  const [to, setTo] = useState<CopyStatus | ''>('');
  const [note, setNote] = useState('');
  const target = (to || allowed[0]) as CopyStatus | undefined;

  const save = () => {
    if (!copy || !target) return;
    const r = run(() => lib.changeCopyStatus(copy.id, target, note.trim() || undefined), (c) =>
      c.status === 'on_hold' ? `${c.barcode} is now on hold for a waiting reservation` : `${c.barcode} → ${COPY_STATUS_LABEL[c.status]}`);
    if (r) { setTo(''); setNote(''); onClose(); }
  };

  return (
    <Dialog
      open={!!copy}
      onClose={() => { setTo(''); setNote(''); onClose(); }}
      busy={pending}
      size="md"
      title={copy ? `Change status · ${copy.barcode}` : ''}
      description={copy ? `Currently ${COPY_STATUS_LABEL[copy.status]}.` : undefined}
      footer={allowed.length ? (
        <><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant={target === 'withdrawn' ? 'danger' : 'primary'} onClick={save} loading={pending}>Update status</Button></>
      ) : <Button onClick={onClose}>Close</Button>}
    >
      {copy && allowed.length === 0 ? (
        <Callout tone="sky" icon={Info}>
          {copy.status === 'borrowed' && 'This copy is on loan. Its status changes automatically when it is returned.'}
          {copy.status === 'on_hold' && 'This copy is held for a reservation. Cancel or fulfil the reservation to release it.'}
          {copy.status === 'withdrawn' && 'Withdrawn copies are permanently retired and cannot change status.'}
        </Callout>
      ) : (
        <div className="space-y-4">
          <RadioGroup
            name="copy-status"
            legend="New status"
            value={target ?? 'available'}
            onChange={(v) => setTo(v)}
            options={allowed.map((s) => ({ value: s, label: COPY_STATUS_LABEL[s], hint: HINTS[s] }))}
          />
          <Field label="Note" hint="Optional — recorded on the copy and in the activity log">
            <Textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
          </Field>
        </div>
      )}
    </Dialog>
  );
}
