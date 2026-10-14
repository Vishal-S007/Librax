import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

export type Tone = 'neutral' | 'brass' | 'sage' | 'rose' | 'sky' | 'plum';

const tones: Record<Tone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted ring-line',
  brass: 'bg-brass-soft text-brass ring-brass/25',
  sage: 'bg-sage-soft text-sage ring-sage/25',
  rose: 'bg-rose-soft text-rose ring-rose/25',
  sky: 'bg-sky-soft text-sky ring-sky/25',
  plum: 'bg-plum-soft text-plum ring-plum/25',
};

export function Badge({ tone = 'neutral', children, dot, className }: { tone?: Tone; children: ReactNode; dot?: boolean; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset', tones[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}
