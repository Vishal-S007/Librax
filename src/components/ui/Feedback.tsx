import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/cn';

export function EmptyState({ icon: Icon, title, body, action, className }: { icon: LucideIcon; title: string; body?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-col items-center justify-center px-6 py-14 text-center', className)}>
      <div className="relative mb-4">
        <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-brass/10 blur-xl" aria-hidden />
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-line bg-surface-raised">
          <Icon className="h-6 w-6 text-brass" aria-hidden />
        </div>
      </div>
      <h3 className="font-display text-lg text-ink">{title}</h3>
      {body && <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div className={cn('relative overflow-hidden rounded-md bg-surface-raised', className)} aria-hidden>
      <div className="absolute inset-0 -translate-x-full animate-shimmer bg-gradient-to-r from-transparent via-ink/[0.04] to-transparent" />
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div role="status" className="flex items-center gap-2 text-sm text-ink-muted">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-line-strong border-t-brass" aria-hidden />
      {label}
    </div>
  );
}

export function Callout({ tone = 'brass', icon: Icon, title, children }: { tone?: 'brass' | 'rose' | 'sky' | 'sage'; icon?: LucideIcon; title?: string; children: ReactNode }) {
  const tones = {
    brass: 'border-brass/30 bg-brass-soft/60 text-ink',
    rose: 'border-rose/30 bg-rose-soft/60 text-ink',
    sky: 'border-sky/30 bg-sky-soft/60 text-ink',
    sage: 'border-sage/30 bg-sage-soft/60 text-ink',
  };
  const ic = { brass: 'text-brass', rose: 'text-rose', sky: 'text-sky', sage: 'text-sage' };
  return (
    <div className={cn('flex gap-3 rounded-card border p-3.5 text-sm', tones[tone])}>
      {Icon && <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', ic[tone])} aria-hidden />}
      <div className="min-w-0 leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        <div className="text-ink-muted">{children}</div>
      </div>
    </div>
  );
}
