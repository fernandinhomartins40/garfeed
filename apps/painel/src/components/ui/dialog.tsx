import * as D from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = { open: boolean; onOpenChange: (o: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; className?: string; footer?: ReactNode };

export function Dialog({ open, onOpenChange, title, description, children, className, footer }: Props) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-gf-navy/40 backdrop-blur-[2px]" />
        <D.Content
          aria-describedby={undefined}
          className={cn('fixed left-1/2 top-1/2 z-50 max-h-[92vh] w-[calc(100%-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-sheet bg-white p-6 shadow-2xl focus:outline-none', className)}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <D.Title className="font-heading text-2xl font-black text-gf-navy">{title}</D.Title>
              {description && <D.Description className="mt-1 text-gf-navy-80">{description}</D.Description>}
            </div>
            <D.Close className="rounded-full p-1 text-gf-navy-80 hover:bg-gf-bg" aria-label="Fechar"><X className="h-6 w-6" /></D.Close>
          </div>
          {children}
          {footer && <div className="mt-6 flex justify-end gap-3">{footer}</div>}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Drawer lateral (shadcn Sheet). */
export function Sheet({ open, onOpenChange, title, children, side = 'right', className }: Omit<Props, 'footer' | 'description'> & { side?: 'right' | 'left' }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-gf-navy/30" />
        <D.Content
          aria-describedby={undefined}
          className={cn('fixed inset-y-0 z-50 flex w-full max-w-md flex-col overflow-y-auto bg-white shadow-2xl focus:outline-none', side === 'right' ? 'right-0 sm:rounded-l-sheet' : 'left-0', className)}
        >
          <D.Title className="sr-only">{title}</D.Title>
          <D.Close className="absolute right-4 top-4 z-10 rounded-full p-1 text-gf-navy-80 hover:bg-gf-bg" aria-label="Fechar"><X className="h-6 w-6" /></D.Close>
          {children}
        </D.Content>
      </D.Portal>
    </D.Root>
  );
}

/** Confirmação simples (fechar mesa, bloquear placa...). */
export function Confirm({ open, onOpenChange, title, description, confirmLabel, onConfirm, loading, danger }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description: ReactNode; confirmLabel: string; onConfirm: () => void; loading?: boolean; danger?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} className="max-w-md">
      <div className="text-gf-navy-80">{description}</div>
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" className="h-11 rounded-pill border border-gf-border px-5 font-semibold text-gf-navy hover:bg-gf-bg" onClick={() => onOpenChange(false)}>Cancelar</button>
        <button type="button" disabled={loading} onClick={onConfirm}
          className={cn('h-11 rounded-pill px-5 font-semibold text-white disabled:opacity-50', danger ? 'bg-danger' : 'bg-gf-orange hover:bg-gf-orange-hover')}>
          {loading ? 'Aguarde…' : confirmLabel}
        </button>
      </div>
    </Dialog>
  );
}
