import type { ReactNode } from 'react';
import { Search, X } from 'lucide-react';
import { controlBase } from './Input';
import { cn } from '@/lib/cn';

export function SearchInput({ value, onChange, placeholder, label, className }: { value: string; onChange: (v: string) => void; placeholder: string; label: string; className?: string }) {
  return (
    <div className={cn('relative min-w-0 flex-1', className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
      <input type="search" aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={cn(controlBase, 'h-10 pl-9 pr-8')} />
      {value && (
        <button onClick={() => onChange('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-ink-faint hover:text-ink" aria-label="Clear search">
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function Toolbar({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-2 border-b border-line p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">{children}</div>;
}

export function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <span className="sr-only">{label}</span>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)} className={cn(controlBase, 'h-10 w-auto min-w-[140px] pr-8')}>
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}
