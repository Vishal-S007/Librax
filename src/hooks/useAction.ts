import { useCallback, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { errorMessage } from '@/lib/errors';

/** Runs a mutation with duplicate-submit protection and toast feedback. */
export function useAction() {
  const toast = useToast();
  const [pending, setPending] = useState(false);
  const run = useCallback(
    <T,>(fn: () => T, success?: string | ((r: T) => string), opts: { errorTitle?: string } = {}): T | undefined => {
      if (pending) return undefined;
      setPending(true);
      try {
        const r = fn();
        if (success) toast.success(typeof success === 'function' ? success(r) : success);
        return r;
      } catch (e) {
        toast.error(opts.errorTitle ?? 'Action not completed', errorMessage(e));
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [pending, toast],
  );
  return { run, pending };
}
