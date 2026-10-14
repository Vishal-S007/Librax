import { forwardRef, type InputHTMLAttributes, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';

export const controlBase =
  'w-full rounded-control border border-line bg-surface-sunken px-3 text-sm text-ink placeholder:text-ink-faint transition duration-fast ' +
  'hover:border-line-strong focus:border-brass focus:outline-none focus:ring-2 focus:ring-brass/25 ' +
  'aria-[invalid=true]:border-rose aria-[invalid=true]:ring-rose/20 disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(controlBase, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(controlBase, 'min-h-[96px] py-2.5 leading-relaxed', className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select({ className, children, ...rest }, ref) {
  return (
    <div className="relative">
      <select ref={ref} className={cn(controlBase, 'h-10 appearance-none pr-9', className)} {...rest}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint" aria-hidden />
    </div>
  );
});

export const Checkbox = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement> & { label: string }>(function Checkbox({ label, className, ...rest }, ref) {
  return (
    <label className={cn('inline-flex cursor-pointer items-center gap-2 text-sm text-ink', className)}>
      <input ref={ref} type="checkbox" className="h-4 w-4 rounded border-line-strong bg-surface-sunken accent-[rgb(var(--brass))]" {...rest} />
      {label}
    </label>
  );
});

export function RadioGroup<T extends string>({
  name, value, onChange, options, legend,
}: { name: string; value: T; onChange: (v: T) => void; options: { value: T; label: string; hint?: string }[]; legend: string }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] font-medium text-ink">{legend}</legend>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer items-start gap-2.5 rounded-control border p-3 text-sm transition',
              value === o.value ? 'border-brass bg-brass-soft/50' : 'border-line hover:border-line-strong',
            )}
          >
            <input type="radio" name={name} value={o.value} checked={value === o.value} onChange={() => onChange(o.value)} className="mt-0.5 accent-[rgb(var(--brass))]" />
            <span>
              <span className="font-medium text-ink">{o.label}</span>
              {o.hint && <span className="block text-xs text-ink-faint">{o.hint}</span>}
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
