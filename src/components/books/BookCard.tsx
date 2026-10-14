import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Bookmark, BookmarkCheck } from 'lucide-react';
import type { Book } from '@/types/models';
import type { Availability } from '@/services/common';
import { BookCover } from './BookCover';
import { AvailabilityBadge } from './AvailabilityBadge';
import { cn } from '@/lib/cn';

interface Props {
  book: Book;
  to: string;
  availability: Availability;
  saved?: boolean;
  onToggleSave?: () => void;
}

export function BookCard({ book, to, availability, saved, onToggleSave }: Props) {
  const reduce = useReducedMotion();
  return (
    <motion.article
      whileHover={reduce ? undefined : { y: -4 }}
      transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
      className="group relative flex flex-col"
    >
      <Link to={to} className="block rounded-[6px] focus-visible:outline-offset-4" aria-label={`${book.title} — view details`}>
        <BookCover book={book} className="w-full transition duration-slow group-hover:shadow-pop" />
      </Link>
      {onToggleSave && (
        <button
          onClick={onToggleSave}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${book.title} from saved books` : `Save ${book.title}`}
          className={cn(
            'absolute right-2 top-2 rounded-full p-1.5 backdrop-blur transition',
            saved ? 'bg-brass text-brass-ink' : 'bg-black/40 text-white opacity-0 focus:opacity-100 group-hover:opacity-100',
          )}
        >
          {saved ? <BookmarkCheck className="h-4 w-4" /> : <Bookmark className="h-4 w-4" />}
        </button>
      )}
      <div className="mt-3 min-w-0">
        <h3 className="line-clamp-2 font-display text-[15px] leading-snug text-ink">
          <Link to={to} className="hover:text-brass">{book.title}</Link>
        </h3>
        <p className="mt-0.5 truncate text-xs text-ink-muted">{book.authors.join(', ')}</p>
        <div className="mt-2"><AvailabilityBadge a={availability} compact /></div>
      </div>
    </motion.article>
  );
}
