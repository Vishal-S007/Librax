import { cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';
import { cn } from '@/lib/cn';

interface FieldProps {
  label: string;
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  className?: string;
  children: ReactElement<{ id?: string; 'aria-invalid'?: boolean; 'aria-describedby'?: string }>;
}

/** Wraps a control with an accessible label, hint and inline error. */
export function Field({ label, error, hint, required, className, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : '', error ? errId : ''].filter(Boolean).join(' ') || undefined;
  const control = isValidElement(children)
    ? cloneElement(children, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })
    : children;
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <label htmlFor={id} className="text-[13px] font-medium text-ink">
        {label}
        {required && <span className="ml-0.5 text-rose" aria-hidden> *</span>}
      </label>
      {control}
      {hint && !error && <p id={hintId} className="text-xs text-ink-faint">{hint}</p>}
      {error && (
        <p id={errId} role="alert" className="flex items-center gap-1 text-xs font-medium text-rose">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </div>
  );
}
