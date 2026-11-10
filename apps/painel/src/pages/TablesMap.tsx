import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Armchair, Clock, CreditCard, QrCode, Radio, ReceiptText, Settings2, Timer } from 'lucide-react';
import { api, formatBRL, type Table, type TableStatus } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { ACTIVE_STATUSES, can, qk, useNow } from '@/lib/live';
import { printEmergencyQrs } from '@/lib/qr';
import { ago, cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Confirm, Sheet } from '@/components/ui/dialog';
import { Card, Empty, ErrorBox, PageTitle, Spinner, Thumb } from '@/components/ui/misc';

export const STATUS: Record<TableStatus, { label: string; hint: string; dot: string; chip: string; icon: string }> = {
  FREE: { label: 'Livre', hint: 'Mesa disponível', dot: 'bg-success', chip: 'bg-success text-white', icon: 'bg-green-50 text-success' },
  OCCUPIED: { label: 'Ocupada', hint: 'Com clientes', dot: 'bg-gf-orange', chip: 'bg-gf-orange text-white', icon: 'bg-gf-orange-soft text-gf-orange' },
  PENDING_ORDER: { label: 'Pedido pendente', hint: 'Aguardando preparo', dot: 'bg-warning', chip: 'bg-warning text-white', icon: 'bg-amber-50 text-warning' },
  BILL: { label: 'Pediu conta', hint: 'Solicitou a conta', dot: 'bg-info', chip: 'bg-info text-white', icon: 'bg-blue-50 text-info' },
  CALLING: { label: 'Chamando', hint: 'Solicita atendimento', dot: 'bg-danger', chip: 'bg-danger text-white', icon: 'bg-red-50 text-danger' },
};

export const groupByArea = <T extends { area: string | null }>(l: T[]) =>
  Object.entries(l.reduce<Record<string, T[]>>((acc, t) => ((acc[t.area || 'Sem área'] ??= []).push(t), acc), {}));

export function TablesMapPage() {
  const role = useAuth((s) => s.user?.role);
  const tables = useQuery({ queryKey: qk.tables, queryFn: () => call(api.tables.list) });
  const [params, setParams] = useSearchParams();
  const now = useNow(30_000);
  const selected = tables.data?.find((t) => t.id === params.get('mesa')) ?? null;
  const select = (t: Table | null) => setParams(t ? { mesa: t.id } : {}, { replace: true });

  return (
    <div className="px-4 py-6 md:px-8">
      <PageTitle actions={can(role, 'MANAGE') && <Link to="/mesas/gerenciar"><Button variant="outline"><Settings2 className="h-5 w-5" />Gerenciar mesas</Button></Link>}>
        Mapa de mesas
      </PageTitle>
      <Card className="mb-6 flex flex-wrap gap-x-6 gap-y-3 px-5 py-3">
        {Object.values(STATUS).map((s) => (
          <div key={s.label} className="flex items-start gap-2"><span className={cn('mt-1.5 h-3 w-3 rounded-full', s.dot)} />
            <div><p className="text-sm font-semibold">{s.label}</p><p className="text-xs text-gf-muted">{s.hint}</p></div></div>
        ))}
      </Card>
      {tables.isLoading ? <Spinner /> : tables.error ? <ErrorBox error={tables.error} retry={() => void tables.refetch()} /> : !tables.data?.length ? (
        <Card><Empty icon={<Armchair className="h-12 w-12 text-gf-orange" />} title="Nenhuma mesa cadastrada" text="Crie as mesas do salão para vincular as placas.">
          {can(role, 'MANAGE') && <Link to="/mesas/gerenciar"><Button>Criar mesas</Button></Link>}
        </Empty></Card>
      ) : groupByArea(tables.data.filter((t) => t.active)).map(([area, list]) => (
        <section key={area} className="mb-6 rounded-card bg-white/60 p-4">
          <h2 className="mb-3 flex items-center gap-2 font-heading text-2xl font-black"><Armchair className="h-6 w-6" />{area}</h2>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(14rem,1fr))] gap-3">
            {list.map((t) => <TableCard key={t.id} t={t} now={now} active={t.id === selected?.id} onClick={() => select(t)} />)}
          </div>
        </section>
      ))}
      <TableDrawer table={selected} onClose={() => select(null)} />
    </div>
  );
}

function TableCard({ t, now, active, onClick }: { t: Table; now: number; active: boolean; onClick: () => void }) {
  const s = STATUS[t.status];
  return (
    <button onClick={onClick} aria-pressed={active}
      className={cn('rounded-card border p-4 text-left shadow-card transition hover:-translate-y-0.5', active ? 'border-gf-navy bg-gf-navy text-white' : 'border-gf-border bg-white',
        t.status === 'CALLING' && !active && 'animate-ring border-red-200')}>
      <div className="flex items-start gap-3">
        <span className={cn('grid h-12 w-12 place-items-center rounded-xl', active ? 'bg-white/10' : s.icon)}>
          {t.status === 'BILL' ? <ReceiptText className="h-6 w-6" /> : <Armchair className="h-6 w-6" />}
        </span>
        <div>
          <p className="font-heading text-xl font-black">{t.name}</p>
          <span className={cn('mt-1 inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-sm font-semibold', s.chip)}>
            {t.status === 'CALLING' && <Radio className="h-3.5 w-3.5" />}{t.status === 'PENDING_ORDER' && <Timer className="h-3.5 w-3.5" />}{s.label}
          </span>
        </div>
      </div>
      {t.session ? (
        <div className="mt-3 flex items-end justify-between gap-2">
          <span className="flex items-center gap-1 text-sm"><Clock className="h-4 w-4" />{ago(t.session.openedAt, now)}</span>
          <span className="text-right"><span className={cn('block text-xs', active ? 'text-white/80' : 'text-gf-muted')}>Total parcial</span>
            <b className="font-heading text-lg font-black">{formatBRL(t.session.totalCents)}</b></span>
        </div>
      ) : <p className="mt-3 text-gf-muted">—</p>}
    </button>
  );
}

function TableDrawer({ table, onClose }: { table: Table | null; onClose: () => void }) {
  const qc = useQueryClient();
  const now = useNow(30_000);
  const [confirm, setConfirm] = useState(false);
  const sid = table?.session?.id;
  const orders = useQuery({ queryKey: ['orders', 'session', sid], enabled: !!sid, queryFn: () => call(api.orders.list, { query: { sessionId: sid } }) });
  const close = useMutation({
    mutationFn: () => call(api.sessions.close, { params: { id: sid! } }),
    onSuccess: () => { toast.success(`${table?.name} fechada`); setConfirm(false); void qc.invalidateQueries({ queryKey: qk.tables }); void qc.invalidateQueries({ queryKey: ['orders'] }); },
    onError: (e) => toast.error(errMsg(e)),
  });
  const valid = (orders.data ?? []).filter((o) => o.status !== 'REJECTED' && o.status !== 'CANCELED');
  const items = valid.flatMap((o) => o.items);
  const inProgress = valid.filter((o) => (ACTIVE_STATUSES as readonly string[]).includes(o.status)).length;

  return (
    <Sheet open={!!table} onOpenChange={(o) => !o && onClose()} title={table?.name ?? 'Mesa'}>
      {table && (
        <div className="p-6">
          <h2 className="font-heading text-4xl font-black">{table.name}</h2>
          <p className="text-gf-navy-80">{table.area ?? 'Sem área'}{table.tag && ` · Placa ${table.tag.code}`}</p>
          {table.session ? <>
            <span className="mt-3 inline-flex items-center gap-2 rounded-pill bg-gf-bg px-3 py-1.5"><Clock className="h-4 w-4" />Aberta {ago(table.session.openedAt, now)}</span>
            <p className="mt-4 text-gf-navy-80">Total parcial</p>
            <p className="font-heading text-4xl font-black">{formatBRL(table.session.totalCents)}</p>
            <Button className="mt-5 h-12 w-full rounded-xl text-lg" onClick={() => setConfirm(true)}><CreditCard className="h-5 w-5" />Fechar mesa</Button>
          </> : <p className="mt-4 rounded-card bg-gf-bg p-4 text-gf-navy-80">Mesa livre — nenhuma sessão aberta.</p>}
          <Button variant="navy" className="mt-3 h-12 w-full rounded-xl text-lg" disabled={!table.tag}
            onClick={() => table.tag && !printEmergencyQrs([{ table: table.name, code: table.tag.code }]) && toast.error('Permita pop-ups para imprimir o QR.')}>
            <QrCode className="h-5 w-5" />Ver QR de emergência
          </Button>
          {!table.tag && <p className="mt-1 text-center text-sm text-gf-muted">Vincule uma placa para gerar o QR.</p>}
          {sid && <>
            <h3 className="mt-6 border-t border-gf-border pt-5 font-heading text-2xl font-black">Pedidos ({valid.length})</h3>
            {orders.isLoading ? <Spinner /> : (
              <ul className="divide-y divide-gf-border">
                {items.map((i) => (
                  <li key={i.id} className="flex items-start gap-3 py-3">
                    <Thumb src={i.thumbUrl} />
                    <div className="min-w-0 flex-1"><p className="font-heading text-lg font-extrabold leading-tight">{i.name}</p>
                      {i.options.length > 0 && <p className="text-sm text-gf-muted">{i.options.map((x) => x.option).join(', ')}</p>}
                      <p className="text-sm text-gf-navy-80">{i.quantity} un.</p></div>
                    <b className="font-heading text-lg font-black">{formatBRL(i.unitPriceCents * i.quantity)}</b>
                  </li>
                ))}
              </ul>
            )}
          </>}
          <Confirm open={confirm} onOpenChange={setConfirm} title={`Fechar ${table.name}?`} confirmLabel="Fechar mesa" loading={close.isPending} danger={inProgress > 0}
            onConfirm={() => close.mutate()}
            description={<>
              <p>A sessão será encerrada e quem estiver na mesa precisará ler a placa de novo. O pagamento é feito fora do Garfeed.</p>
              {inProgress > 0 && <p className="mt-3 rounded-lg bg-red-50 p-3 font-semibold text-danger">Atenção: {inProgress} pedido(s) ainda em andamento nesta mesa.</p>}
            </>} />
        </div>
      )}
    </Sheet>
  );
}
