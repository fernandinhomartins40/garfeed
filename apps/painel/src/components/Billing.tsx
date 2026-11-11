// Cobrança da assinatura (Asaas): peças usadas pelo dono (Configurações) e pelo admin (Planos).
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Crown, ExternalLink } from 'lucide-react';
import { api, BILLING_CYCLE_LABEL, BILLING_STATUS_LABEL, formatBRL, PLAN_LABEL, type BillingPayment, type BillingStatus, type Plan } from '@garfeed/shared';
import { call } from '@/lib/api';
import { Badge, Card, type Tone } from '@/components/ui/misc';
import { Dialog } from '@/components/ui/dialog';

export const BILLING_TONE: Record<BillingStatus, Tone> = { NONE: 'gray', OK: 'green', PENDING: 'yellow', OVERDUE: 'red', CANCELED: 'gray' };
const PAYMENT_LABEL: Record<string, [string, Tone]> = {
  PENDING: ['Em aberto', 'yellow'], OVERDUE: ['Vencida', 'red'], CONFIRMED: ['Paga', 'green'], RECEIVED: ['Paga', 'green'],
  RECEIVED_IN_CASH: ['Paga', 'green'], REFUNDED: ['Estornada', 'gray'], DELETED: ['Removida', 'gray'],
};
/** AAAA-MM-DD → DD/MM/AAAA (sem passar por Date: evita voltar um dia no fuso). */
export const brDate = (d: string | null) => (d ? d.split('-').reverse().join('/') : '—');

export function PaymentsTable({ payments }: { payments: BillingPayment[] }) {
  if (!payments.length) return <p className="text-gf-muted">Nenhuma cobrança ainda.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead><tr className="border-b border-gf-border text-gf-navy-80">{['Vencimento', 'Valor', 'Situação', 'Pago em', ''].map((h) => <th key={h} className="py-2 font-semibold">{h}</th>)}</tr></thead>
        <tbody>
          {payments.map((p) => {
            const [label, tone] = PAYMENT_LABEL[p.status] ?? [p.status, 'gray' as Tone];
            return (
              <tr key={p.id} className="border-b border-gf-border last:border-0">
                <td className="py-2">{brDate(p.dueDate)}</td>
                <td className="font-semibold">{formatBRL(p.valueCents)}</td>
                <td><Badge tone={tone}>{label}</Badge></td>
                <td>{brDate(p.paidAt)}</td>
                <td className="text-right">{p.invoiceUrl && p.status !== 'DELETED' && (
                  <a href={p.invoiceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-semibold text-gf-orange hover:underline">Fatura<ExternalLink className="h-4 w-4" /></a>
                )}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Card 'Plano atual' (P11). Só o dono chega aqui; a API usa o restaurante do token. */
export function PlanCard({ plan }: { plan: Plan }) {
  const q = useQuery({ queryKey: ['settings', 'billing'], queryFn: () => call(api.billing.mine) });
  const [history, setHistory] = useState(false);
  const b = q.data;
  const status = b?.status === 'SUSPENDED' ? 'Suspenso' : b?.status === 'TRIAL' && b.billingStatus === 'NONE' ? 'Período de teste' : b ? BILLING_STATUS_LABEL[b.billingStatus] : null;
  return (
    <Card className='p-5'>
      <div className='flex flex-wrap items-center gap-4'>
        <Crown className='h-7 w-7' />
        <div className='flex-1'><h2 className='font-heading text-2xl font-black'>Plano atual</h2><p className='text-gf-navy-80'>Seu plano e opções de assinatura.</p></div>
        <span className='rounded-pill bg-blue-50 px-4 py-1.5 text-lg font-bold text-info'>{PLAN_LABEL[plan]}</span>
        <a href='mailto:contato@garfeed.com.br?subject=Plano' className='inline-flex h-11 items-center rounded-lg bg-gf-bg px-4 font-semibold hover:bg-gf-border'>Gerenciar plano</a>
      </div>
      {b && (
        <div className='mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gf-border pt-4'>
          <span><span className='block text-sm text-gf-muted'>Situação</span><Badge tone={b.status === 'SUSPENDED' ? 'red' : BILLING_TONE[b.billingStatus]}>{status}</Badge></span>
          {b.valueCents != null && b.cycle && <span><span className='block text-sm text-gf-muted'>Valor</span><b>{formatBRL(b.valueCents)}</b> · {BILLING_CYCLE_LABEL[b.cycle].toLowerCase()}</span>}
          {b.nextDueDate && <span><span className='block text-sm text-gf-muted'>Próximo vencimento</span><b>{brDate(b.nextDueDate)}</b></span>}
          <span className='flex flex-1 flex-wrap justify-end gap-3'>
            {b.payments.length > 0 && <button type='button' className='h-11 rounded-lg px-3 font-semibold text-gf-navy-80 hover:bg-gf-bg' onClick={() => setHistory(true)}>Histórico</button>}
            {b.openInvoiceUrl && (
              <a href={b.openInvoiceUrl} target='_blank' rel='noreferrer' className='inline-flex h-11 items-center gap-2 rounded-lg bg-gf-orange px-4 font-semibold text-white hover:bg-gf-orange-hover'>
                {b.billingStatus === 'OVERDUE' ? 'Pagar fatura vencida' : 'Abrir fatura'}<ExternalLink className='h-4 w-4' />
              </a>
            )}
          </span>
        </div>
      )}
      {b?.status === 'SUSPENDED' && <p role='alert' className='mt-3 text-sm font-medium text-danger'>Seu cardápio está em modo somente visualização. {b.openInvoiceUrl ? 'Pague a fatura em aberto para voltar a receber pedidos.' : 'Fale com o Garfeed para reativar.'}</p>}
      {b && <Dialog open={history} onOpenChange={setHistory} title='Histórico de pagamentos' className='max-w-xl'><PaymentsTable payments={b.payments} /></Dialog>}
    </Card>
  );
}
