import { useMemo } from 'react';
import { NavLink } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, X } from 'lucide-react';
import { useData, useSession } from '@/app/providers';
import { GROUP_ORDER, NAV } from '@/routes/nav';
import { ROLE_LABEL } from '@/services/session';
import { cn } from '@/lib/cn';
import { LogoMark, Wordmark } from './Logo';
import { useBase, useRecipients } from '@/hooks/useRole';

interface Props {
  collapsed: boolean;
  onToggleCollapse: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  desktop: boolean;
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onCloseMobile, desktop }: Props) {
  const session = useSession();
  const data = useData();
  const base = useBase();
  const recipients = useRecipients();
  const items = session ? NAV[session.role] : [];
  const unread = data.notifications.filter((n) => recipients.includes(n.recipient) && !n.read).length;
  const libraryName = data.settings.libraryName;

  const groups = useMemo(() => {
    const hasGroups = items.some((i) => i.group);
    if (!hasGroups) return [{ name: '', items }];
    return GROUP_ORDER.map((g) => ({ name: g, items: items.filter((i) => i.group === g) })).filter((g) => g.items.length);
  }, [items]);

  const nav = (
    <nav aria-label="Main" className="flex-1 overflow-y-auto px-3 pb-4">
      {groups.map((g) => (
        <div key={g.name || 'main'} className="mt-5 first:mt-2">
          {g.name && !collapsed && <p className="eyebrow mb-1.5 px-3">{g.name}</p>}
          <ul className="space-y-0.5">
            {g.items.map((item) => (
              <li key={item.path}>
                <NavLink
                  to={`${base}/${item.path}`}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) =>
                    cn(
                      'group relative flex items-center gap-3 rounded-control px-3 py-2 text-[13.5px] font-medium transition duration-fast',
                      isActive ? 'bg-surface-raised text-ink' : 'text-ink-muted hover:bg-surface-raised/60 hover:text-ink',
                      collapsed && 'justify-center px-0',
                    )
                  }
                >
                  {({ isActive }) => (
                    <>
                      {isActive && <motion.span layoutId="nav-active" className="absolute inset-y-1.5 left-0 w-[3px] rounded-full bg-brass" transition={{ duration: 0.2 }} />}
                      <item.icon className={cn('h-[18px] w-[18px] shrink-0', isActive ? 'text-brass' : 'text-ink-faint group-hover:text-ink-muted')} aria-hidden />
                      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
                      {!collapsed && item.path === 'notifications' && unread > 0 && (
                        <span className="rounded-full bg-brass px-1.5 text-[11px] font-semibold text-brass-ink tabular">{unread}</span>
                      )}
                    </>
                  )}
                </NavLink>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );

  const header = (
    <div className={cn('flex h-16 items-center gap-2.5 px-4', collapsed && 'justify-center px-0')}>
      <LogoMark className="h-8 w-8 shrink-0" />
      {!collapsed && (
        <div className="min-w-0">
          <Wordmark />
          <p className="-mt-0.5 truncate text-[11px] text-ink-faint">{libraryName}</p>
        </div>
      )}
    </div>
  );

  const footer = session && (
    <div className={cn('border-t border-line p-3', collapsed && 'px-2')}>
      {!collapsed && (
        <div className="mb-2 rounded-control bg-surface-raised px-3 py-2">
          <p className="truncate text-[13px] font-medium text-ink">{session.name}</p>
          <p className="text-[11px] text-ink-faint">{ROLE_LABEL[session.role]} · demo session</p>
        </div>
      )}
      {desktop && (
        <button
          onClick={onToggleCollapse}
          className="flex w-full items-center justify-center gap-2 rounded-control py-2 text-xs text-ink-faint transition hover:bg-surface-raised hover:text-ink"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          aria-expanded={!collapsed}
        >
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <><ChevronsLeft className="h-4 w-4" /> Collapse</>}
        </button>
      )}
    </div>
  );

  if (desktop) {
    return (
      <aside className={cn('sticky top-0 z-10 hidden h-dvh shrink-0 flex-col border-r border-line bg-surface/70 backdrop-blur-xl transition-[width] duration-slow lg:flex', collapsed ? 'w-[76px]' : 'w-[260px]')}>
        {header}
        {nav}
        {footer}
      </aside>
    );
  }

  return (
    <AnimatePresence>
      {mobileOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <motion.div className="absolute inset-0 bg-black/60" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onCloseMobile} aria-hidden />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-label="Navigation"
            initial={{ x: -280 }} animate={{ x: 0 }} exit={{ x: -280 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className="relative flex h-full w-[280px] flex-col border-r border-line bg-surface"
          >
            <div className="flex items-center justify-between pr-3">
              {header}
              <button onClick={onCloseMobile} className="rounded-control p-2 text-ink-muted hover:bg-surface-raised" aria-label="Close navigation">
                <X className="h-5 w-5" />
              </button>
            </div>
            {nav}
            {footer}
          </motion.aside>
        </div>
      )}
    </AnimatePresence>
  );
}
