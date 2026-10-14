import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BookOpen, CornerDownLeft, Hash, Search, User, type LucideIcon } from 'lucide-react';
import { useData, useSession } from '@/app/providers';
import { Dialog } from '@/components/ui/Dialog';
import { searchBooks } from '@/services/catalog';
import { searchMembers } from '@/services/members';
import { NAV, isStaff } from '@/routes/nav';
import { useBase } from '@/hooks/useRole';
import { useDebounced } from '@/hooks/useDebounced';
import { cn } from '@/lib/cn';

interface Result { id: string; label: string; sub?: string; to: string; icon: LucideIcon; group: string }

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const data = useData();
  const session = useSession();
  const base = useBase();
  const navigate = useNavigate();
  const staff = isStaff(session?.role);
  const dq = useDebounced(q, 120);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); setOpen(true); }
      else if (e.key === '/' && !open && !(e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement)) { e.preventDefault(); setOpen(true); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  useEffect(() => { if (!open) setQ(''); }, [open]);
  useEffect(() => setActive(0), [dq]);

  const results = useMemo<Result[]>(() => {
    const query = dq.trim();
    const out: Result[] = [];
    if (!session) return out;
    const pages = NAV[session.role].filter((n) => !query || n.label.toLowerCase().includes(query.toLowerCase())).slice(0, query ? 4 : 6);
    if (!query) return pages.map((p) => ({ id: `p-${p.path}`, label: p.label, to: `${base}/${p.path}`, icon: p.icon, group: 'Go to' }));
    for (const b of searchBooks(data, { q: query, status: staff ? 'all' : 'active' }).slice(0, 6))
      out.push({ id: b.id, label: b.title, sub: `${b.authors.join(', ')} · ${b.isbn}`, to: `${base}/books/${b.id}`, icon: BookOpen, group: 'Books' });
    if (staff) {
      for (const m of searchMembers(data, { q: query }).slice(0, 4))
        out.push({ id: m.id, label: m.name, sub: `${m.memberNo} · ${m.email}`, to: `${base}/members/${m.id}`, icon: User, group: 'Members' });
      const qq = query.toUpperCase();
      for (const c of data.copies.filter((c) => c.barcode.includes(qq)).slice(0, 4)) {
        const b = data.books.find((x) => x.id === c.bookId);
        out.push({ id: c.id, label: c.barcode, sub: b?.title, to: `${base}/inventory?q=${encodeURIComponent(c.barcode)}`, icon: Hash, group: 'Copies' });
      }
    }
    for (const p of pages) out.push({ id: `p-${p.path}`, label: p.label, to: `${base}/${p.path}`, icon: p.icon, group: 'Pages' });
    return out;
  }, [dq, data, session, base, staff]);

  const go = (r: Result) => { setOpen(false); navigate(r.to); };
  useEffect(() => {
    listRef.current?.querySelector(`[data-idx="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  let lastGroup = '';
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex h-9 items-center gap-2 rounded-control border border-line bg-surface px-2.5 text-sm text-ink-faint transition hover:border-line-strong hover:text-ink-muted sm:w-64 sm:px-3"
        aria-label="Search (Ctrl K)"
      >
        <Search className="h-4 w-4" />
        <span className="hidden flex-1 text-left sm:inline">Search books{staff ? ', members, barcodes' : ''}…</span>
        <kbd className="hidden rounded border border-line px-1.5 font-mono text-[10px] text-ink-faint sm:inline">⌘K</kbd>
      </button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Search LIBRAX" size="lg">
        <div className="-mt-1">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-ink-faint" aria-hidden />
            <input
              data-autofocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={staff ? 'Title, author, ISBN, member name or barcode' : 'Title, author, ISBN or subject'}
              aria-label="Search query"
              role="combobox"
              aria-expanded
              aria-controls="global-search-list"
              aria-activedescendant={results[active] ? `gs-${active}` : undefined}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, results.length - 1)); }
                if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
                if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]!); }
              }}
              className="h-12 w-full rounded-control border border-line bg-surface-sunken pl-11 pr-4 text-[15px] text-ink placeholder:text-ink-faint focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25"
            />
          </div>
          <ul id="global-search-list" ref={listRef} role="listbox" className="mt-4 max-h-[50vh] overflow-y-auto">
            {results.length === 0 && <li className="py-10 text-center text-sm text-ink-faint">No results for “{dq}”. Try an author, ISBN or subject.</li>}
            {results.map((r, i) => {
              const header = r.group !== lastGroup ? r.group : null;
              lastGroup = r.group;
              return (
                <li key={`${r.group}-${r.id}`} role="presentation">
                  {header && <p className="eyebrow mb-1 mt-3 px-2 first:mt-0">{header}</p>}
                  <div
                    id={`gs-${i}`}
                    data-idx={i}
                    role="option"
                    aria-selected={i === active}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(r)}
                    className={cn('flex cursor-pointer items-center gap-3 rounded-control px-3 py-2.5', i === active && 'bg-surface-raised')}
                  >
                    <r.icon className="h-4 w-4 shrink-0 text-ink-faint" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-ink">{r.label}</p>
                      {r.sub && <p className="truncate text-xs text-ink-faint">{r.sub}</p>}
                    </div>
                    {i === active && <CornerDownLeft className="h-3.5 w-3.5 text-ink-faint" aria-hidden />}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </Dialog>
    </>
  );
}
