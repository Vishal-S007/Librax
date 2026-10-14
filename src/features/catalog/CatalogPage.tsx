import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Archive, BookPlus, Download, Library } from 'lucide-react';
import { useData, useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { PageHeader } from '@/components/ui/Layout';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/tables/DataTable';
import { FilterSelect, SearchInput, Toolbar } from '@/components/ui/Toolbar';
import { EmptyState } from '@/components/ui/Feedback';
import { Badge } from '@/components/ui/Badge';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { AvailabilityBadge } from '@/components/books/AvailabilityBadge';
import { BookCover } from '@/components/books/BookCover';
import { availabilityOf } from '@/services/common';
import { borrowCounts, categoriesOf, searchBooks, type BookSort } from '@/services/catalog';
import { exportBooksCsv } from '@/services/importExport';
import { downloadText } from '@/lib/csv';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import type { Book } from '@/types/models';
import { BookForm } from './BookForm';
import { BarcodeScanner, ScanButton } from '@/components/scan/BarcodeScanner';
import { resolveScan } from '@/services/scan';

export default function CatalogPage() {
  const data = useData();
  const lib = useLibrary();
  const base = useBase();
  const toast = useToast();
  const navigate = useNavigate();
  const [q, setQ] = useQueryState('q');
  const [category, setCategory] = useQueryState('category', 'all');
  const [status, setStatus] = useQueryState('status', 'active');
  const [sort, setSort] = useQueryState('sort', 'title');
  const [isNew, setNew] = useQueryState('new');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scannedIsbn, setScannedIsbn] = useState<string>();
  /** Known book → open it. Unknown ISBN → start a new title with the ISBN filled in. */
  const onScan = (code: string): string | undefined => {
    const r = resolveScan(data, code);
    if (r.kind === 'copy' || r.kind === 'book') { setScanning(false); navigate(`${base}/books/${r.book.id}`); return undefined; }
    if (r.kind === 'unknown-isbn') { setScanning(false); setScannedIsbn(r.isbn); setNew('1'); return undefined; }
    return `“${code}” isn’t an ISBN or a LIBRAX barcode.`;
  };
  const dq = useDebounced(q);

  const categories = useMemo(() => categoriesOf(data), [data]);
  const pop = useMemo(() => borrowCounts(data), [data]);
  const rows = useMemo(
    () => searchBooks(data, { q: dq, categories: category === 'all' ? undefined : [category], status: status as 'active' | 'archived' | 'all' }, (dq ? 'relevance' : sort) as BookSort),
    [data, dq, category, status, sort],
  );

  const columns: Column<Book>[] = [
    {
      key: 'title', header: 'Title', sortValue: (b) => b.title.toLowerCase(), hideOnMobile: true,
      render: (b) => (
        <div className="flex items-center gap-3">
          <BookCover book={b} size="sm" className="w-9 shrink-0" />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{b.title}</p>
            <p className="truncate text-xs text-ink-faint">{b.authors.join(', ')}</p>
          </div>
        </div>
      ),
    },
    { key: 'isbn', header: 'ISBN', sortValue: (b) => b.isbn, render: (b) => <span className="font-mono text-xs text-ink-muted">{b.isbn}</span>, className: 'hidden xl:table-cell' },
    { key: 'category', header: 'Category', sortValue: (b) => b.category, render: (b) => <span className="text-ink-muted">{b.category}</span> },
    { key: 'year', header: 'Year', sortValue: (b) => b.publicationYear, render: (b) => <span className="tabular text-ink-muted">{b.publicationYear}</span>, align: 'right' },
    { key: 'loans', header: 'Loans', sortValue: (b) => pop.get(b.id) ?? 0, render: (b) => <span className="tabular text-ink-muted">{pop.get(b.id) ?? 0}</span>, align: 'right', className: 'hidden lg:table-cell' },
    {
      key: 'availability', header: 'Availability', sortValue: (b) => availabilityOf(data, b.id).available,
      render: (b) => (b.status === 'archived' ? <Badge>Archived</Badge> : <AvailabilityBadge a={availabilityOf(data, b.id)} />),
    },
  ];

  const archiveSelected = () => {
    let ok = 0;
    const failed: string[] = [];
    for (const id of selected) {
      try { lib.setBookArchived(id, true); ok++; } catch (e) { failed.push(`${data.books.find((b) => b.id === id)?.title}: ${errorMessage(e)}`); }
    }
    if (ok) toast.success(`Archived ${ok} title${ok > 1 ? 's' : ''}`);
    if (failed.length) toast.error(`${failed.length} could not be archived`, failed.slice(0, 2).join(' · '));
    setSelected(new Set());
    setConfirmArchive(false);
  };

  return (
    <div>
      <PageHeader
        eyebrow="Collection"
        title="Catalog"
        description={`${data.books.filter((b) => b.status === 'active').length} active titles across ${categories.length} categories.`}
        actions={
          <>
            <Button icon={<Download className="h-4 w-4" />} onClick={() => downloadText(`librax-books-${new Date().toISOString().slice(0, 10)}.csv`, exportBooksCsv(data))}>Export CSV</Button>
            <ScanButton onClick={() => setScanning(true)} label="Scan a book" withText />
            <Button variant="primary" icon={<BookPlus className="h-4 w-4" />} onClick={() => setNew('1')}>Add title</Button>
          </>
        }
      />
      <div className="card overflow-hidden">
        <Toolbar>
          <SearchInput value={q} onChange={setQ} label="Search catalog" placeholder="Search title, author, ISBN, tag…" />
          <FilterSelect label="Category" value={category} onChange={setCategory} options={[{ value: 'all', label: 'All categories' }, ...categories.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` }))]} />
          <FilterSelect label="Status" value={status} onChange={setStatus} options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }, { value: 'all', label: 'All statuses' }]} />
          <FilterSelect label="Sort" value={sort} onChange={setSort} options={[{ value: 'title', label: 'Title A–Z' }, { value: 'newest', label: 'Recently added' }, { value: 'popular', label: 'Most borrowed' }, { value: 'year_desc', label: 'Newest edition' }]} />
        </Toolbar>
        {selected.size > 0 && (
          <div className="flex items-center justify-between gap-3 border-b border-line bg-brass-soft/40 px-4 py-2.5 text-sm">
            <span className="font-medium text-ink">{selected.size} selected</span>
            <div className="flex gap-2">
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
              <Button size="sm" variant="danger" icon={<Archive className="h-3.5 w-3.5" />} onClick={() => setConfirmArchive(true)}>Archive</Button>
            </div>
          </div>
        )}
        <DataTable
          caption="Catalog titles"
          rows={rows}
          columns={columns}
          rowKey={(b) => b.id}
          onRowClick={(b) => navigate(`${base}/books/${b.id}`)}
          selectable={status !== 'archived'}
          selected={selected}
          onSelectedChange={setSelected}
          resetKey={`${dq}|${category}|${status}|${sort}`}
          mobileTitle={(b) => (
            <div className="flex items-center gap-3">
              <BookCover book={b} size="sm" className="w-10 shrink-0" />
              <div className="min-w-0"><p className="truncate font-medium text-ink">{b.title}</p><p className="truncate text-xs text-ink-faint">{b.authors.join(', ')}</p></div>
            </div>
          )}
          empty={
            <EmptyState
              icon={Library}
              title={q || category !== 'all' ? 'No titles match these filters' : 'The catalog is empty'}
              body={q || category !== 'all' ? 'Try a broader search or clear the filters.' : 'Add your first title or import a CSV from Import & export.'}
              action={q || category !== 'all' ? <Button onClick={() => { setQ(''); setCategory('all'); }}>Clear filters</Button> : <Button variant="primary" onClick={() => setNew('1')}>Add title</Button>}
            />
          }
        />
      </div>
      <BookForm key={scannedIsbn ?? 'blank'} open={isNew === '1'} initialIsbn={scannedIsbn}
        onClose={() => { setNew(''); setScannedIsbn(undefined); }} onSaved={(b) => navigate(`${base}/books/${b.id}`)} />
      <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onScan} title="Scan a book"
        hint="Scan the ISBN on the back cover. Books already in the catalog open directly; new ISBNs start a new title." />
      <ConfirmDialog
        open={confirmArchive}
        onClose={() => setConfirmArchive(false)}
        tone="danger"
        title={`Archive ${selected.size} title${selected.size > 1 ? 's' : ''}?`}
        body="Archived titles are hidden from discovery and cannot be reserved. Titles with copies on loan or open reservations will be skipped. You can restore them later."
        confirmLabel="Archive"
        onConfirm={archiveSelected}
      />
    </div>
  );
}
