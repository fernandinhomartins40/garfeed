import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Layers } from 'lucide-react';
import {
  api, BILLING_CYCLE_LABEL, BILLING_STATUS_LABEL, BillingCycle, formatBRL, Plan, PLAN_LABEL, PLAN_PRICE_CENTS, planValueCents, TRIAL_DAYS,
  type AdminBilling, type AdminBillingDetail,
} from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Confirm, Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Badge, Card, Empty, ErrorBox, PageTitle, Spinner } from '@/components/ui/misc';
import { BILLING_TONE, brDate, PaymentsTable } from '@/components/Billing';
import { STATUS_LABEL } from './Restaurants';

export function AdminPlansPage() {
  const list = useQuery({ queryKey: ['admin', 'billing'], queryFn: () => call(api.billing.adminList) });
  const [open, setOpen] = useState<AdminBilling | null>(null);
  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle>Planos</PageTitle>
      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        {Plan.options.map((p) => (
          <Card key={p} className="p-5">
            <p className="font-medium text-gf-navy-80">{PLAN_LABEL[p]}</p>
            <p className="font-heading text-2xl font-black lg:text-3xl">{PLAN_PRICE_CENTS[p] == null ? 'Sob consulta' : <>{formatBRL(PLAN_PRICE_CENTS[p])}<span className="text-base font-semibold text-gf-muted"> /mês</span></>}</p>
            <p className="text-sm text-gf-muted">{PLAN_PRICE_CENTS[p] == null ? 'Valor definido por restaurante' : `Anual: ${formatBRL(planValueCents(p, 'YEARLY')!)} (pague 10, leve 12)`}</p>
          </Card>
        ))}
      </div>
      {list.data && !list.data.enabled && (
        <div role="status" className="mb-6 rounded-card border border-amber-200 bg-amber-50 p-4 text-amber-800">
          <b>Cobrança desligada.</b> Configure <code>ASAAS_API_KEY</code> no servidor para ativar assinaturas (docs/COBRANCA.md).
        </div>
      )}
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} retry={() => void list.refetch()} /> : !list.data?.restaurants.length ? (
        <Card><Empty icon={<Layers className="h-12 w-12 text-gf-orange" />} title="Nenhum restaurante" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              {['Restaurante', 'Plano', 'Status', 'Cobrança', 'Valor', 'Próximo vencimento', ''].map((h, i) => <th key={h} className={`py-4 font-semibold ${i === 0 ? 'px-6' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {list.data.restaurants.map((r) => (
                <tr key={r.restaurantId} className="border-b border-gf-border last:border-0">
                  <td className="px-6 py-4"><b className="font-heading text-lg">{r.name}</b><span className="block text-sm text-gf-muted">{r.slug}</span></td>
                  <td>{PLAN_LABEL[r.plan]}</td>
                  <td>{STATUS_LABEL[r.status]}{r.trialExpired && <Badge tone="red" className="ml-2">teste &gt; {TRIAL_DAYS} dias</Badge>}</td>
                  <td><Badge tone={BILLING_TONE[r.billing?.status ?? 'NONE']}>{BILLING_STATUS_LABEL[r.billing?.status ?? 'NONE']}</Badge></td>
                  <td>{r.billing?.subscribed && r.billing.valueCents != null ? `${formatBRL(r.billing.valueCents)} · ${BILLING_CYCLE_LABEL[r.billing.cycle]}` : '—'}</td>
                  <td>{brDate(r.billing?.nextDueDate ?? null)}</td>
                  <td className="pr-6 text-right"><Button variant="outline" onClick={() => setOpen(r)}>Gerenciar</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {open && <BillingDialog row={open} enabled={!!list.data?.enabled} onClose={() => setOpen(null)} />}
    </div>
  );
}

function BillingDialog({ row, enabled, onClose }: { row: AdminBilling; enabled: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const id = row.restaurantId;
  const q = useQuery({ queryKey: ['admin', 'billing', id], queryFn: () => call(api.billing.adminGet, { params: { id } }), initialData: { ...row, payments: [] }, staleTime: 0 });
  const d = q.data;
  const b = d.billing;
  const [customer, setCustomer] = useState({ cpfCnpj: b?.cpfCnpj ?? '', email: b?.email ?? '', phone: b?.phone ?? '' });
  const [plan, setPlan] = useState<Plan>(d.plan);
  const [cycle, setCycle] = useState<BillingCycle>(b?.cycle ?? 'MONTHLY');
  const tablePrice = planValueCents(plan, cycle);
  // valor em reais; vazio = preço da tabela
  const [value, setValue] = useState(b?.subscribed && b.valueCents != null && b.valueCents !== planValueCents(d.plan, b.cycle) ? String(b.valueCents / 100) : '');
  const [firstDue, setFirstDue] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);

  const done = (msg: string) => (r: AdminBillingDetail) => { toast.success(msg); qc.setQueryData(['admin', 'billing', id], r); void qc.invalidateQueries({ queryKey: ['admin'] }); };
  const onError = (e: unknown) => toast.error(errMsg(e));
  const saveCustomer = useMutation({
    mutationFn: () => call(api.billing.setCustomer, { params: { id }, body: { cpfCnpj: customer.cpfCnpj, email: customer.email.trim() || null, phone: customer.phone.trim() || null } }),
    onSuccess: done('Dados de cobrança salvos'), onError,
  });
  const sub = () => ({ plan, cycle, valueCents: value.trim() ? Math.round(Number(value.replace(',', '.')) * 100) : undefined });
  const activate = useMutation({
    mutationFn: () => call(api.billing.activate, { params: { id }, body: { ...sub(), nextDueDate: firstDue || undefined } }),
    onSuccess: done('Assinatura ativada'), onError,
  });
  const change = useMutation({ mutationFn: () => call(api.billing.change, { params: { id }, body: sub() }), onSuccess: done('Assinatura atualizada'), onError });
  const cancel = useMutation({
    mutationFn: () => call(api.billing.cancel, { params: { id } }),
    onSuccess: (r) => { setConfirmCancel(false); done('Assinatura cancelada')(r); }, onError,
  });
  const valueOk = value.trim() ? Number(value.replace(',', '.')) >= 5 : tablePrice != null;

  return (
    <Dialog open onOpenChange={onClose} title={d.name} description={<>{PLAN_LABEL[d.plan]} · {STATUS_LABEL[d.status]} · cobrança: {BILLING_STATUS_LABEL[b?.status ?? 'NONE']}</>} className="max-w-2xl">
      <div className="space-y-6">
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); saveCustomer.mutate(); }}>
          <h3 className="font-heading text-lg font-black">Dados de cobrança</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="CPF ou CNPJ"><Input required inputMode="numeric" value={customer.cpfCnpj} onChange={(e) => setCustomer({ ...customer, cpfCnpj: e.target.value })} /></Field>
            <Field label="E-mail de cobrança"><Input type="email" value={customer.email} onChange={(e) => setCustomer({ ...customer, email: e.target.value })} /></Field>
            <Field label="Telefone (com DDD)"><Input type="tel" value={customer.phone} onChange={(e) => setCustomer({ ...customer, phone: e.target.value })} /></Field>
          </div>
          <div className="flex justify-end"><Button type="submit" variant="outline" loading={saveCustomer.isPending}>Salvar dados</Button></div>
        </form>

        <form className="space-y-3 border-t border-gf-border pt-5" onSubmit={(e) => { e.preventDefault(); (b?.subscribed ? change : activate).mutate(); }}>
          <h3 className="font-heading text-lg font-black">Assinatura</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Plano"><Select value={plan} onChange={(e) => setPlan(e.target.value as Plan)}>{Plan.options.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}</Select></Field>
            <Field label="Ciclo"><Select value={cycle} onChange={(e) => setCycle(e.target.value as BillingCycle)}>{BillingCycle.options.map((c) => <option key={c} value={c}>{BILLING_CYCLE_LABEL[c]}</option>)}</Select></Field>
            <Field label={`Valor por cobrança (R$)`} hint={tablePrice != null ? `Vazio = tabela: ${formatBRL(tablePrice)}` : 'Obrigatório no plano Rede'}>
              <Input inputMode="decimal" placeholder={tablePrice != null ? String(tablePrice / 100) : ''} value={value} onChange={(e) => setValue(e.target.value)} />
            </Field>
          </div>
          {!b?.subscribed && <Field label="Primeiro vencimento" hint="Vazio = daqui a 3 dias" className="sm:w-1/3"><Input type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} /></Field>}
          <p className="text-sm text-gf-muted">O pagador escolhe Pix, boleto ou cartão na fatura do Asaas. Pagamento confirmado ativa o restaurante.</p>
          <div className="flex flex-wrap justify-end gap-3">
            {b?.subscribed && <Button variant="outline" className="text-danger" onClick={() => setConfirmCancel(true)}>Cancelar assinatura</Button>}
            <Button type="submit" disabled={!enabled || !b || !valueOk} loading={activate.isPending || change.isPending}>{b?.subscribed ? 'Atualizar assinatura' : 'Ativar assinatura'}</Button>
          </div>
          {!b && <p className="text-right text-sm text-gf-muted">Salve o CPF/CNPJ antes de ativar.</p>}
        </form>

        <div className="border-t border-gf-border pt-5">
          <h3 className="mb-2 font-heading text-lg font-black">Histórico de pagamentos</h3>
          {q.isFetching && !d.payments.length ? <Spinner /> : <PaymentsTable payments={d.payments} />}
        </div>
      </div>
      <Confirm open={confirmCancel} onOpenChange={setConfirmCancel} danger title="Cancelar assinatura?" confirmLabel="Cancelar assinatura" loading={cancel.isPending} onConfirm={() => cancel.mutate()}
        description="A assinatura e as cobranças em aberto são removidas no Asaas. O restaurante continua com o status atual: suspenda em Restaurantes, se for o caso." />
    </Dialog>
  );
}
