import { Bookmark } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useLibrary } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { useAction } from '@/hooks/useAction';
import { PageHeader } from '@/components/ui/Layout';
import { EmptyState } from '@/components/ui/Feedback';
import { BookCard } from '@/components/books/BookCard';
import { availabilityOf } from '@/services/common';
import { usePatron } from './usePatron';

export default function SavedBooksPage() {
  const { data, memberId } = usePatron();
  const lib = useLibrary();
  const base = useBase();
  const { run } = useAction();
  const books = (data.saved[memberId] ?? []).map((id) => data.books.find((b) => b.id === id)).filter((b) => b && b.status === 'active');
  return (
    <div>
      <PageHeader eyebrow="Account" title="Saved books" description="Your personal reading list." />
      {books.length === 0 ? (
        <div className="card"><EmptyState icon={Bookmark} title="Nothing saved yet" body="Tap the bookmark on any book to keep it here." action={<Link to={`${base}/discover`} className="text-sm text-brass">Discover books</Link>} /></div>
      ) : (
        <div className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6">
          {books.map((b) => b && <BookCard key={b.id} book={b} to={`${base}/books/${b.id}`} availability={availabilityOf(data, b.id)} saved onToggleSave={() => run(() => lib.toggleSaved(memberId, b.id), 'Removed from saved books')} />)}
        </div>
      )}
    </div>
  );
}
