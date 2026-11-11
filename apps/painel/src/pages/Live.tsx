import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle, Bell, Beer, Check, ChefHat, CircleCheck, Coffee, ArrowRight, MessageSquareText, ReceiptText, Truck, X, Inbox, Armchair,
} from 'lucide-react';
import { api, formatBRL, type OrderStatus, type PanelCall, type PanelOrder, type Sector } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth, useLive, usePrefs } from '@/lib/auth';
import { can, qk, useActiveOrders, useNow, useOpenCalls } from '@/lib/live';
import { enableNotifications, notifSupported } from '@/lib/alerts';
import { isNative, nativePushPermission } from '@/lib/native';
import { ago, cn, minutesSince } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Card, Empty, ErrorBox, Thumb } from '@/components/ui/misc';
import { Input } from '@/components/ui/input';

const LATE_MIN = 5;
const num = (n: number) => String(n).padStart(3, '0');

export function LivePage() {
  const user = useAuth((s) => s.user)!;
  const restaurant = useAuth((s) => s.restaurant);
  const connected = useLive((s) => s.connected);
  const orders = useActiveOrders();
  const calls = useOpenCalls();
  const now = useNow(1000);
  const [sector, setSector] = useState<Sector | null>(null);
  const [rejecting, setRejecting] = useState<PanelOrder | null>(null);

  const visible = (orders.data ?? [])
    .filter((o) => !sector || o.items.some((i) => i.sector === sector))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const cols = {
    novos: visible.filter((o) => o.status === 'PENDING'),
    preparo: visible.filter((o) => o.status === 'CONFIRMED' || o.status === 'PREPARING'),
    prontos: visible.filter((o) => o.status === 'READY'),
  };
  const openCalls = calls.data ?? [];
  const empty = !orders.isLoading && !visible.length && !openCalls.length;

  return (
    <div className="px-4 pb-8 pt-4 md:px-8">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="font-heading text-4xl font-black md:text-5xl">Ao vivo</h1>
        <span className={cn('inline-flex items-center gap-2 rounded-pill px-3 py-1.5 font-semibold', connected ? 'bg-green-50 text-success' : 'bg-amber-50 text-amber-700')}>
          <span className={cn('h-2.5 w-2.5 rounded-full', connected ? 'bg-success' : 'bg-warning')} />{connected ? 'Conectado' : 'Reconectando…'}
        </span>
        <div className="flex flex-wrap gap-2 xl:ml-2">
          <Counter icon={Inbox} tone="bg-blue-50 text-info" label={`${cols.novos.length} ${cols.novos.length === 1 ? 'novo' : 'novos'}`} />
          <Counter icon={ChefHat} tone="bg-amber-50 text-amber-600" label={`${cols.preparo.length} em preparo`} />
          <Counter icon={CircleCheck} tone="bg-green-50 text-success" label={`${cols.prontos.length} ${cols.prontos.length === 1 ? 'pronto' : 'prontos'}`} />
        </div>
        {user.role !== 'KITCHEN' && (
          <div role="group" aria-label="Filtrar por setor" className="ml-auto flex rounded-xl border border-gf-border bg-white p-1 shadow-card">
            {([[null, 'Todos', null], ['KITCHEN', 'Cozinha', ChefHat], ['BAR', 'Bar', Beer]] as const).map(([v, l, Icon]) => (
              <button key={l} onClick={() => setSector(v)} aria-pressed={sector === v}
                className={cn('flex h-10 items-center gap-2 rounded-lg px-4 font-medium', sector === v ? 'bg-gf-orange text-white' : 'text-gf-navy hover:bg-gf-bg')}>
                {Icon && <Icon className="h-5 w-5" />}{l}
              </button>
            ))}
          </div>
        )}
      </div>
      <p className="mt-1 text-lg text-gf-navy-80">{restaurant?.name}{user.role === 'KITCHEN' && user.sector && ` · ${user.sector === 'BAR' ? 'Bar' : 'Cozinha'}`}</p>

      <NotificationAsk />

      {can(user.role, 'OPERATE') && openCalls.length > 0 && (
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {openCalls.map((c) => <CallCard key={c.id} c={c} now={now} />)}
        </div>
      )}

      {orders.error ? <div className="mt-6"><ErrorBox error={orders.error} retry={() => void orders.refetch()} /></div>
        : empty ? (
          <Card className="mt-6"><Empty icon={<Coffee className="h-12 w-12 text-gf-orange" />} title="Tudo tranquilo por aqui ☕" text="Os pedidos aparecem aqui com som" /></Card>
        ) : (
          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Column icon={Inbox} title="Novos" count={cols.novos.length} tone="text-info">
              {cols.novos.map((o) => <OrderCard key={o.id} o={o} now={now} sector={sector} onReject={() => setRejecting(o)} />)}
            </Column>
            <Column icon={ChefHat} title="Em preparo" count={cols.preparo.length} tone="text-gf-orange">
              {cols.preparo.map((o) => <OrderCard key={o.id} o={o} now={now} sector={sector} />)}
            </Column>
            <Column icon={CircleCheck} title="Prontos" count={cols.prontos.length} tone="text-success">
              {cols.prontos.map((o) => <OrderCard key={o.id} o={o} now={now} sector={sector} />)}
            </Column>
          </div>
        )}
      <RejectDialog order={rejecting} onClose={() => setRejecting(null)} />
    </div>
  );
}

function Counter({ icon: Icon, tone, label }: { icon: typeof Inbox; tone: string; label: string }) {
  return <span className={cn('inline-flex h-11 items-center gap-2 rounded-xl px-4 text-lg font-semibold', tone)}><Icon className="h-5 w-5" />{label}</span>;
}

function Column({ icon: Icon, title, count, tone, children }: { icon: typeof Inbox; title: string; count: number; tone: string; children: React.ReactNode }) {
  return (
    <section className="flex min-h-40 flex-col rounded-card border border-gf-border bg-white/70 shadow-card lg:max-h-[calc(100vh-15rem)]">
      <h2 className="flex items-center gap-3 border-b border-gf-border px-4 py-3 font-heading text-2xl font-black uppercase">
        <Icon className={cn('h-7 w-7', tone)} />{title} <span className="font-sans text-xl font-semibold text-gf-muted">({count})</span>
      </h2>
      <div className="flex-1 space-y-3 overflow-y-auto p-3">{children}</div>
    </section>
  );
}

function useSetStatus(o: PanelOrder) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: { status: Exclude<OrderStatus, 'PENDING'>; reason?: string }) => call(api.orders.updateStatus, { params: { id: o.id }, body: b }),
    onSuccess: (u) => {
      qc.setQueryData<PanelOrder[]>(qk.orders, (l = []) => l.flatMap((x) => (x.id !== u.id ? [x] : ['DELIVERED', 'REJECTED', 'CANCELED'].includes(u.status) ? [] : [u])));
      void qc.invalidateQueries({ queryKey: qk.tables });
    },
    onError: (e) => toast.error(errMsg(e)),
  });
}

function OrderCard({ o, now, sector, onReject }: { o: PanelOrder; now: number; sector: Sector | null; onReject?: () => void }) {
  const m = useSetStatus(o);
  const late = o.status === 'PENDING' && minutesSince(o.createdAt, now) >= LATE_MIN;
  const items = sector ? o.items.filter((i) => i.sector === sector) : o.items;
  const notes = items.filter((i) => i.note);
  return (
    <article className={cn('rounded-card border bg-white p-3 shadow-card xl:p-4', late ? 'border-2 border-danger bg-red-50/40' : o.status === 'PENDING' ? 'border-gf-orange/60' : 'border-gf-border')}>
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <Armchair className="h-7 w-7 shrink-0 text-gf-navy" />
          <h3 className="font-heading text-3xl font-black leading-none">{o.table.name}</h3>
          {late && <span className="inline-flex items-center gap-1 rounded-pill bg-red-100 px-2.5 py-1 text-sm font-semibold text-danger"><AlertCircle className="h-4 w-4" />Atrasado · {ago(o.createdAt, now)}</span>}
        </div>
        <p className="mt-1 flex justify-between gap-2 text-gf-navy-80">
          <span className="truncate">Pedido nº{num(o.number)}{o.customerName && ` · ${o.customerName}`}</span>
          {!late && <span className="whitespace-nowrap font-semibold text-gf-orange">{o.status === 'PREPARING' ? 'Em preparo · ' : ''}{ago(o.createdAt, now)}</span>}
        </p>
      </header>
      <ul className="mt-3 divide-y divide-gf-border">
        {items.map((i) => (
          <li key={i.id} className="flex items-start gap-3 py-2">
            <Thumb src={i.thumbUrl} />
            <div className="min-w-0 flex-1">
              <p className="font-heading text-lg font-extrabold leading-tight">{i.quantity}× {i.name}</p>
              {i.options.length > 0 && <p className="text-sm text-gf-muted">{i.options.map((x) => x.option).join(', ')}</p>}
            </div>
            <span className="whitespace-nowrap font-heading text-lg font-extrabold">{formatBRL(i.unitPriceCents * i.quantity)}</span>
          </li>
        ))}
      </ul>
      {notes.length > 0 && (
        <div className="mt-1 flex flex-wrap items-center gap-2 border-t border-gf-border pt-2 text-sm">
          <MessageSquareText className="h-4 w-4 text-gf-navy-80" /> Observação:
          {notes.map((i) => <mark key={i.id} className="rounded-pill bg-amber-100 px-2.5 py-0.5 font-semibold text-amber-700">{notes.length > 1 ? `${i.name}: ` : ''}{i.note}</mark>)}
        </div>
      )}
      <div className="mt-2 flex items-center justify-between border-t border-gf-border pt-2">
        <span className="font-heading text-xl font-black">Total</span>
        <span className="font-heading text-2xl font-black text-gf-orange">{formatBRL(o.totalCents)}</span>
      </div>
      <div className="mt-3 flex gap-3">
        {o.status === 'PENDING' && <>
          <Button className="h-12 min-w-0 flex-1 rounded-xl px-3 text-lg" loading={m.isPending} onClick={() => m.mutate({ status: 'CONFIRMED' })}><Check className="h-5 w-5" />Aceitar</Button>
          <Button variant="outline" className="h-12 min-w-0 flex-1 rounded-xl border-0 bg-gf-bg px-3 text-lg" disabled={m.isPending} onClick={onReject}><X className="h-5 w-5" />Recusar</Button>
        </>}
        {o.status === 'CONFIRMED' &&
          <Button variant="outline" className="h-12 min-w-0 flex-1 rounded-xl px-3 text-lg" disabled={m.isPending} onClick={() => m.mutate({ status: 'PREPARING' })}><ChefHat className="h-5 w-5" />Iniciar preparo</Button>}
        {(o.status === 'CONFIRMED' || o.status === 'PREPARING') &&
          <Button variant="info" className="h-12 min-w-0 flex-1 rounded-xl px-3 text-lg" loading={m.isPending} onClick={() => m.mutate({ status: 'READY' })}><Check className="h-5 w-5" />Pronto</Button>}
        {o.status === 'READY' &&
          <Button variant="success" className="h-12 flex-1 rounded-xl text-lg" loading={m.isPending} onClick={() => m.mutate({ status: 'DELIVERED' })}><Truck className="h-5 w-5" />Entregue</Button>}
      </div>
    </article>
  );
}

const REASONS = ['Item esgotado', 'Cozinha fechada', 'Pedido duplicado', 'Mesa não confirmou'];
function RejectDialog({ order, onClose }: { order: PanelOrder | null; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const m = useSetStatus(order ?? ({ id: '' } as PanelOrder));
  return (
    <Dialog open={!!order} onOpenChange={(o) => { if (!o) { onClose(); setReason(''); } }} title="Recusar pedido"
      description={order && `${order.table.name} · Pedido nº${num(order.number)}. O cliente verá o motivo.`}>
      <div className="flex flex-wrap gap-2">
        {REASONS.map((r) => (
          <button key={r} onClick={() => setReason(r)} className={cn('rounded-pill border px-3 py-1.5 text-sm font-medium', reason === r ? 'border-gf-orange bg-gf-orange-soft text-gf-orange' : 'border-gf-border')}>{r}</button>
        ))}
      </div>
      <Input className="mt-3" maxLength={140} placeholder="Motivo da recusa" value={reason} onChange={(e) => setReason(e.target.value)} aria-label="Motivo da recusa" />
      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onClose}>Cancelar</Button>
        <Button variant="danger" disabled={!reason.trim()} loading={m.isPending}
          onClick={() => m.mutate({ status: 'REJECTED', reason: reason.trim() }, { onSuccess: () => { onClose(); setReason(''); } })}>Recusar pedido</Button>
      </div>
    </Dialog>
  );
}

function CallCard({ c, now }: { c: PanelCall; now: number }) {
  const qc = useQueryClient();
  const nav = useNavigate();
  const bill = c.type === 'BILL';
  const m = useMutation({
    mutationFn: () => call(api.calls.done, { params: { id: c.id } }),
    onSuccess: () => { qc.setQueryData<PanelCall[]>(qk.calls, (l = []) => l.filter((x) => x.id !== c.id)); if (bill) nav(`/mesas?mesa=${c.table.id}`); },
    onError: (e) => toast.error(errMsg(e)),
  });
  return (
    <div className={cn('flex items-center gap-3 rounded-card border px-4 py-3', bill ? 'animate-ring border-red-200 bg-red-50' : 'animate-ring-green border-green-200 bg-green-50')}>
      {bill ? <ReceiptText className="h-7 w-7 shrink-0 text-danger" /> : <Bell className="h-7 w-7 shrink-0 text-success" />}
      <p className="flex-1 text-lg">
        <b className={cn('font-heading font-black', bill && 'text-danger')}>{c.table.name}</b>
        <span className={bill ? 'text-danger' : ''}> · {bill ? 'Pediu a conta' : 'Chamou o garçom'} · {ago(c.createdAt, now)}</span>
      </p>
      {bill
        ? <Button loading={m.isPending} onClick={() => m.mutate()} className="rounded-xl">Finalizar conta <ArrowRight className="h-4 w-4" /></Button>
        : <Button variant="success" loading={m.isPending} onClick={() => m.mutate()} className="rounded-xl"><Check className="h-5 w-5" />Atendido</Button>}
    </div>
  );
}

/** P13 — pedido de permissão de notificações (não obrigatório). */
function NotificationAsk() {
  const { notifDismissed, set } = usePrefs();
  const [perm, setPerm] = useState(() => (notifSupported() ? Notification.permission : 'denied'));
  // App iOS: não existe Notification no WKWebView; a permissão vem do plugin nativo.
  useEffect(() => { if (isNative()) void nativePushPermission().then(setPerm).catch(() => undefined); }, []);
  if (perm !== 'default' || notifDismissed) return null;
  return (
    <Card className="mt-4 flex flex-wrap items-center gap-4 p-4">
      <span className="grid h-14 w-14 place-items-center rounded-xl bg-blue-50 text-info"><Bell className="h-7 w-7" /></span>
      <div className="min-w-60 flex-1">
        <p className="font-heading text-xl font-black">Receba alertas de novos pedidos</p>
        <p className="text-gf-navy-80">Permita as notificações para ser avisado na hora em que chegar um pedido.</p>
      </div>
      <Button variant="outline" onClick={() => set({ notifDismissed: true })}>Agora não</Button>
      <Button onClick={async () => setPerm(await enableNotifications())}>Ativar notificações</Button>
    </Card>
  );
}
