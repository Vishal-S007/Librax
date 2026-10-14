import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodFormResolver } from '@/lib/formResolver';
import type { Book } from '@/types/models';
import { bookInputSchema, type BookFormValues, type BookInput } from '@/services/validation';
import { useData, useLibrary } from '@/app/providers';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Checkbox, Input, Textarea } from '@/components/ui/Input';
import { Button } from '@/components/ui/Button';
import { BookCover } from '@/components/books/BookCover';
import { categoriesOf, findBookByIsbn } from '@/services/catalog';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';
import { DomainError } from '@/lib/errors';
import { formatIsbn, isValidIsbn, normalizeIsbn } from '@/lib/isbn';
import { toIsbn13 } from '@/services/scan';
import { BarcodeScanner, ScanButton } from '@/components/scan/BarcodeScanner';

interface Props {
  open: boolean;
  onClose: () => void;
  book?: Book;
  onSaved?: (b: Book) => void;
  /** Pre-fills the ISBN for a new title (e.g. after scanning an unknown book). */
  initialIsbn?: string;
}

function defaults(book?: Book, initialIsbn?: string): BookFormValues {
  return {
    isbn: book ? formatIsbn(book.isbn) : initialIsbn ? formatIsbn(initialIsbn) : '',
    title: book?.title ?? '',
    subtitle: book?.subtitle ?? '',
    authors: book?.authors.join('; ') ?? '',
    publisher: book?.publisher ?? '',
    publicationYear: book?.publicationYear ?? new Date().getFullYear(),
    category: book?.category ?? '',
    description: book?.description ?? '',
    language: book?.language ?? 'English',
    edition: book?.edition ?? '',
    pageCount: book?.pageCount ?? 200,
    coverUrl: book?.coverUrl ?? '',
    tags: book?.tags.join(', ') ?? '',
    featured: book?.featured ?? false,
  };
}

export function BookForm({ open, onClose, book, onSaved, initialIsbn }: Props) {
  const lib = useLibrary();
  const data = useData();
  const toast = useToast();
  const categories = useMemo(() => categoriesOf(data).map((c) => c.name), [data]);
  const [saving, setSaving] = useState(false);
  const form = useForm<BookFormValues, unknown, BookInput>({
    resolver: zodFormResolver(bookInputSchema),
    defaultValues: defaults(book, initialIsbn),
    mode: 'onTouched',
  });
  const { register, handleSubmit, formState: { errors, isDirty }, watch, setError, reset, setValue } = form;
  const [scanning, setScanning] = useState(false);
  const onIsbnScan = (code: string): string | undefined => {
    const digits = normalizeIsbn(code);
    if (!isValidIsbn(digits)) return `“${code}” isn’t an ISBN. Scan the barcode on the back cover.`;
    const isbn = toIsbn13(digits);
    setValue('isbn', formatIsbn(isbn), { shouldDirty: true, shouldValidate: true });
    const dup = findBookByIsbn(data, isbn, book?.id);
    if (dup) setError('isbn', { message: `Already used by “${dup.title}”` });
    setScanning(false);
    return undefined;
  };
  const title = watch('title');
  const authors = watch('authors');
  const coverUrl = watch('coverUrl');
  const category = watch('category');

  const close = () => { if (!saving) { reset(defaults(book, initialIsbn)); onClose(); } };

  const submit = handleSubmit((values) => {
    if (saving) return;
    setSaving(true);
    try {
      const dup = findBookByIsbn(data, values.isbn, book?.id);
      if (dup) { setError('isbn', { message: `Already used by “${dup.title}”` }); return; }
      const saved = book ? lib.updateBook(book.id, values) : lib.createBook(values);
      toast.success(book ? 'Book updated' : 'Book added', `“${saved.title}” ${book ? 'was saved' : 'is now in the catalog'}.`);
      reset(defaults(saved));
      onClose();
      onSaved?.(saved);
    } catch (e) {
      if (e instanceof DomainError && e.code === 'duplicate_isbn') setError('isbn', { message: e.message });
      else toast.error('Could not save book', errorMessage(e));
    } finally {
      setSaving(false);
    }
  });

  const preview = {
    title: title || 'Untitled',
    authors: (typeof authors === 'string' ? authors.split(authors.includes(';') ? ';' : ',') : authors ?? []).map((a) => a.trim()).filter(Boolean),
    coverHue: book?.coverHue ?? (title.length * 37) % 360,
    coverUrl: coverUrl || undefined,
    category: category || 'Uncategorised',
  };
  if (preview.authors.length === 0) preview.authors = ['Author'];

  return (
    <>
    <Dialog
      open={open}
      onClose={close}
      busy={saving}
      size="xl"
      title={book ? `Edit “${book.title}”` : 'Add a title'}
      description="Bibliographic details. Physical copies are added from the title page or inventory."
      footer={
        <>
          <Button variant="ghost" onClick={close} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={() => void submit()} loading={saving} disabled={book ? !isDirty : false}>
            {book ? 'Save changes' : 'Add to catalog'}
          </Button>
        </>
      }
    >
      <form onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate className="grid gap-6 md:grid-cols-[1fr_180px]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Title" required error={errors.title?.message} className="sm:col-span-2">
            <Input {...register('title')} data-autofocus autoComplete="off" />
          </Field>
          <Field label="Subtitle" error={errors.subtitle?.message} className="sm:col-span-2">
            <Input {...register('subtitle')} />
          </Field>
          <Field label="Author(s)" required error={errors.authors?.message} hint="Separate multiple authors with a semicolon" className="sm:col-span-2">
            <Input {...register('authors')} placeholder="e.g. Mara Lindqvist; Tobias Ferreira" />
          </Field>
          <Field label="ISBN" required error={errors.isbn?.message} hint="ISBN-10 or ISBN-13; the checksum is verified">
            <div className="flex gap-2">
              <Input {...register('isbn')} inputMode="numeric" placeholder="978-…" />
              <ScanButton onClick={() => setScanning(true)} label="Scan ISBN with camera" />
            </div>
          </Field>
          <Field label="Category" required error={errors.category?.message}>
            <Input {...register('category')} list="book-categories" placeholder="Choose or type" />
          </Field>
          <datalist id="book-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
          <Field label="Publisher" required error={errors.publisher?.message}>
            <Input {...register('publisher')} />
          </Field>
          <Field label="Publication year" required error={errors.publicationYear?.message}>
            <Input type="number" {...register('publicationYear')} />
          </Field>
          <Field label="Language" required error={errors.language?.message}>
            <Input {...register('language')} />
          </Field>
          <Field label="Edition" error={errors.edition?.message}>
            <Input {...register('edition')} placeholder="e.g. 2nd" />
          </Field>
          <Field label="Pages" required error={errors.pageCount?.message}>
            <Input type="number" {...register('pageCount')} />
          </Field>
          <Field label="Tags" error={errors.tags?.message} hint="Comma-separated subjects">
            <Input {...register('tags')} placeholder="algorithms, data structures" />
          </Field>
          <Field label="Description" error={errors.description?.message} className="sm:col-span-2">
            <Textarea {...register('description')} rows={4} />
          </Field>
          <Field label="Cover image URL" error={errors.coverUrl?.message} hint="Optional. A typographic cover is generated when empty or if the image fails to load." className="sm:col-span-2">
            <Input {...register('coverUrl')} placeholder="https://…" />
          </Field>
          <Checkbox label="Feature this title on the discovery page" {...register('featured')} className="sm:col-span-2" />
        </div>
        <aside className="hidden md:block">
          <p className="eyebrow mb-2">Preview</p>
          <BookCover book={preview} />
        </aside>
        <button type="submit" className="hidden" aria-hidden tabIndex={-1} />
      </form>
    </Dialog>
    <BarcodeScanner open={scanning} onClose={() => setScanning(false)} onDetected={onIsbnScan} title="Scan the ISBN" hint="Point the camera at the barcode on the back cover (EAN-13, usually starting 978 or 979)." />
    </>
  );
}
