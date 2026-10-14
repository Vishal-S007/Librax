import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { Skeleton } from '@/components/ui/Feedback';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  /** Hide in the stacked mobile card view. */
  hideOnMobile?: boolean;
  align?: 'left' | 'right';
}

interface Props<T> {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  pageSize?: number;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  onRowClick?: (row: T) => void;
  empty: ReactNode;
  selectable?: boolean;
  selected?: Set<string>;
  onSelectedChange?: (s: Set<string>) => void;
  loading?: boolean;
  caption: string;
  /** Primary cell for the mobile stacked view. */
  mobileTitle?: (row: T) => ReactNode;
  /** Reset to page 1 when this value changes (e.g. filters). */
  resetKey?: string;
}

export function DataTable<T>({
  rows, columns, rowKey, pageSize = 12, initialSort, onRowClick, empty, selectable, selected, onSelectedChange, loading, caption, mobileTitle, resetKey,
}: Props<T>) {
  const [sort, setSort] = useState(initialSort);
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [resetKey]);

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sort?.key);
    if (!col?.sortValue || !sort) return rows;
    const sv = col.sortValue;
    const dir = sort.dir === 'asc' ? 1 : -1;
    return [...rows].sort((a, b) => {
      const x = sv(a);
      const y = sv(b);
      return (typeof x === 'number' && typeof y === 'number' ? x - y : String(x).localeCompare(String(y))) * dir;
    });
  }, [rows, columns, sort]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const current = Math.min(page, pages);
  const slice = sorted.slice((current - 1) * pageSize, current * pageSize);
  const pageKeys = slice.map(rowKey);
  const allOnPage = selectable && pageKeys.length > 0 && pageKeys.every((k) => selected?.has(k));

  const toggleAll = () => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (allOnPage) pageKeys.forEach((k) => next.delete(k));
    else pageKeys.forEach((k) => next.add(k));
    onSelectedChange(next);
  };
  const toggle = (k: string) => {
    if (!onSelectedChange || !selected) return;
    const next = new Set(selected);
    if (next.has(k)) next.delete(k); else next.add(k);
    onSelectedChange(next);
  };
  const clickSort = (c: Column<T>) => {
    if (!c.sortValue) return;
    setSort((s) => (s?.key === c.key ? { key: c.key, dir: s.dir === 'asc' ? 'desc' : 'asc' } : { key: c.key, dir: 'asc' }));
  };

  if (loading) {
    return (
      <div className="space-y-2 p-4" aria-busy="true">
        {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-11 w-full" />)}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div>
      {/* Desktop / tablet table */}
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-line text-left">
              {selectable && (
                <th scope="col" className="w-10 px-4 py-3">
                  <input type="checkbox" aria-label="Select all on this page" checked={!!allOnPage} onChange={toggleAll} className="h-4 w-4 accent-[rgb(var(--brass))]" />
                </th>
              )}
              {columns.map((c) => {
                const active = sort?.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort!.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                    className={cn('whitespace-nowrap px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-faint', c.align === 'right' && 'text-right', c.className)}
                  >
                    {c.sortValue ? (
                      <button onClick={() => clickSort(c)} className={cn('inline-flex items-center gap-1 uppercase hover:text-ink', active && 'text-ink')}>
                        {c.header}
                        {active && (sort!.dir === 'asc' ? <ArrowUp className="h-3 w-3" aria-hidden /> : <ArrowDown className="h-3 w-3" aria-hidden />)}
                      </button>
                    ) : c.header}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const k = rowKey(row);
              return (
                <tr
                  key={k}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn('border-b border-line/70 transition last:border-0', onRowClick && 'cursor-pointer hover:bg-surface-raised', selected?.has(k) && 'bg-brass-soft/30')}
                >
                  {selectable && (
                    <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" aria-label="Select row" checked={selected?.has(k) ?? false} onChange={() => toggle(k)} className="h-4 w-4 accent-[rgb(var(--brass))]" />
                    </td>
                  )}
                  {columns.map((c) => (
                    <td key={c.key} className={cn('px-4 py-3 align-middle text-ink', c.align === 'right' && 'text-right tabular', c.className)}>{c.render(row)}</td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile stacked cards */}
      <ul className="divide-y divide-line md:hidden">
        {slice.map((row) => {
          const k = rowKey(row);
          return (
            <li key={k} className="flex gap-3 px-4 py-3.5">
              {selectable && (
                <input type="checkbox" aria-label="Select row" checked={selected?.has(k) ?? false} onChange={() => toggle(k)} className="mt-1 h-4 w-4 accent-[rgb(var(--brass))]" />
              )}
              <div
                role={onRowClick ? 'button' : undefined}
                tabIndex={onRowClick ? 0 : undefined}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                onKeyDown={onRowClick ? (e) => { if (e.key === 'Enter') onRowClick(row); } : undefined}
                className="min-w-0 flex-1"
              >
                {mobileTitle && <div className="mb-2">{mobileTitle(row)}</div>}
                <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
                  {columns.filter((c) => !c.hideOnMobile).map((c) => (
                    <div key={c.key} className="min-w-0">
                      <dt className="text-[11px] uppercase tracking-wide text-ink-faint">{c.header}</dt>
                      <dd className="truncate text-ink">{c.render(row)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </li>
          );
        })}
      </ul>

      {pages > 1 && (
        <nav className="flex items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm" aria-label="Pagination">
          <p className="text-ink-faint tabular">
            {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, sorted.length)} of {sorted.length}
          </p>
          <div className="flex items-center gap-1">
            <button className="rounded-control p-2 text-ink-muted hover:bg-surface-raised disabled:opacity-40" onClick={() => setPage(current - 1)} disabled={current === 1} aria-label="Previous page">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="px-2 tabular text-ink-muted">Page {current} / {pages}</span>
            <button className="rounded-control p-2 text-ink-muted hover:bg-surface-raised disabled:opacity-40" onClick={() => setPage(current + 1)} disabled={current === pages} aria-label="Next page">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </nav>
      )}
    </div>
  );
}
