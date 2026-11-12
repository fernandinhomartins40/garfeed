// Cobrança da assinatura (Asaas): peças usadas pelo dono (Configurações) e pelo admin (Planos).
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { CheckCircle2, Crown, ExternalLink } from 'lucide-react';
import {
  api, BILLING_CYCLE_LABEL, BILLING_STATUS_LABEL, formatBRL, OwnerSubscribeBody, PLAN_LABEL, planValueCents,
  type BillingCycle, type BillingPayment, type BillingStatus, type OwnerBilling, type Plan,
} from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { isStoreApp } from '@/lib/storeApp';
import { cn } from '@/lib/utils';
import { Badge, Card, type Tone } from '@/components/ui/misc';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';

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

const KEY = ['settings', 'billing'];
/** Planos que o dono assina sozinho (Rede é sob consulta). O valor cobrado é sempre o da tabela, calculado pela API. */
const OWNER_PLANS = ['ESSENTIAL', 'PRO'] as const;
type OwnerPlan = (typeof OWNER_PLANS)[number];
const CYCLES = ['MONTHLY', 'YEARLY'] as const;

/** Assinar (CPF/CNPJ + contato + plano), trocar de plano/ciclo e cancelar. Monta só quando abre: o estado nasce limpo. */
function ManagePlan({ b, onClose }: { b: OwnerBilling; onClose: () => void }) {
  const qc = useQueryClient();
  const me = useAuth((s) => s.user);
  const [plan, setPlan] = useState<OwnerPlan>(b.plan === 'PRO' ? 'PRO' : 'ESSENTIAL');
  const [cycle, setCycle] = useState<BillingCycle>(b.cycle ?? 'MONTHLY');
  const [cpfCnpj, setCpfCnpj] = useState(b.customer?.cpfCnpj ?? '');
  const [email, setEmail] = useState(b.customer?.email ?? me?.email ?? '');
  const [phone, setPhone] = useState(b.customer?.phone ?? '');
  const [error, setError] = useState('');
  const [done, setDone] = useState<'subscribed' | 'changed' | null>(null);
  const [confirm, setConfirm] = useState(false);
  const wasSubscribed = useState(b.subscribed)[0];

  const save = useMutation({
    mutationFn: () => {
      if (wasSubscribed) return call(api.billing.changeMine, { body: { plan, cycle } });
      const body = { plan, cycle, cpfCnpj, email: email.trim() || null, phone: phone.trim() || null };
      const parsed = OwnerSubscribeBody.safeParse(body);
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? 'Confira os dados informados.');
      return call(api.billing.subscribe, { body });
    },
    onMutate: () => setError(''),
    onSuccess: (d) => { qc.setQueryData(KEY, d); setDone(wasSubscribed ? 'changed' : 'subscribed'); },
    onError: (e) => setError(errMsg(e)),
  });
  const cancel = useMutation({
    mutationFn: () => call(api.billing.cancelMine),
    onSuccess: (d) => { qc.setQueryData(KEY, d); onClose(); },
    onError: (e) => { setConfirm(false); setError(errMsg(e)); },
  });
  const busy = save.isPending || cancel.isPending;
  const same = wasSubscribed && plan === b.plan && cycle === b.cycle;

  if (done) {
    return (
      <Dialog open onOpenChange={onClose} title={done === 'changed' ? 'Plano atualizado' : 'Assinatura criada'}>
        <div role='status' className='space-y-4 text-center text-gf-navy-80'>
          <CheckCircle2 className='mx-auto h-12 w-12 text-success' />
          <p>
            Plano <b>{PLAN_LABEL[b.plan]}</b>{b.valueCents != null && b.cycle && <> · <b>{formatBRL(b.valueCents)}</b> ({BILLING_CYCLE_LABEL[b.cycle].toLowerCase()})</>}.
            {b.nextDueDate && <> Próximo vencimento: <b>{brDate(b.nextDueDate)}</b>.</>}
          </p>
          {b.openInvoiceUrl ? (
            <a href={b.openInvoiceUrl} target='_blank' rel='noreferrer' className='inline-flex h-12 items-center gap-2 rounded-pill bg-gf-orange px-6 text-lg font-semibold text-white hover:bg-gf-orange-hover'>
              Abrir fatura<ExternalLink className='h-5 w-5' />
            </a>
          ) : done === 'subscribed' && <p className='text-sm text-gf-muted'>Gerando a fatura… Ela aparece aqui em instantes e também chega no e-mail de cobrança.</p>}
          <p className='text-sm text-gf-muted'>Pague por Pix, boleto ou cartão na página da fatura.</p>
        </div>
      </Dialog>
    );
  }
  return (
    <Dialog open onOpenChange={onClose} title={wasSubscribed ? 'Trocar plano' : 'Assinar o Garfeed'}
      description={wasSubscribed ? 'O novo valor vale para as próximas cobranças e para a fatura em aberto.' : b.trialEndsAt ? 'Você só paga depois do teste grátis: a primeira fatura vence no fim dele.' : 'Pague por Pix, boleto ou cartão.'}
      footer={<>
        <Button variant='outline' onClick={onClose} disabled={busy}>Fechar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={busy || same}>{wasSubscribed ? 'Salvar plano' : 'Assinar'}</Button>
      </>}>
      <div className='space-y-4'>
        <div role='group' aria-label='Ciclo de cobrança' className='grid grid-cols-2 gap-1 rounded-xl bg-gf-bg p-1'>
          {CYCLES.map((c) => (
            <button key={c} type='button' aria-pressed={cycle === c} onClick={() => setCycle(c)}
              className={cn('min-h-11 rounded-lg py-1 font-semibold leading-tight', cycle === c ? 'bg-white text-gf-navy shadow-sm' : 'text-gf-navy-80')}>
              {BILLING_CYCLE_LABEL[c]}{c === 'YEARLY' && <span className='block text-xs text-success'>pague 10, leve 12</span>}
            </button>
          ))}
        </div>
        <div role='group' aria-label='Plano' className='grid gap-3 sm:grid-cols-2'>
          {OWNER_PLANS.map((p) => (
            <button key={p} type='button' aria-pressed={plan === p} onClick={() => setPlan(p)}
              className={cn('min-h-11 rounded-card border-2 p-4 text-left', plan === p ? 'border-gf-orange bg-gf-orange-soft' : 'border-gf-border bg-white hover:bg-gf-bg')}>
              <span className='block font-heading text-xl font-black text-gf-navy'>{PLAN_LABEL[p]}</span>
              <span className='font-heading text-2xl font-black text-gf-navy'>{formatBRL(planValueCents(p, cycle) ?? 0)}</span>
              <span className='text-gf-navy-80'> {cycle === 'YEARLY' ? '/ano' : '/mês'}</span>
            </button>
          ))}
        </div>
        {!wasSubscribed && (
          <>
            <Field label='CPF ou CNPJ de cobrança'><Input value={cpfCnpj} onChange={(e) => setCpfCnpj(e.target.value)} inputMode='numeric' autoComplete='off' placeholder='00.000.000/0000-00' /></Field>
            <div className='grid gap-4 sm:grid-cols-2'>
              <Field label='E-mail de cobrança' hint='A fatura chega aqui.'><Input type='email' value={email} onChange={(e) => setEmail(e.target.value)} autoComplete='email' /></Field>
              <Field label='Telefone (opcional)'><Input type='tel' value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete='tel' placeholder='(11) 98888-7777' /></Field>
            </div>
          </>
        )}
        {error && <p role='alert' className='rounded-lg bg-red-50 p-3 text-sm font-medium text-danger'>{error}</p>}
        {wasSubscribed && (
          <button type='button' disabled={busy} onClick={() => setConfirm(true)} className='h-11 font-semibold text-danger hover:underline disabled:opacity-50'>Cancelar assinatura</button>
        )}
      </div>
      <Confirm open={confirm} onOpenChange={setConfirm} danger title='Cancelar a assinatura?' confirmLabel='Cancelar assinatura' loading={cancel.isPending} onConfirm={() => cancel.mutate()}
        description='As faturas em aberto são canceladas e nenhuma nova cobrança é gerada. Você pode assinar de novo quando quiser.' />
    </Dialog>
  );
}

/** Card 'Plano atual' (P11). Só o dono chega aqui; a API usa o restaurante do token. */
export function PlanCard({ plan }: { plan: Plan }) {
  const store = isStoreApp(); // no app da loja: só a situação, sem assinar/trocar/cancelar/pagar nem link de fatura
  const q = useQuery({
    queryKey: KEY, queryFn: () => call(api.billing.mine),
    // assinou e a fatura ainda não chegou pelo webhook do Asaas: consulta de novo por ~2 min
    refetchInterval: ({ state: { data: d, dataUpdateCount } }) => (d?.subscribed && d.billingStatus === 'PENDING' && !d.openInvoiceUrl && dataUpdateCount < 25 ? 5000 : false),
  });
  const [history, setHistory] = useState(false);
  const [manage, setManage] = useState(false);
  const [params, setParams] = useSearchParams();
  const b = q.data;
  // o "Assinar agora" do aviso de teste grátis chega com ?assinar=1
  useEffect(() => {
    if (!b || !params.has('assinar')) return;
    if (!store && !b.subscribed) setManage(true);
    setParams({}, { replace: true });
  }, [b, params, setParams, store]);

  const trialOver = !!b?.trialEndsAt && Date.parse(b.trialEndsAt) < Date.now();
  const status = b?.status === 'SUSPENDED' ? 'Suspenso' : b?.status === 'TRIAL' && !b.subscribed ? (trialOver ? 'Teste encerrado' : 'Período de teste') : b ? BILLING_STATUS_LABEL[b.billingStatus] : null;
  const current = b?.plan ?? plan;
  return (
    <Card className='p-5'>
      <div className='flex flex-wrap items-center gap-4'>
        <Crown className='h-7 w-7' />
        <div className='min-w-0 flex-1 basis-48'><h2 className='font-heading text-2xl font-black'>Plano atual</h2><p className='text-gf-navy-80'>{store ? 'Seu plano e a situação da conta.' : 'Seu plano e opções de assinatura.'}</p></div>
        <span className='rounded-pill bg-blue-50 px-4 py-1.5 text-lg font-bold text-info'>{PLAN_LABEL[current]}</span>
        {b && !store && (current === 'NETWORK'
          ? <a href='mailto:fuseagencia10@gmail.com?subject=Plano%20Rede' className='inline-flex h-11 items-center rounded-lg bg-gf-bg px-4 font-semibold hover:bg-gf-border'>Falar com a gente</a>
          : <Button variant={b.subscribed ? 'outline' : 'primary'} onClick={() => setManage(true)}>{b.subscribed ? 'Trocar plano' : 'Assinar agora'}</Button>)}
      </div>
      {q.isPending && <p className='mt-4 border-t border-gf-border pt-4 text-gf-muted' role='status'>Carregando a situação da conta…</p>}
      {q.isError && (
        <p role='alert' className='mt-4 flex flex-wrap items-center gap-3 border-t border-gf-border pt-4 font-medium text-danger'>
          Não foi possível carregar a situação da conta.
          <button type='button' className='h-11 rounded-lg px-3 font-semibold text-gf-navy hover:bg-gf-bg' onClick={() => void q.refetch()}>Tentar de novo</button>
        </p>
      )}
      {b && (
        <div className='mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-gf-border pt-4'>
          <span><span className='block text-sm text-gf-muted'>Situação</span><Badge tone={b.status === 'SUSPENDED' ? 'red' : trialOver && !b.subscribed ? 'yellow' : BILLING_TONE[b.billingStatus]}>{status}</Badge></span>
          {b.valueCents != null && b.cycle && <span><span className='block text-sm text-gf-muted'>Valor</span><b>{formatBRL(b.valueCents)}</b> · {BILLING_CYCLE_LABEL[b.cycle].toLowerCase()}</span>}
          {b.nextDueDate && <span><span className='block text-sm text-gf-muted'>Próximo vencimento</span><b>{brDate(b.nextDueDate)}</b></span>}
          {b.trialEndsAt && !b.subscribed && <span><span className='block text-sm text-gf-muted'>Teste grátis até</span><b>{brDate(b.trialEndsAt.slice(0, 10))}</b></span>}
          {!store && (
            <span className='flex flex-1 flex-wrap justify-end gap-3'>
              {b.payments.length > 0 && <button type='button' className='h-11 rounded-lg px-3 font-semibold text-gf-navy-80 hover:bg-gf-bg' onClick={() => setHistory(true)}>Histórico</button>}
              {b.openInvoiceUrl && (
                <a href={b.openInvoiceUrl} target='_blank' rel='noreferrer' className='inline-flex h-11 items-center gap-2 rounded-lg bg-gf-orange px-4 font-semibold text-white hover:bg-gf-orange-hover'>
                  {b.billingStatus === 'OVERDUE' ? 'Pagar fatura vencida' : 'Abrir fatura'}<ExternalLink className='h-4 w-4' />
                </a>
              )}
            </span>
          )}
        </div>
      )}
      {b?.status === 'SUSPENDED' && (
        <p role='alert' className='mt-3 text-sm font-medium text-danger'>
          Seu cardápio está em modo somente visualização.{!store && (b.openInvoiceUrl ? ' Pague a fatura em aberto para voltar a receber pedidos.' : ' Fale com o Garfeed para reativar.')}
        </p>
      )}
      {b && !store && <Dialog open={history} onOpenChange={setHistory} title='Histórico de pagamentos' className='max-w-xl'><PaymentsTable payments={b.payments} /></Dialog>}
      {b && !store && manage && <ManagePlan b={b} onClose={() => setManage(false)} />}
    </Card>
  );
}
