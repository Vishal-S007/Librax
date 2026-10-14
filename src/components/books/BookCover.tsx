import { useState, type CSSProperties } from 'react';
import type { Book } from '@/types/models';
import { cn } from '@/lib/cn';

const PATTERNS = ['bands', 'arc', 'grid', 'frame'] as const;

/**
 * Typographic cover generated locally from the book's title and hue — no external image
 * service required. If a coverUrl is set and loads, it is shown instead.
 */
export function BookCover({ book, className, size = 'md' }: { book: Pick<Book, 'title' | 'authors' | 'coverHue' | 'coverUrl' | 'category'>; className?: string; size?: 'sm' | 'md' | 'lg' }) {
  const [failed, setFailed] = useState(false);
  const h = book.coverHue;
  const pattern = PATTERNS[h % PATTERNS.length]!;
  const alt = `Cover of ${book.title} by ${book.authors.join(', ')}`;
  const titleSize = size === 'sm' ? 'text-[10px]' : size === 'lg' ? 'text-[22px]' : 'text-[15px]';

  if (book.coverUrl && !failed) {
    return (
      <div className={cn('relative aspect-[2/3] overflow-hidden rounded-[6px] bg-surface-raised shadow-book', className)}>
        <img src={book.coverUrl} alt={alt} loading="lazy" onError={() => setFailed(true)} className="h-full w-full object-cover" />
        <span className="pointer-events-none absolute inset-y-0 left-0 w-[6%] bg-gradient-to-r from-black/25 to-transparent" aria-hidden />
      </div>
    );
  }

  const bg = `hsl(${h} 32% 22%)`;
  const bg2 = `hsl(${(h + 24) % 360} 38% 14%)`;
  const accent = `hsl(${(h + 180) % 360} 55% 70%)`;
  const ink = `hsl(${h} 30% 94%)`;
  return (
    <div
      role="img"
      aria-label={alt}
      className={cn('relative flex aspect-[2/3] select-none flex-col overflow-hidden rounded-[6px] shadow-book', className)}
      style={{ background: `linear-gradient(160deg, ${bg} 0%, ${bg2} 100%)`, color: ink }}
    >
      <svg className="absolute inset-0 h-full w-full opacity-[0.55]" viewBox="0 0 200 300" preserveAspectRatio="none" aria-hidden>
        {pattern === 'bands' && <><rect x="0" y="196" width="200" height="10" fill={accent} opacity=".7" /><rect x="0" y="212" width="200" height="3" fill={accent} opacity=".5" /></>}
        {pattern === 'arc' && <circle cx="170" cy="250" r="110" fill="none" stroke={accent} strokeWidth="2" opacity=".6" />}
        {pattern === 'grid' && Array.from({ length: 6 }, (_, i) => <line key={i} x1={i * 40} y1="180" x2={i * 40} y2="300" stroke={accent} strokeWidth="1" opacity=".35" />)}
        {pattern === 'frame' && <rect x="14" y="14" width="172" height="272" fill="none" stroke={accent} strokeWidth="1.5" opacity=".55" />}
      </svg>
      <span className="pointer-events-none absolute inset-y-0 left-0 w-[7%] bg-gradient-to-r from-black/35 to-transparent" aria-hidden />
      <div className={cn('relative flex flex-1 flex-col', size === 'sm' ? 'p-2' : 'p-[9%]')}>
        {size !== 'sm' && <p className="text-[9px] font-semibold uppercase tracking-[0.18em] opacity-70">{book.category}</p>}
        <p className={cn('mt-auto font-display leading-[1.08]', titleSize)} style={{ textWrap: 'balance' } as CSSProperties}>{book.title}</p>
        {size !== 'sm' && <p className="mt-2 truncate text-[10px] font-medium opacity-75">{book.authors[0]}</p>}
      </div>
    </div>
  );
}
