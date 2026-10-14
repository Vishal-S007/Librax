import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowUpRight, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-[28px] leading-tight text-ink sm:text-[34px]">{title}</h1>
        {description && <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ink-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, action, children, className, bodyClassName, subtitle }: { title?: ReactNode; subtitle?: ReactNode; action?: ReactNode; children: ReactNode; className?: string; bodyClassName?: string }) {
  return (
    <section className={cn('card', className)}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <div className="min-w-0">
            {title && <h2 className="font-sans text-sm font-semibold text-ink">{title}</h2>}
            {subtitle && <p className="text-xs text-ink-faint">{subtitle}</p>}
          </div>
          {action}
        </header>
      )}
      <div className={cn('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

const statTones = {
  brass: 'text-brass bg-brass-soft',
  sage: 'text-sage bg-sage-soft',
  rose: 'text-rose bg-rose-soft',
  sky: 'text-sky bg-sky-soft',
  plum: 'text-plum bg-plum-soft',
};

export function StatCard({ label, value, hint, icon: Icon, tone = 'brass', to }: { label: string; value: ReactNode; hint?: ReactNode; icon: LucideIcon; tone?: keyof typeof statTones; to?: string }) {
  const body = (
    <>
      <div className="flex items-start justify-between">
        <span className={cn('flex h-9 w-9 items-center justify-center rounded-xl', statTones[tone])}>
          <Icon className="h-[18px] w-[18px]" aria-hidden />
        </span>
        {to && <ArrowUpRight className="h-4 w-4 text-ink-faint opacity-0 transition group-hover:opacity-100" aria-hidden />}
      </div>
      <p className="mt-4 font-display text-[30px] leading-none text-ink tabular">{value}</p>
      <p className="mt-1.5 text-[13px] font-medium text-ink-muted">{label}</p>
      {hint && <p className="mt-0.5 text-xs text-ink-faint">{hint}</p>}
    </>
  );
  const cls = 'card group block p-4 transition duration-base hover:-translate-y-0.5 hover:border-line-strong';
  return to ? <Link to={to} className={cls} aria-label={`${label}: view details`}>{body}</Link> : <div className={cls}>{body}</div>;
}

export function Tabs<T extends string>({ value, onChange, tabs, label }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: string; count?: number }[]; label: string }) {
  return (
    <div role="tablist" aria-label={label} className="inline-flex max-w-full gap-1 overflow-x-auto rounded-control border border-line bg-surface-sunken p-1">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={cn(
            'flex items-center gap-1.5 whitespace-nowrap rounded-[7px] px-3 py-1.5 text-[13px] font-medium transition',
            value === t.value ? 'bg-surface text-ink shadow-card' : 'text-ink-muted hover:text-ink',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="rounded-full bg-surface-raised px-1.5 text-[11px] tabular text-ink-faint">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

export function KeyValue({ items }: { items: { label: string; value: ReactNode }[] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-xs text-ink-faint">{i.label}</dt>
          <dd className="mt-0.5 break-words text-sm text-ink">{i.value}</dd>
        </div>
      ))}
    </dl>
  );
}
