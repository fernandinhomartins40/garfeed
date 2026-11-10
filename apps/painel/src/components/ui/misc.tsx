import { forwardRef, type HTMLAttributes, type ReactNode } from 'react';
import { MoreHorizontal } from 'lucide-react';
import { cn } from '@/lib/utils';

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-card border border-gf-border bg-white shadow-card', className)} {...p} />
);

const tones = {
  green: 'bg-green-50 text-success', orange: 'bg-gf-orange-soft text-gf-orange', red: 'bg-red-50 text-danger',
  blue: 'bg-blue-50 text-info', gray: 'bg-gf-bg text-gf-navy-80', yellow: 'bg-amber-50 text-amber-700', navy: 'bg-gf-navy text-white',
} as const;
export type Tone = keyof typeof tones;
export const Badge = ({ tone = 'gray', className, ...p }: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) => (
  <span className={cn('inline-flex items-center gap-1.5 whitespace-nowrap rounded-pill px-2.5 py-1 text-sm font-semibold', tones[tone], className)} {...p} />
);

export const PageTitle = ({ children, actions }: { children: ReactNode; actions?: ReactNode }) => (
  <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
    <h1 className="font-heading text-4xl font-black text-gf-navy md:text-5xl">{children}</h1>
    {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
  </div>
);

export const MoreButton = forwardRef<HTMLButtonElement, HTMLAttributes<HTMLButtonElement>>((p, ref) => (
  <button ref={ref} type="button" className="grid h-10 w-10 place-items-center rounded-lg border border-gf-border bg-white text-gf-navy hover:bg-gf-bg data-[state=open]:border-gf-orange" {...p}>
    <MoreHorizontal className="h-5 w-5" />
  </button>
));
MoreButton.displayName = 'MoreButton';

export function Empty({ icon, title, text, children }: { icon: ReactNode; title: string; text?: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <div className="mb-5 grid h-24 w-24 place-items-center rounded-3xl bg-gf-orange-soft text-gf-navy">{icon}</div>
      <h2 className="font-heading text-2xl font-black text-gf-navy">{title}</h2>
      {text && <p className="mt-1 max-w-md text-gf-navy-80">{text}</p>}
      {children && <div className="mt-5 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

export const Spinner = () => <div className="py-16 text-center text-gf-muted">Carregando…</div>;
export const ErrorBox = ({ error, retry }: { error: unknown; retry?: () => void }) => (
  <div role="alert" className="rounded-card border border-red-200 bg-red-50 p-4 text-danger">
    {error instanceof Error ? error.message : 'Erro ao carregar.'}{' '}
    {retry && <button className="font-semibold underline" onClick={retry}>Tentar de novo</button>}
  </div>
);

/** Miniatura do item (48 px); vazio mantém o alinhamento. */
export function Thumb({ src }: { src: string | null }) {
  return src
    ? <img src={src} alt="" loading="lazy" className="h-12 w-12 shrink-0 rounded-lg object-cover" />
    : <span aria-hidden className="h-12 w-12 shrink-0 rounded-lg bg-gf-bg" />;
}
