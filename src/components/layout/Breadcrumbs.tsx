import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { useData, useSession } from '@/app/providers';
import { NAV } from '@/routes/nav';
import { ROLE_LABEL } from '@/services/session';

export function Breadcrumbs() {
  const { pathname } = useLocation();
  const session = useSession();
  const data = useData();
  if (!session) return null;
  const parts = pathname.split('/').filter(Boolean);
  const [role, section, id] = parts;
  const base = `/${role}`;
  const item = NAV[session.role].find((n) => n.path === section);
  const crumbs: { label: string; to?: string }[] = [{ label: ROLE_LABEL[session.role], to: `${base}/${NAV[session.role][0]!.path}` }];
  if (item) crumbs.push({ label: item.label, to: id ? `${base}/${section}` : undefined });
  else if (section === 'books') crumbs.push({ label: 'Books', to: `${base}/discover` });
  if (id) {
    const label = section === 'books'
      ? data.books.find((b) => b.id === id)?.title
      : section === 'members' ? data.members.find((m) => m.id === id)?.name : undefined;
    crumbs.push({ label: label ?? 'Details' });
  }
  return (
    <nav aria-label="Breadcrumb">
      <ol className="flex min-w-0 items-center gap-1.5 text-[13px]">
        {crumbs.map((c, i) => (
          <li key={i} className="flex min-w-0 items-center gap-1.5">
            {i > 0 && <ChevronRight className="h-3.5 w-3.5 shrink-0 text-ink-faint" aria-hidden />}
            {c.to && i < crumbs.length - 1 ? (
              <Link to={c.to} className="truncate text-ink-faint hover:text-ink">{c.label}</Link>
            ) : (
              <span className="truncate font-medium text-ink" aria-current={i === crumbs.length - 1 ? 'page' : undefined}>{c.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
