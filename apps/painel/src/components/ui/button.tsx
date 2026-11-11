import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

const variants = {
  primary: 'bg-gf-orange text-white hover:bg-gf-orange-hover shadow-sm',
  outline: 'border border-gf-border bg-white text-gf-navy hover:bg-gf-bg',
  navy: 'border border-gf-navy bg-white text-gf-navy hover:bg-gf-bg',
  ghost: 'text-gf-navy-80 hover:bg-gf-bg',
  soft: 'bg-gf-orange-soft text-gf-orange hover:bg-gf-peach',
  danger: 'bg-danger text-white hover:opacity-90',
  success: 'bg-success text-white hover:opacity-90',
  info: 'bg-info text-white hover:opacity-90',
} as const;
// min-h (não h): no celular estreito o rótulo quebra em 2 linhas em vez de estourar a largura
const sizes = { sm: 'h-9 px-3 text-sm', md: 'min-h-11 px-5 py-1.5', lg: 'min-h-12 px-6 py-2 text-lg', icon: 'h-11 w-11' } as const;

export type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof variants; size?: keyof typeof sizes; loading?: boolean;
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'primary', size = 'md', loading, disabled, children, type = 'button', ...p }, ref) => (
    <button
      ref={ref} type={type} disabled={disabled || loading}
      className={cn('inline-flex max-w-full shrink-0 items-center justify-center gap-2 rounded-pill [&_svg]:shrink-0 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-orange focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
        variants[variant], sizes[size], className)}
      {...p}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  ),
);
Button.displayName = 'Button';
