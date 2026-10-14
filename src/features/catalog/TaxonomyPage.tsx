import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '@/app/providers';
import { useBase } from '@/hooks/useRole';
import { Card, PageHeader } from '@/components/ui/Layout';
import { authorsOf, categoriesOf } from '@/services/catalog';

export default function TaxonomyPage() {
  const data = useData();
  const base = useBase();
  const cats = useMemo(() => categoriesOf(data), [data]);
  const authors = useMemo(() => authorsOf(data), [data]);
  const tags = useMemo(() => {
    const m = new Map<string, number>();
    for (const b of data.books) if (b.status === 'active') for (const t of b.tags) m.set(t, (m.get(t) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [data.books]);
  return (
    <div>
      <PageHeader eyebrow="Collection" title="Categories & authors" description="Derived from catalog records. Rename a category or author by editing the titles that use it." />
      <div className="grid gap-4 lg:grid-cols-3">
        <Card title={`Categories (${cats.length})`} bodyClassName="p-0">
          <ul className="divide-y divide-line">{cats.map((c) => (
            <li key={c.name}><Link to={`${base}/books?category=${encodeURIComponent(c.name)}`} className="flex justify-between px-5 py-2.5 text-sm hover:bg-surface-raised"><span className="text-ink">{c.name}</span><span className="tabular text-ink-faint">{c.count}</span></Link></li>
          ))}</ul>
        </Card>
        <Card title={`Authors (${authors.length})`} bodyClassName="p-0">
          <ul className="max-h-[560px] divide-y divide-line overflow-y-auto">{authors.map((a) => (
            <li key={a.name}><Link to={`${base}/books?q=${encodeURIComponent(a.name)}`} className="flex justify-between px-5 py-2.5 text-sm hover:bg-surface-raised"><span className="text-ink">{a.name}</span><span className="tabular text-ink-faint">{a.count}</span></Link></li>
          ))}</ul>
        </Card>
        <Card title={`Subjects (${tags.length})`}>
          <div className="flex flex-wrap gap-1.5">{tags.map(([t, n]) => (
            <Link key={t} to={`${base}/books?q=${encodeURIComponent(t)}`} className="rounded-full border border-line px-2.5 py-1 text-xs text-ink-muted hover:border-brass hover:text-brass">#{t} <span className="text-ink-faint">{n}</span></Link>
          ))}</div>
        </Card>
      </div>
    </div>
  );
}
