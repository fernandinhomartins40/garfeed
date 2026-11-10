import { useEffect, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ROLES, type ClientToServerEvents, type PanelCall, type PanelOrder, type PanelServerEvents, type Role } from '@garfeed/shared';
import { call } from './api';
import { useAuth, useLive, usePrefs } from './auth';
import { API_URL } from './utils';
import { notify, playAlert } from './alerts';
import { OrderToast } from '@/components/OrderToast';

export const ACTIVE_STATUSES = ['PENDING', 'CONFIRMED', 'PREPARING', 'READY'] as const;
export const qk = {
  orders: ['orders', 'active'] as const,
  calls: ['calls', 'open'] as const,
  tables: ['tables'] as const,
};
export const can = (role: Role | undefined, group: keyof typeof ROLES) => !!role && (ROLES[group] as readonly Role[]).includes(role);

/** Re-renderiza a cada `ms` (tempos relativos "há 40 s"). */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
  return now;
}

const isActive = (o: PanelOrder) => (ACTIVE_STATUSES as readonly string[]).includes(o.status);

export function useActiveOrders() {
  const sector = useAuth((s) => s.user?.sector);
  const role = useAuth((s) => s.user?.role);
  return useQuery({
    queryKey: qk.orders,
    enabled: can(role, 'STAFF'),
    queryFn: () => call(api.orders.list, { query: { status: ACTIVE_STATUSES.join(','), sector: role === 'KITCHEN' ? sector ?? undefined : undefined } }),
    // KITCHEN: o servidor já filtra; o filtro local cobre eventos de socket da sala inteira.
    select: (os) => (role === 'KITCHEN' && sector ? os.filter((o) => o.items.some((i) => i.sector === sector)) : os),
    refetchInterval: 60_000,
  });
}
export function useOpenCalls() {
  const role = useAuth((s) => s.user?.role);
  return useQuery({ queryKey: qk.calls, enabled: can(role, 'OPERATE'), queryFn: () => call(api.calls.list, { query: { status: 'OPEN' } }), refetchInterval: 60_000 });
}

function upsertOrder(qc: QueryClient, o: PanelOrder) {
  qc.setQueryData<PanelOrder[]>(qk.orders, (list = []) => {
    const rest = list.filter((x) => x.id !== o.id);
    return isActive(o) ? [...rest, o] : rest;
  });
  void qc.invalidateQueries({ queryKey: ['orders', 'session', o.sessionId] });
  void qc.invalidateQueries({ queryKey: qk.tables });
}

/**
 * Socket.io do painel + alertas (montado uma vez no layout).
 * Som alto a cada 15 s enquanto houver pedido PENDING ou chamado aberto (RF-11).
 */
export function useRealtime() {
  const qc = useQueryClient();
  const restaurantId = useAuth((s) => s.user?.restaurantId);
  const sector = useAuth((s) => s.user?.role === 'KITCHEN' ? s.user.sector : null);
  const orders = useActiveOrders().data;
  const calls = useOpenCalls().data;
  const { sound, volume } = usePrefs();

  useEffect(() => {
    if (!restaurantId) return;
    // auth como função: cada reconexão usa o accessToken mais novo.
    const socket: Socket<PanelServerEvents, ClientToServerEvents> = io(API_URL, {
      auth: (cb) => cb({ token: useAuth.getState().token }),
      transports: ['websocket', 'polling'],
    });
    const alert = () => { if (usePrefs.getState().sound) playAlert(usePrefs.getState().volume); };
    socket.on('connect', () => {
      useLive.setState({ connected: true, everConnected: true });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['calls'] });
      void qc.invalidateQueries({ queryKey: qk.tables });
    });
    socket.on('disconnect', () => useLive.setState({ connected: false }));
    socket.on('connect_error', () => useLive.setState({ connected: false }));
    socket.on('order:new', (o) => {
      if (sector && !o.items.some((i) => i.sector === sector)) return;
      upsertOrder(qc, o);
      toast.custom((id) => <OrderToast id={id} table={o.table.name} />, { duration: 8000 });
      alert();
      void notify(`Novo pedido · ${o.table.name}`, `Pedido nº${String(o.number).padStart(3, '0')}`);
    });
    socket.on('order:updated', (o) => upsertOrder(qc, o));
    socket.on('call:new', (c) => {
      qc.setQueryData<PanelCall[]>(qk.calls, (l = []) => [...l.filter((x) => x.id !== c.id), c]);
      void qc.invalidateQueries({ queryKey: qk.tables });
      alert();
      const what = c.type === 'BILL' ? 'pediu a conta' : 'chamou o garçom';
      toast(`${c.table.name} ${what}`);
      void notify(`${c.table.name} ${what}`, 'Abra o painel para atender');
    });
    socket.on('call:done', (c) => {
      qc.setQueryData<PanelCall[]>(qk.calls, (l = []) => l.filter((x) => x.id !== c.id));
      void qc.invalidateQueries({ queryKey: qk.tables });
    });
    socket.on('table:updated', () => void qc.invalidateQueries({ queryKey: qk.tables }));
    socket.on('menu:updated', () => void qc.invalidateQueries({ queryKey: ['menu'] }));
    return () => { socket.disconnect(); useLive.setState({ connected: false }); };
  }, [restaurantId, sector, qc]);

  const pending = (orders?.filter((o) => o.status === 'PENDING').length ?? 0) + (calls?.length ?? 0);
  useEffect(() => {
    if (!pending || !sound) return;
    const t = setInterval(() => playAlert(volume), 15_000);
    return () => clearInterval(t);
  }, [pending, sound, volume]);
  return pending;
}
