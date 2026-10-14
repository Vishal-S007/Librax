import { useMemo, useState } from 'react';
import { Compass } from 'lucide-react';
import { useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useQueryState } from '@/hooks/useQueryState';
import { useDebounced } from '@/hooks/useDebounced';
import { useAction } from '@/hooks/useAction';
import { PageHeader } from '@/components/ui/Layout';
import { FilterSelect, SearchInput } from '@/components/ui/Toolbar';
import { Checkbox } from '@/components/ui/Input';
import { BookCard } from '@/components/books/BookCard';
import { EmptyState } from '@/components/ui/Feedback';
import { Button } from '@/components/ui/Button';
import { availabilityOf } from '@/services/common';
import { categoriesOf, searchBooks, suggestBooks, type BookSort } from '@/services/catalog';
import { cn } from '@/lib/cn';
import { usePatron } from '@/features/patron/usePatron';
import { useNavigate } from 'react-router-dom';
import { BarcodeScanner, ScanButton } from '@/components/scan/BarcodeScanner';
import { resolveScan } from '@/services/scan';
import { reservesFor } from '@/services/courses';

export default function DiscoverPage() {
  const { data, memberId } = usePatron();
  const lib = useLibrary();
  const base = useBase();
  const { run } = useAction();
  const [q, setQ] = useQueryState('q');
  const [cat, setCat] = useQueryState('category', 'all');
  const [lang, setLang] = useQueryState('language', 'all');
  const [avail, setAvail] = useQueryState('available');
  const [reserve, setReserve] = useQueryState('reserve');
  const [tag, setTag] = useQueryState('tag');
  const [sort, setSort] = useQueryState('sort', 'relevance');
  const dq = useDebounced(q);
  const navigate = useNavigate();
  const [scanning, setScanning] = useState(false);
  /** Scan any book's barcode (in the library or a bookshop) to see if the library has it. */
  const onScan = (code: string): string | undefined => {
    const r = resolveScan(data, code);
    if ((r.kind === 'copy' || r.kind === 'book') && r.book.status === 'active') { setScanning(false); navigate(`${base}/books/${r.book.id}`); return undefined; }
    if (r.kind === 'unknown-isbn' || r.kind === 'book') return 'The library doesn’t have this book yet. Ask a librarian to suggest it for purchase.';
    return `“${code}” isn’t a book barcode.`;
  };
  const cats = useMemo(() => categoriesOf(data), [data]);
  const langs = useMemo(() => [...new Set(data.books.map((b) => b.language))].sort(), [data.books]);
  const results = useMemo(() => searchBooks(data, {
    q: dq, categories: cat === 'all' ? undefined : [cat], languages: lang === 'all' ? undefined : [lang], availableOnly: avail === '1', tag: tag || undefined,
  }, sort as BookSort).filter((b) => !reserve || reservesFor(data, b.id).length > 0), [data, dq, cat, lang, avail, tag, sort, reserve]);
  const suggestions = useMemo(() => (q !== dq ? [] : suggestBooks(data, q, 5)), [data, q, dq]);
  const saved = new Set(data.saved[memberId] ?? []);
  const filtered = !!(dq || cat !== 'all' || lang !== 'all' || avail || tag || reserve);

  return (
    <div>
      <PageHeader eyebrow="Discover" title="Find your next book" description="Search by title, author, ISBN, subject or description. Filters combine." />
      <div className="relative">
        <div className="flex gap-2">
          <SearchInput value={q} onChange={setQ} label="Search books" placeholder="Try “distributed systems” or an ISBN…" />
          <ScanButton onClick={() => setScanning(true)} label="Scan a book’s barcode" />
        </div>
        <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onScan} title="Does the library have it?"
          hint="Scan the barcode on any book — even one in a shop — to check whether the library has a copy." />
        {suggestions.length > 0 && dq && results.length > 0 && (
          <p className="mt-2 text-xs text-ink-faint">Top match: <span className="text-ink">{suggestions[0]!.title}</span></p>
        )}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button onClick={() => setCat('all')} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', cat === 'all' ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-muted')}>All</button>
        {cats.map((c) => (
          <button key={c.name} onClick={() => setCat(c.name)} aria-pressed={cat === c.name} className={cn('rounded-full border px-3 py-1.5 text-xs font-medium', cat === c.name ? 'border-brass bg-brass-soft text-brass' : 'border-line text-ink-muted hover:text-ink')}>{c.name}</button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <FilterSelect label="Language" value={lang} onChange={setLang} options={[{ value: 'all', label: 'All languages' }, ...langs.map((l) => ({ value: l, label: l }))]} />
        <FilterSelect label="Sort" value={sort} onChange={setSort} options={[{ value: 'relevance', label: 'Best match' }, { value: 'popular', label: 'Most popular' }, { value: 'newest', label: 'Recently added' }, { value: 'title', label: 'Title A–Z' }, { value: 'year_desc', label: 'Newest published' }]} />
        <Checkbox label="Available now" checked={avail === '1'} onChange={(e) => setAvail(e.target.checked ? '1' : '')} />
        <Checkbox label="Course reserves only" checked={reserve === '1'} onChange={(e) => setReserve(e.target.checked ? '1' : '')} />
        {tag && <Button size="sm" variant="subtle" onClick={() => setTag('')}>#{tag} ×</Button>}
        <span className="ml-auto text-sm text-ink-faint">{results.length} result{results.length === 1 ? '' : 's'}</span>
      </div>
      {results.length === 0 ? (
        <div className="card mt-6"><EmptyState icon={Compass} title="No books match" body="Try fewer words, another category, or turn off “Available now”."
          action={filtered ? <Button onClick={() => { setQ(''); setCat('all'); setLang('all'); setAvail(''); setTag(''); setReserve(''); }}>Clear all filters</Button> : undefined} /></div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {results.map((b) => (
            <BookCard key={b.id} book={b} to={`${base}/books/${b.id}`} availability={availabilityOf(data, b.id)} saved={saved.has(b.id)}
              onToggleSave={memberId ? () => run(() => lib.toggleSaved(memberId, b.id), (s) => (s ? 'Saved' : 'Removed from saved')) : undefined} />
          ))}
        </div>
      )}
    </div>
  );
}
