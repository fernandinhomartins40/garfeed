import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MailCheck, Plus, QrCode, Store, UtensilsCrossed } from 'lucide-react';
import { api, CreateRestaurantBody, Plan, RestStatus, type AdminRestaurant } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select } from '@/components/ui/input';
import { Card, Empty, ErrorBox, PageTitle, Spinner } from '@/components/ui/misc';

export const PLAN_LABEL = { ESSENTIAL: 'Essencial', PRO: 'Pro', NETWORK: 'Rede' } as const;
export const STATUS_LABEL = { TRIAL: 'Teste', ACTIVE: 'Ativo', SUSPENDED: 'Suspenso' } as const;
const n = new Intl.NumberFormat('pt-BR');

export function StatsCards() {
  const s = useQuery({ queryKey: ['admin', 'stats'], queryFn: () => call(api.admin.stats) });
  const cards = [
    ['Restaurantes ativos', s.data?.activeRestaurants, Store, 'bg-blue-50 text-info'],
    ['Placas ativas', s.data?.activeTags, QrCode, 'bg-green-50 text-success'],
    ['Pedidos hoje', s.data?.ordersToday, UtensilsCrossed, 'bg-blue-50 text-info'],
  ] as const;
  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-3">
      {cards.map(([label, v, Icon, tone]) => (
        <Card key={label} className="flex items-center gap-4 p-5">
          <span className={`grid h-16 w-16 place-items-center rounded-2xl ${tone}`}><Icon className="h-8 w-8" /></span>
          <div><p className="font-medium text-gf-navy-80">{label}</p><p className="font-heading text-4xl font-black">{v == null ? '—' : n.format(v)}</p></div>
        </Card>
      ))}
    </div>
  );
}

export function AdminRestaurantsPage() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['admin', 'restaurants'], queryFn: () => call(api.admin.listRestaurants) });
  const [create, setCreate] = useState(false);
  const upd = useMutation({
    mutationFn: ({ id, ...b }: { id: string; plan?: Plan; status?: RestStatus }) => call(api.admin.updateRestaurant, { params: { id }, body: b }),
    onSuccess: () => { toast.success('Restaurante atualizado'); void qc.invalidateQueries({ queryKey: ['admin'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const testMail = useMutation({
    mutationFn: () => call(api.admin.testEmail),
    onSuccess: () => toast.success('E-mail de teste enviado para o seu endereço'),
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={<>
        <Button size="lg" variant="outline" loading={testMail.isPending} onClick={() => testMail.mutate()}><MailCheck className="h-5 w-5" />E-mail de teste</Button>
        <Button size="lg" onClick={() => setCreate(true)}><Plus className="h-5 w-5" />Novo restaurante</Button>
      </>}>Restaurantes</PageTitle>
      <StatsCards />
      {list.isLoading ? <Spinner /> : list.error ? <ErrorBox error={list.error} /> : !list.data?.length ? (
        <Card><Empty icon={<Store className="h-12 w-12 text-gf-orange" />} title="Nenhum restaurante" /></Card>
      ) : (
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left">
            <thead><tr className="border-b border-gf-border text-gf-navy-80">
              {['Restaurante', 'Plano', 'Status', 'Mesas', 'Placas ativas', 'Pedidos hoje', 'Criado em'].map((h, i) => <th key={h} className={`py-4 font-semibold ${i === 0 ? 'px-6' : ''}`}>{h}</th>)}
            </tr></thead>
            <tbody>
              {list.data.map((r: AdminRestaurant) => (
                <tr key={r.id} className="border-b border-gf-border last:border-0">
                  <td className="px-6 py-4"><b className="font-heading text-lg">{r.name}</b><span className="block text-sm text-gf-muted">{r.slug}</span></td>
                  <td><Select aria-label="Plano" className="w-36" value={r.plan} onChange={(e) => upd.mutate({ id: r.id, plan: e.target.value as Plan })}>
                    {Plan.options.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}</Select></td>
                  <td><Select aria-label="Status" className="w-36" value={r.status} onChange={(e) => upd.mutate({ id: r.id, status: e.target.value as RestStatus })}>
                    {RestStatus.options.map((p) => <option key={p} value={p}>{STATUS_LABEL[p]}</option>)}</Select></td>
                  <td>{r.tableCount}</td><td>{r.activeTagCount}</td><td>{r.ordersToday}</td>
                  <td>{new Date(r.createdAt).toLocaleDateString('pt-BR')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
      {create && <CreateDialog onClose={() => setCreate(false)} />}
    </div>
  );
}

function CreateDialog({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { register, handleSubmit, setValue, formState: { errors } } = useForm({
    resolver: zodResolver(CreateRestaurantBody), defaultValues: { name: '', slug: '', plan: 'ESSENTIAL' as const, status: 'TRIAL' as const, owner: { name: '', email: '' } },
  });
  const m = useMutation({
    mutationFn: (b: CreateRestaurantBody) => call(api.admin.createRestaurant, { body: b }),
    onSuccess: (r) => { toast.success(`${r.name} criado`); void qc.invalidateQueries({ queryKey: ['admin'] }); onClose(); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const slugify = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
  return (
    <Dialog open onOpenChange={onClose} title="Novo restaurante" className="max-w-xl">
      <form onSubmit={handleSubmit((b) => m.mutate(b))} className="space-y-4">
        <Field label="Nome" error={errors.name?.message}><Input {...register('name', { onChange: (e: React.ChangeEvent<HTMLInputElement>) => setValue('slug', slugify(e.target.value)) })} /></Field>
        <Field label="Endereço (slug)" error={errors.slug?.message}><Input {...register('slug')} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Plano"><Select {...register('plan')}>{Plan.options.map((p) => <option key={p} value={p}>{PLAN_LABEL[p]}</option>)}</Select></Field>
          <Field label="Status"><Select {...register('status')}>{RestStatus.options.map((p) => <option key={p} value={p}>{STATUS_LABEL[p]}</option>)}</Select></Field>
        </div>
        <p className="border-t border-gf-border pt-4 font-heading text-lg font-black">Dono (primeiro acesso)</p>
        <Field label="Nome" error={errors.owner?.name?.message}><Input {...register('owner.name')} /></Field>
        <Field label="E-mail" error={errors.owner?.email?.message}><Input type="email" {...register('owner.email')} /></Field>
        <p className="rounded-lg bg-gf-bg p-3 text-sm text-gf-navy-80">O dono recebe um e-mail de boas-vindas com um link (válido por 7 dias) para definir a própria senha.</p>
        <div className="flex justify-end gap-3 pt-2"><Button variant="outline" onClick={onClose}>Cancelar</Button><Button type="submit" loading={m.isPending}>Criar restaurante</Button></div>
      </form>
    </Dialog>
  );
}
