import { useEffect } from 'react';
import { Moon, Sun } from 'lucide-react';
import { useData, useLibrary } from '@/app/providers';
import { useMediaQuery } from '@/hooks/useMediaQuery';

export function useAppliedTheme(): 'dark' | 'light' {
  const { settings } = useData();
  const prefersDark = useMediaQuery('(prefers-color-scheme: dark)');
  const theme = settings.theme === 'system' ? (prefersDark ? 'dark' : 'light') : settings.theme;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
    try { localStorage.setItem('librax:theme', settings.theme); } catch { /* ignore */ }
  }, [theme, settings.theme]);
  return theme;
}

export function ThemeToggle() {
  const lib = useLibrary();
  const theme = useAppliedTheme();
  const next = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      onClick={() => { try { lib.setTheme(next); } catch { /* storage issues are shown by the banner */ } }}
      className="rounded-control p-2 text-ink-muted transition hover:bg-surface-raised hover:text-ink"
      aria-label={`Switch to ${next} theme`}
      title={`Switch to ${next} theme`}
    >
      {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
    </button>
  );
}
