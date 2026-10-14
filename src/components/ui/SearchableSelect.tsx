import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';
import { cn } from '@/lib/cn';
import { controlBase } from './Input';

export interface Option {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  meta?: ReactNode;
  keywords?: string;
}

interface Props {
  value: string | undefined;
  onChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  emptyText?: string;
}

/** Accessible combobox: type to filter, arrow keys to move, Enter to choose. */
export function SearchableSelect({ value, onChange, options, placeholder = 'Search…', id, emptyText = 'No matches', ...aria }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const listId = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options.slice(0, 80);
    return options.filter((o) => `${o.label} ${o.description ?? ''} ${o.keywords ?? ''}`.toLowerCase().includes(q)).slice(0, 80);
  }, [options, query]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => { if (!wrap.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);
  useEffect(() => setActive(0), [query]);

  const choose = (o: Option) => {
    if (o.disabled) return;
    onChange(o.value);
    setOpen(false);
    setQuery('');
  };

  return (
    <div ref={wrap} className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={open && filtered[active] ? `${listId}-${active}` : undefined}
          className={cn(controlBase, 'h-10 pl-9 pr-9')}
          placeholder={selected ? selected.label : placeholder}
          value={open ? query : selected?.label ?? ''}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => Math.min(a + 1, filtered.length - 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
            else if (e.key === 'Enter' && open) { e.preventDefault(); const o = filtered[active]; if (o) choose(o); }
            else if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); }
          }}
          {...aria}
        />
        <ChevronsUpDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      </div>
      {open && (
        <ul id={listId} role="listbox" className="absolute z-30 mt-1.5 max-h-72 w-full overflow-auto rounded-control border border-line bg-surface-raised p-1 shadow-pop">
          {filtered.length === 0 && <li className="px-3 py-6 text-center text-sm text-ink-faint">{emptyText}</li>}
          {filtered.map((o, i) => (
            <li
              key={o.value}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={o.value === value}
              aria-disabled={o.disabled || undefined}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseEnter={() => setActive(i)}
              className={cn(
                'flex cursor-pointer items-center gap-3 rounded-[7px] px-3 py-2 text-sm',
                i === active && 'bg-surface-sunken',
                o.disabled && 'cursor-not-allowed opacity-50',
              )}
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-ink">{o.label}</p>
                {o.description && <p className="truncate text-xs text-ink-faint">{o.description}</p>}
              </div>
              {o.meta}
              {o.value === value && <Check className="h-4 w-4 text-brass" aria-hidden />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
