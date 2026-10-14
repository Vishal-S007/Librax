import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { Sidebar } from './Sidebar';
import { Topbar } from './Topbar';
import { StorageBanner } from './StorageBanner';
import { useMediaQuery } from '@/hooks/useMediaQuery';
import { ErrorBoundary } from '@/app/ErrorBoundary';
import { BackgroundVideo } from './BackgroundVideo';

export function AppShell() {
  const location = useLocation();
  const reduce = useReducedMotion();
  const desktop = useMediaQuery('(min-width: 1024px)');
  const [collapsed, setCollapsed] = useState(() => {
    try { return localStorage.getItem('librax:sidebar') === 'collapsed'; } catch { return false; }
  });
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => setMobileOpen(false), [location.pathname]);
  useEffect(() => {
    try { localStorage.setItem('librax:sidebar', collapsed ? 'collapsed' : 'expanded'); } catch { /* ignore */ }
  }, [collapsed]);

  return (
    <div className="relative flex min-h-dvh bg-canvas">
      <BackgroundVideo variant="blurred" />
      <a href="#main" className="sr-only z-50 rounded bg-brass px-3 py-2 text-brass-ink focus:not-sr-only focus:fixed focus:left-3 focus:top-3">
        Skip to content
      </a>
      <Sidebar
        collapsed={desktop && collapsed}
        onToggleCollapse={() => setCollapsed((c) => !c)}
        mobileOpen={!desktop && mobileOpen}
        onCloseMobile={() => setMobileOpen(false)}
        desktop={desktop}
      />
      <div className="relative z-10 flex min-w-0 flex-1 flex-col">
        <Topbar onOpenMenu={() => setMobileOpen(true)} />
        <StorageBanner />
        <main id="main" tabIndex={-1} className="paper-grain flex-1 focus:outline-none">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={location.pathname}
              initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="mx-auto w-full max-w-[1400px] px-4 py-6 sm:px-6 lg:px-10 lg:py-10"
            >
              <ErrorBoundary key={location.pathname}>
                <Outlet />
              </ErrorBoundary>
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
