import { useState, type ReactNode } from 'react';
import { Dialog } from './Dialog';
import { Button } from './Button';

interface ConfirmProps {
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: 'danger' | 'primary';
  onConfirm: () => void | Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, body, confirmLabel = 'Confirm', tone = 'primary', onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    try { await onConfirm(); } finally { setBusy(false); }
  };
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      busy={busy}
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} onClick={run} loading={busy} data-autofocus>{confirmLabel}</Button>
        </>
      }
    >
      <div className="text-sm leading-relaxed text-ink-muted">{body}</div>
    </Dialog>
  );
}
