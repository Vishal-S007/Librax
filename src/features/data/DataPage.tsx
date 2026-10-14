import { useRef, useState, type RefObject } from 'react';
import { DatabaseBackup, Download, FileUp, RotateCcw, TriangleAlert, Upload } from 'lucide-react';
import type { LibraryData } from '@/types/models';
import { useData, useLibrary, useNow } from '@/app/providers';
import { useAction } from '@/hooks/useAction';
import { Card, PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Feedback';
import { Dialog } from '@/components/ui/Dialog';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { Badge } from '@/components/ui/Badge';
import { downloadText, toCsv } from '@/lib/csv';
import { fmtDateTime } from '@/lib/dates';
import {
  BOOK_CSV_COLUMNS, MEMBER_CSV_COLUMNS, exportBooksCsv, exportFinesCsv, exportInventoryCsv, exportLoansCsv, exportMembersCsv,
  exportReservationsCsv, previewBackup, previewBookImport, previewMemberImport, type BookImportRow, type ImportPreview,
} from '@/services/importExport';
import type { MemberInput } from '@/services/validation';

const MAX_FILE = 5 * 1024 * 1024;
const stamp = () => new Date().toISOString().slice(0, 10);

type Pending =
  | { kind: 'books'; file: string; preview: ImportPreview<BookImportRow> }
  | { kind: 'members'; file: string; preview: ImportPreview<MemberInput> };

export default function DataPage() {
  const data = useData();
  const lib = useLibrary();
  const now = useNow();
  const { run, pending } = useAction();
  const bookRef = useRef<HTMLInputElement>(null);
  const memberRef = useRef<HTMLInputElement>(null);
  const backupRef = useRef<HTMLInputElement>(null);
  const [imp, setImp] = useState<Pending | null>(null);
  const [restore, setRestore] = useState<{ file: string; counts: Record<string, number>; data: LibraryData; savedAt: string } | null>(null);
  const [error, setError] = useState<string>();
  const [confirmReset, setConfirmReset] = useState(false);
  const meta = lib.store.meta;

  const readFile = async (f: File): Promise<string | null> => {
    setError(undefined);
    if (f.size > MAX_FILE) { setError('That file is larger than 5 MB.'); return null; }
    return f.text();
  };
  const onBooks = async (f: File) => { const t = await readFile(f); if (t != null) setImp({ kind: 'books', file: f.name, preview: previewBookImport(data, t) }); };
  const onMembers = async (f: File) => { const t = await readFile(f); if (t != null) setImp({ kind: 'members', file: f.name, preview: previewMemberImport(data, t) }); };
  const onBackup = async (f: File) => {
    const t = await readFile(f);
    if (t == null) return;
    const p = previewBackup(t);
    if (!p.ok || !p.envelope || !p.counts) { setError(`Backup rejected: ${p.reason}`); return; }
    setRestore({ file: f.name, counts: p.counts, data: p.envelope.data, savedAt: p.envelope.updatedAt });
  };

  const applyImport = () => {
    if (!imp) return;
    const ok = imp.kind === 'books'
      ? run(() => lib.importBooks(imp.preview.valid.map((v) => v.value)), (r) => `Imported ${r.books} books and ${r.copies} copies`)
      : run(() => lib.importMembers(imp.preview.valid.map((v) => v.value)), (n) => `Imported ${n} members`);
    if (ok !== undefined) setImp(null);
  };

  const backup = () => downloadText(`librax-backup-${stamp()}.json`, JSON.stringify(lib.store.exportEnvelope(), null, 2), 'application/json');
  const file = (input: RefObject<HTMLInputElement>, handler: (f: File) => Promise<void>, accept: string) => (
    <input ref={input} type="file" accept={accept} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void handler(f); e.target.value = ''; }} />
  );

  const exports = [
    { label: 'Books', fn: () => exportBooksCsv(data), name: 'books' },
    { label: 'Members', fn: () => exportMembersCsv(data), name: 'members' },
    { label: 'Inventory', fn: () => exportInventoryCsv(data), name: 'inventory' },
    { label: 'Loans', fn: () => exportLoansCsv(data, now), name: 'loans' },
    { label: 'Reservations', fn: () => exportReservationsCsv(data), name: 'reservations' },
    { label: 'Fines', fn: () => exportFinesCsv(data), name: 'fines' },
  ];

  return (
    <div>
      <PageHeader eyebrow="System" title="Import & export" description="Move records in and out as CSV, and back up or restore the whole library." />
      <div className="mb-6">
        <Callout tone="brass" icon={TriangleAlert} title="Your library lives in this browser">
          All records are stored in this browser’s local storage. Clearing site data, using a private window or switching browsers will lose them — download a backup regularly.
          Last saved {fmtDateTime(meta.updatedAt)}.
        </Callout>
      </div>
      {error && <div className="mb-4"><Callout tone="rose" icon={TriangleAlert}>{error}</Callout></div>}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Import from CSV" subtitle="Rows are validated and previewed before anything is saved">
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<FileUp className="h-4 w-4" />} onClick={() => bookRef.current?.click()}>Import books</Button>
              <button className="text-xs text-brass hover:underline" onClick={() => downloadText('librax-books-template.csv', toCsv([...BOOK_CSV_COLUMNS], [['9788142070001', 'Example Title', '', 'Author One; Author Two', 'Example Press', 2024, 'Computer Science', 'Short description', 'English', '1st', 320, 'tag1; tag2', '', 2, 'CS-A1.01']]))}>Download template</button>
            </div>
            <p className="text-xs text-ink-faint">Required: {['isbn', 'title', 'authors', 'publisher', 'publication_year', 'category', 'language', 'page_count'].join(', ')}. Optional <code>copies</code> + <code>shelf</code> create physical copies. Duplicate ISBNs are skipped.</p>
            <div className="flex flex-wrap items-center gap-2">
              <Button icon={<FileUp className="h-4 w-4" />} onClick={() => memberRef.current?.click()}>Import members</Button>
              <button className="text-xs text-brass hover:underline" onClick={() => downloadText('librax-members-template.csv', toCsv([...MEMBER_CSV_COLUMNS], [['Sample Reader', 'sample.reader@student.example.edu', '', 'student', 'Mathematics', '']]))}>Download template</button>
            </div>
            <p className="text-xs text-ink-faint">Required: name, email, type (student / faculty / staff), department. Duplicate emails are skipped.</p>
          </div>
        </Card>
        <Card title="Export CSV">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {exports.map((e) => (
              <Button key={e.name} icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-${e.name}-${stamp()}.csv`, e.fn())}>{e.label}</Button>
            ))}
          </div>
        </Card>
        <Card title="Backup & restore" subtitle="Complete library data as JSON">
          <div className="flex flex-wrap gap-2">
            <Button variant="primary" icon={<DatabaseBackup className="h-4 w-4" />} onClick={backup}>Download backup</Button>
            <Button icon={<Upload className="h-4 w-4" />} onClick={() => backupRef.current?.click()}>Restore from backup</Button>
          </div>
          <p className="mt-3 text-xs text-ink-faint">Backups are parsed as data only and validated (schema, version, referential integrity) before they replace anything.</p>
        </Card>
        <Card title="Demonstration data">
          <p className="text-sm text-ink-muted">Replace everything with the original sample library: 34 titles, 18 members, loan history, holds and fines.</p>
          <Button variant="danger" className="mt-4" icon={<RotateCcw className="h-4 w-4" />} onClick={() => setConfirmReset(true)}>Reset demo data</Button>
        </Card>
      </div>

      {file(bookRef, onBooks, '.csv,text/csv')}
      {file(memberRef, onMembers, '.csv,text/csv')}
      {file(backupRef, onBackup, '.json,application/json')}

      <Dialog
        open={!!imp}
        onClose={() => setImp(null)}
        busy={pending}
        size="lg"
        title={imp ? `Import ${imp.kind} · preview` : ''}
        description={imp ? `${imp.file} · ${imp.preview.totalRows} data rows` : undefined}
        footer={<><Button variant="ghost" onClick={() => setImp(null)}>Cancel</Button><Button variant="primary" loading={pending} disabled={!imp || imp.preview.valid.length === 0} onClick={applyImport}>Import {imp?.preview.valid.length ?? 0} valid row{imp?.preview.valid.length === 1 ? '' : 's'}</Button></>}
      >
        {imp && (
          <div className="space-y-4 text-sm">
            {imp.preview.missingColumns.length > 0 ? (
              <Callout tone="rose" icon={TriangleAlert} title="Missing required columns">{imp.preview.missingColumns.join(', ')}. Nothing can be imported.</Callout>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Badge tone="sage">{imp.preview.valid.length} valid</Badge>
                <Badge tone="rose">{imp.preview.invalid.length} invalid</Badge>
                <Badge tone="brass">{imp.preview.duplicates.length} duplicates skipped</Badge>
              </div>
            )}
            {imp.preview.valid.length > 0 && (
              <div><p className="eyebrow mb-1.5">Will be added</p>
                <ul className="max-h-40 space-y-1 overflow-y-auto rounded-control border border-line p-2">
                  {imp.preview.valid.slice(0, 50).map((v) => <li key={v.row} className="truncate text-ink-muted">Row {v.row + 1}: <span className="text-ink">{'title' in v.value ? v.value.title : v.value.name}</span></li>)}
                </ul></div>
            )}
            {imp.preview.invalid.length > 0 && (
              <div><p className="eyebrow mb-1.5">Invalid rows (not imported)</p>
                <ul className="max-h-40 space-y-1.5 overflow-y-auto rounded-control border border-rose/30 p-2">
                  {imp.preview.invalid.map((r) => <li key={r.row} className="text-xs"><span className="font-medium text-rose">Row {r.row + 1}:</span> <span className="text-ink-muted">{r.messages.join('; ')}</span></li>)}
                </ul></div>
            )}
            {imp.preview.duplicates.length > 0 && (
              <div><p className="eyebrow mb-1.5">Duplicates (skipped)</p>
                <ul className="max-h-32 space-y-1 overflow-y-auto text-xs text-ink-muted">{imp.preview.duplicates.map((d) => <li key={d.row}>Row {d.row + 1}: {d.key} — {d.reason}</li>)}</ul></div>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={!!restore}
        onClose={() => setRestore(null)}
        tone="danger"
        title="Replace all library data?"
        body={restore && (
          <div className="space-y-2">
            <p>“{restore.file}”, saved {fmtDateTime(restore.savedAt)}, passed validation and contains:</p>
            <p className="text-ink">{Object.entries(restore.counts).map(([k, v]) => `${v} ${k.toLowerCase()}`).join(' · ')}</p>
            <p>Everything currently stored will be replaced. Download a backup first if you may need it.</p>
          </div>
        )}
        confirmLabel="Restore backup"
        onConfirm={() => { if (restore) run(() => lib.restore(restore.data), 'Library restored from backup'); setRestore(null); }}
      />
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        tone="danger"
        title="Reset to demonstration data?"
        body="All current books, members, loans, reservations, fines, notifications and activity in this browser will be replaced with the sample library. This cannot be undone without a backup."
        confirmLabel="Reset data"
        onConfirm={() => { run(() => lib.resetDemo(), 'Demonstration data restored'); setConfirmReset(false); }}
      />
    </div>
  );
}
