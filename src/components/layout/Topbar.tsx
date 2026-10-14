import { Menu } from 'lucide-react';
import { Breadcrumbs } from './Breadcrumbs';
import { GlobalSearch } from './GlobalSearch';
import { NotificationBell } from './NotificationBell';
import { ThemeToggle } from './ThemeToggle';
import { ProfileMenu } from './ProfileMenu';
import { LogoMark } from './Logo';

export function Topbar({ onOpenMenu }: { onOpenMenu: () => void }) {
  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-2 border-b border-line bg-canvas/60 px-3 backdrop-blur-xl sm:gap-3 sm:px-6 lg:px-10">
      <button onClick={onOpenMenu} className="rounded-control p-2 text-ink-muted hover:bg-surface-raised lg:hidden" aria-label="Open navigation">
        <Menu className="h-5 w-5" />
      </button>
      <LogoMark className="h-7 w-7 lg:hidden" />
      <div className="hidden min-w-0 flex-1 md:block"><Breadcrumbs /></div>
      <div className="flex flex-1 items-center justify-end gap-1.5 sm:gap-2 md:flex-none">
        <GlobalSearch />
        <ThemeToggle />
        <NotificationBell />
        <ProfileMenu />
      </div>
    </header>
  );
}
