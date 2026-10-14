import { useRef, useState } from 'react';
import { DatabaseZap, Download, RotateCcw, Upload } from 'lucide-react';
import { useLibrary } from '@/app/providers';
import { Button } from '@/components/ui/Button';
import { CORRUPT_KEY } from '@/repositories/store';
import { downloadText } from '@/lib/csv';
import { previewBackup } from '@/services/importExport';
import { LogoMark } from '@/components/layout/Logo';

/** Shown when stored data cannot be read. Nothing is overwritten until the user chooses. */
export function RecoveryScreen({ reason }: { reason: string }) {
  const lib = useLibrary();
  const fileRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const downloadRaw = () => {
    try {
      const raw = localStorage.getItem(CORRUPT_KEY) ?? '';
      downloadText(`librax-unreadable-data-${Date.now()}.json`, raw, 'application/json');
    } catch { setError('Could not read the stored data.'); }
  };
  const restore = async (file: File) => {
    const preview = previewBackup(await file.text());
    if (!preview.ok || !preview.envelope) { setError(preview.reason ?? 'Invalid backup.'); return; }
    try { lib.store.replaceAll(preview.envelope.data); } catch (e) { setError(e instanceof Error ? e.message : 'Restore failed.'); }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-6">
      <div className="card w-full max-w-lg p-8">
        <LogoMark className="h-10 w-10" />
        <div className="mt-6 flex items-center gap-2 text-rose"><DatabaseZap className="h-5 w-5" /><span className="text-sm font-semibold">Stored library data could not be loaded</span></div>
        <h1 className="mt-2 font-display text-2xl text-ink">Let’s recover your library</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          LIBRAX found data in this browser but it failed validation, so nothing has been changed. Reason: <span className="text-ink">{reason}</span>
        </p>
        <div className="mt-6 grid gap-2.5">
          <Button variant="secondary" icon={<Download className="h-4 w-4" />} onClick={downloadRaw}>Download the unreadable data</Button>
          <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => fileRef.current?.click()}>Restore from a backup file</Button>
          <Button variant="danger" icon={<RotateCcw className="h-4 w-4" />} onClick={() => lib.resetDemo()}>Start over with demo data</Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void restore(f); e.target.value = ''; }} />
        {error && <p role="alert" className="mt-4 text-sm text-rose">{error}</p>}
      </div>
    </main>
  );
}
