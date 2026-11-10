import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';

/** P13 — "🔔 Novo pedido · Mesa 7" (dispensável). */
export function OrderToast({ id, table }: { id: string | number; table: string }) {
  return (
    <div className="flex w-[min(92vw,420px)] items-center gap-4 rounded-card border border-gf-peach bg-gf-orange-soft p-3 shadow-xl">
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-gf-orange text-white"><Bell className="h-6 w-6" /></span>
      <p className="flex-1 font-heading text-xl font-black text-gf-navy">Novo pedido · {table}</p>
      <button aria-label="Dispensar" className="rounded-full p-1 text-gf-navy-80 hover:bg-white" onClick={() => toast.dismiss(id)}><X className="h-5 w-5" /></button>
    </div>
  );
}
