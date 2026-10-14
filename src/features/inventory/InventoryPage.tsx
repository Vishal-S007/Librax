import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, MoreHorizontal, Package, Pencil, Plus } from 'lucide-react';
import type { Copy, CopyStatus } from '@/types/models';
import { useData } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import { CopyStatusBadge } from '@/components/ui/Status';
import { COPY_STATUS_LABEL } from '@/services/inventory';
import { inventoryDistribution } from '@/services/reports';
import { exportInventoryCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { fmtDate } from '@/lib/dates';
import { cn } from '@/lib/cn';
import { CopyForm } from './CopyForm';
import { CopyStatusDialog } from './CopyStatusDialog';
import { BarcodeScanner, ScanButton } from '@/components/scan/BarcodeScanner';
import { resolveScan } from '@/services/scan';

export default function InventoryPage() {
  const data = useData();
  const base = useBase();
  const [q, setQ] = useQueryState('q');
  const [status, setStatus] = useQueryState('status', 'all');
  const [adding, setAdding] = useState(false);
  const [editCopy, setEditCopy] = useState<Copy | null>(null);
  const [statusCopy, setStatusCopy] = useState<Copy | null>(null);
  const dq = useDebounced(q).trim().toLowerCase();
  const [scanning, setScanning] = useState(false);
  /** A copy label filters to that copy; a book ISBN shows every copy of the title. */
  const onScan = (code: string): string | undefined => {
    const r = resolveScan(data, code);
    if (r.kind === 'copy') { setStatus('all'); setQ(r.copy.barcode); setScanning(false); return undefined; }
    if (r.kind === 'book') { setStatus('all'); setQ(r.book.isbn); setScanning(false); return undefined; }
    if (r.kind === 'unknown-isbn') return `ISBN ${r.isbn} isn’t in the catalog — add the title first.`;
    return `“${code}” isn’t a LIBRAX barcode or ISBN.`;
  };
  const books = useMemo(() => new Map(data.books.map((b) => [b.id, b])), [data.books]);
  const dist = useMemo(() => inventoryDistribution(data), [data]);

  const rows = useMemo(() => data.copies.filter((c) => {
    if (status !== 'all' && c.status !== status) return false;
    if (!dq) return true;
    const b = books.get(c.bookId);
    return `${c.barcode} ${c.shelfLocation} ${b?.title ?? ''} ${b?.isbn ?? ''}`.toLowerCase().includes(dq);
  }), [data.copies, status, dq, books]);

  const columns: Column<Copy>[] = [
    { key: 'barcode', header: 'Barcode', sortValue: (c) => c.barcode, render: (c) => <span className="font-mono text-[13px] text-ink">{c.barcode}</span>, hideOnMobile: true },
    {
      key: 'title', header: 'Title', sortValue: (c) => books.get(c.bookId)?.title ?? '',
      render: (c) => <Link to={`${base}/books/${c.bookId}`} onClick={(e) => e.stopPropagation()} className="line-clamp-1 hover:text-brass">{books.get(c.bookId)?.title}</Link>,
    },
    { key: 'shelf', header: 'Shelf', sortValue: (c) => c.shelfLocation, render: (c) => <span className="font-mono text-xs text-ink-muted">{c.shelfLocation}</span> },
    { key: 'condition', header: 'Condition', sortValue: (c) => c.condition, render: (c) => <span className="capitalize text-ink-muted">{c.condition}</span>, className: 'hidden lg:table-cell' },
    { key: 'acquired', header: 'Acquired', sortValue: (c) => c.acquiredAt, render: (c) => <span className="text-ink-muted">{fmtDate(c.acquiredAt)}</span>, className: 'hidden xl:table-cell', hideOnMobile: true },
    { key: 'status', header: 'Status', sortValue: (c) => c.status, render: (c) => <CopyStatusBadge status={c.status} /> },
    {
      key: 'actions', header: '', align: 'right', hideOnMobile: false,
      render: (c) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => setEditCopy(c)} aria-label={`Edit copy ${c.barcode}`}><Pencil className="h-3.5 w-3.5" /></Button>
          <Button size="sm" variant="ghost" onClick={() => setStatusCopy(c)} aria-label={`Change status of ${c.barcode}`}><MoreHorizontal className="h-4 w-4" /></Button>
        </div>
      ),
    },
  ];

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Inventory"
        description="Every physical copy, tracked independently of its title."
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-inventory-${new Date().toISOString().slice(0, 10)}.csv`, exportInventoryCsv(data))}>Export CSV</Button>
            <Button variant="primary" icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add copy</Button>
          </>
        }
      />
      <div className="mb-4 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="Filter by status">
        <button onClick={() => setStatus('all')} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition', status === 'all' ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-muted hover:text-ink')}>
          All · {data.copies.length}
        </button>
        {dist.map((d) => (
          <button key={d.status} onClick={() => setStatus(d.status)} aria-pressed={status === d.status}
            className={cn('shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition', status === d.status ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-muted hover:text-ink')}>
            {COPY_STATUS_LABEL[d.status]} · {d.count}
          </button>
        ))}
      </div>
      <div className="card overflow-hidden">
        <Toolbar>
          <div className="flex min-w-0 flex-1 gap-2">
            <SearchInput value={q} onChange={setQ} label="Search inventory" placeholder="Barcode, title, ISBN or shelf…" />
            <ScanButton onClick={() => setScanning(true)} label="Scan a copy or book" />
          </div>
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'all', label: 'All statuses' }, ...(Object.keys(COPY_STATUS_LABEL) as CopyStatus[]).map((s) => ({ value: s, label: COPY_STATUS_LABEL[s] }))]} />
        </Toolbar>
        <DataTable
          caption="Physical copies"
          rows={rows}
          columns={columns}
          rowKey={(c) => c.id}
          initialSort={{ key: 'barcode', dir: 'asc' }}
          resetKey={`${dq}|${status}`}
          pageSize={15}
          mobileTitle={(c) => <p className="font-mono text-sm text-ink">{c.barcode}</p>}
          empty={<EmptyState icon={Package} title={q || status !== 'all' ? 'No copies match' : 'No copies yet'} body={q ? `Nothing matches “${q}”.` : 'Add a copy to start tracking physical inventory.'}
            action={q || status !== 'all' ? <Button onClick={() => { setQ(''); setStatus('all'); }}>Clear filters</Button> : undefined} />}
        />
      </div>
      <CopyForm key={`new-${adding}`} open={adding} onClose={() => setAdding(false)} />
      <CopyForm key={editCopy?.id ?? 'none'} open={!!editCopy} onClose={() => setEditCopy(null)} copy={editCopy ?? undefined} />
      <CopyStatusDialog key={statusCopy?.id ?? 'none'} copy={statusCopy} onClose={() => setStatusCopy(null)} />
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onScan} title="Find a copy" hint="Scan a copy label to jump to it, or a book’s ISBN to list all its copies." />
    </div>
  );
}
