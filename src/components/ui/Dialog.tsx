import { useCallback, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';
import { useFocusTrap } from '@/hooks/useFocusTrap';
import { cn } from '@/lib/cn';

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Prevent closing on backdrop/escape (e.g. while saving). */
  busy?: boolean;
  variant?: 'modal' | 'drawer';
}

const widths = { sm: 'max-w-md', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

export function Dialog({ open, onClose, title, description, children, footer, size = 'md', busy, variant = 'modal' }: DialogProps) {
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const descId = useId();
  const reduce = useReducedMotion();
  const close = useCallback(() => { if (!busy) onClose(); }, [busy, onClose]);
  useFocusTrap(ref, open, close);
  const drawer = variant === 'drawer';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className={cn('fixed inset-0 z-50 flex', drawer ? 'justify-end' : 'items-end justify-center sm:items-center sm:p-6')}>
          <motion.div
            className="absolute inset-0 bg-[rgb(5_6_10/0.62)] backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={close}
            aria-hidden
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            initial={reduce ? { opacity: 0 } : drawer ? { x: 40, opacity: 0 } : { y: 16, opacity: 0, scale: 0.98 }}
            animate={reduce ? { opacity: 1 } : drawer ? { x: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
            exit={reduce ? { opacity: 0 } : drawer ? { x: 40, opacity: 0 } : { y: 10, opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className={cn(
              'relative flex max-h-[100dvh] w-full flex-col border border-line bg-surface shadow-pop focus:outline-none',
              drawer ? 'h-full max-w-xl rounded-l-card' : cn('max-h-[92dvh] rounded-t-card sm:rounded-card', widths[size]),
            )}
          >
            <header className="flex items-start gap-4 border-b border-line px-5 py-4 sm:px-6">
              <div className="min-w-0 flex-1">
                <h2 id={titleId} className="font-display text-xl text-ink">{title}</h2>
                {description && <div id={descId} className="mt-1 text-sm text-ink-muted">{description}</div>}
              </div>
              <button onClick={close} disabled={busy} className="-mr-2 rounded-control p-2 text-ink-faint transition hover:bg-surface-raised hover:text-ink" aria-label="Close dialog">
                <X className="h-5 w-5" />
              </button>
            </header>
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">{children}</div>
            {footer && <footer className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface-raised/60 px-5 py-3.5 sm:px-6">{footer}</footer>}
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
