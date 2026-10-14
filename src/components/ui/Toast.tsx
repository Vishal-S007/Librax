import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { cn } from '@/lib/cn';

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem { id: number; tone: ToastTone; title: string; body?: string }
interface ToastApi {
  success: (title: string, body?: string) => void;
  error: (title: string, body?: string) => void;
  info: (title: string, body?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);
  const dismiss = useCallback((id: number) => setItems((xs) => xs.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: ToastTone, title: string, body?: string) => {
    const id = ++seq.current;
    setItems((xs) => [...xs.slice(-3), { id, tone, title, body }]);
    window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200);
  }, [dismiss]);
  const api = useMemo<ToastApi>(() => ({
    success: (t, b) => push('success', t, b),
    error: (t, b) => push('error', t, b),
    info: (t, b) => push('info', t, b),
  }), [push]);
  const icon = { success: CheckCircle2, error: TriangleAlert, info: Info };
  const color = { success: 'text-sage', error: 'text-rose', info: 'text-sky' };
  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[60] flex flex-col items-center gap-2 p-4 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end" aria-live="polite" role="status">
        <AnimatePresence initial={false}>
          {items.map((t) => {
            const Icon = icon[t.tone];
            return (
              <motion.div
                key={t.id}
                layout
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, x: 24 }}
                transition={{ duration: 0.2 }}
                className="pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-card border border-line bg-surface-raised p-3.5 shadow-pop"
                role={t.tone === 'error' ? 'alert' : undefined}
              >
                <Icon className={cn('mt-0.5 h-5 w-5 shrink-0', color[t.tone])} aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink">{t.title}</p>
                  {t.body && <p className="mt-0.5 text-[13px] leading-snug text-ink-muted">{t.body}</p>}
                </div>
                <button onClick={() => dismiss(t.id)} className="rounded p-0.5 text-ink-faint hover:text-ink" aria-label="Dismiss notification">
                  <X className="h-4 w-4" />
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
