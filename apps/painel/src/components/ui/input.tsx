import { forwardRef, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

const base = 'w-full rounded-lg border border-gf-border bg-white px-3 text-gf-navy placeholder:text-gf-muted focus:border-gf-orange focus:outline-none focus:ring-2 focus:ring-gf-orange/20 disabled:bg-gf-bg';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(base, 'h-11', className)} {...p} />
));
Input.displayName = 'Input';

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(base, 'min-h-24 py-2', className)} {...p} />
));
Textarea.displayName = 'Textarea';

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <div className={cn('relative', className)}>
    <select ref={ref} className={cn(base, 'h-11 appearance-none pr-10')} {...p} />
    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gf-navy" />
  </div>
));
Select.displayName = 'Select';

/** Rótulo persistente + erro. */
export function Field({ label, error, children, className, hint }: { label: ReactNode; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-sm font-semibold text-gf-navy">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gf-muted">{hint}</span>}
      {error && <span role="alert" className="block text-xs font-medium text-danger">{error}</span>}
    </label>
  );
}
