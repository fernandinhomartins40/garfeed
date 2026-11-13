import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  CallType, PublicItem, PublicMenuResponse, PublicOrder, PublicRestaurant, SessionJoinResponse,
  SessionMeResponse, TableRef, TagResolveResponse,
} from '@garfeed/shared';
import { ApiError, API_URL, applyBrand, CALL_COOLDOWN_SEC, http, startEvents, stopEvents, store, track, unitPrice, uuid } from './lib';
import { brandLogo } from './ui';
import { Feed } from './Feed';
import { Grid } from './Grid';
import { CallDialog, Hub, OptionsSheet } from './Sheets';
import { Bill, Cart, ErrorScreen, NotActive, TableOrders, Track, Welcome } from './Pages';

export type Category = PublicMenuResponse['categories'][number];
export type CartLine = {
  key: string; itemId: string; name: string; unitPriceCents: number;
  optionIds: string[]; optionLabels: string[]; note: string; quantity: number;
};
export type View = 'feed' | 'grid' | 'cart' | 'track' | 'bill' | 'orders';
type Phase = 'loading' | 'inactive' | 'error' | 'welcome' | 'ready' | 'closed';
export type Dialog = { type: CallType; until: number };

const path = decodeURIComponent(location.pathname.slice(1)).trim();
/** /GF0007 = placa da mesa. /r/:slug = cardápio só para ver (link do botão compartilhar). */
const shareSlug = path.startsWith('r/') ? path.slice(2) : null;
const code = path.toUpperCase();
const INACTIVE = ['TAG_NOT_ACTIVE', 'TAG_BLOCKED', 'NOT_FOUND', 'VALIDATION'];

export default function App() {
  const [phase, setPhase] = useState<Phase>('loading');
  const [error, setError] = useState('');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [restaurant, setRestaurant] = useState<PublicRestaurant | null>(null);
  const [table, setTable] = useState<TableRef | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [orders, setOrders] = useState<PublicOrder[]>([]);
  const [totalCents, setTotalCents] = useState(0);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [view, setView] = useState<View>('feed');
  const [sheet, setSheet] = useState<{ item: PublicItem; optionIds?: string[]; note?: string } | null>(null);
  const [hub, setHub] = useState(false);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [trackId, setTrackId] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(true);
  const [sending, setSending] = useState(false);
  const idemKey = useRef<string | null>(null);
  const calling = useRef(false);
  const restaurantSlug = useRef('');

  const items = useMemo(() => categories?.flatMap((c) => c.items) ?? [], [categories]);
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const canOrder = !!sessionId && !!restaurant?.canOrder;
  restaurantSlug.current = restaurant?.slug ?? '';

  const say = useCallback((msg: string) => setToast(msg), []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 3500); return () => clearTimeout(t); }, [toast]);

  // ---------- Navegação (history para o botão voltar do Android) ----------
  const go = useCallback((v: View, replace = false) => {
    history[replace ? 'replaceState' : 'pushState']({ v }, '');
    setView(v);
    setHub(false);
  }, []);
  const back = useCallback(() => (history.state?.v ? history.back() : setView('feed')), []);
  useEffect(() => {
    const f = (e: PopStateEvent) => setView((e.state as { v?: View } | null)?.v ?? 'feed');
    addEventListener('popstate', f);
    return () => removeEventListener('popstate', f);
  }, []);

  // ---------- Cardápio ----------
  const loadMenu = useCallback(async (slug: string) => {
    const m = await http<PublicMenuResponse>('GET', `/public/restaurants/${encodeURIComponent(slug)}/menu`);
    setRestaurant(m.restaurant);
    setCategories(m.categories);
    const avail = new Set(m.categories.flatMap((c) => c.items.filter((i) => !i.soldOut).map((i) => i.id)));
    setCart((c) => {
      const keep = c.filter((l) => avail.has(l.itemId));
      if (keep.length < c.length) say('Um item esgotou e saiu do seu pedido.');
      return keep.length < c.length ? keep : c;
    });
    return m;
  }, [say]);

  const loadMe = useCallback(() => {
    if (!sessionId) return;
    http<SessionMeResponse>('GET', '/public/sessions/me').then((me) => { setOrders(me.orders); setTotalCents(me.totalCents); })
      .catch((e: ApiError) => { if (e.code === 'SESSION_CLOSED' || e.status === 401) setPhase('closed'); });
  }, [sessionId]);

  // ---------- Abertura (RF-01/RF-02) ----------
  const boot = useCallback(async () => {
    setPhase('loading');
    setCategories(null);
    try {
      if (shareSlug) {
        const m = await loadMenu(shareSlug);
        const item = new URLSearchParams(location.search).get('item');
        setActiveIdx(Math.max(0, m.categories.flatMap((c) => c.items).findIndex((i) => i.id === item)));
        return setPhase('ready');
      }
      if (!/^GF[0-9A-Z]{4}$/.test(code)) return setPhase('inactive');
      let slug: string;
      try {
        const j = await http<SessionJoinResponse>('POST', `/public/tags/${code}/session`);
        setSessionId(j.session.id);
        setRestaurant(j.restaurant);
        setTable(j.table);
        slug = j.restaurant.slug;
        startEvents();
        track('session_start');
      } catch (e) {
        if (!(e instanceof ApiError && e.code === 'RESTAURANT_UNAVAILABLE')) throw e;
        // Suspenso/fora do horário sem sessão: só visualização.
        const t = await http<TagResolveResponse>('GET', `/public/tags/${code}`);
        if (!t.restaurant) return setPhase('inactive');
        setTable(t.table);
        slug = t.restaurant.slug;
      }
      setPhase('welcome');
      await loadMenu(slug);
    } catch (e) {
      const err = e as ApiError;
      if (INACTIVE.includes(err.code)) return setPhase('inactive');
      setError(err.message);
      setPhase('error');
    }
  }, [loadMenu]);
  useEffect(() => { void boot(); }, [boot]);

  // M2 fica 1,5 s (o botão pula).
  useEffect(() => {
    if (phase !== 'welcome') return;
    const t = setTimeout(() => setPhase('ready'), 1500);
    return () => clearTimeout(t);
  }, [phase]);

  // Marca própria do restaurante (só vem preenchida nos planos com o recurso).
  useEffect(() => { applyBrand(restaurant?.accentColor ?? null, restaurant?.darkColor ?? null); }, [restaurant?.accentColor, restaurant?.darkColor]);
  brandLogo.current = restaurant?.whiteLabel && restaurant.logoUrl ? { src: restaurant.logoUrl, alt: restaurant.name } : null;

  // Carrinho persistido por sessão.
  useEffect(() => { if (sessionId) { setCart(store.get(`gf_cart_${sessionId}`, [])); loadMe(); } }, [sessionId, loadMe]);
  useEffect(() => { if (sessionId) store.set(`gf_cart_${sessionId}`, cart); idemKey.current = null; }, [cart, sessionId]);

  // ---------- Tempo real ----------
  useEffect(() => {
    if (!sessionId) return;
    let off = false;
    let sock: { disconnect(): void } | undefined;
    void import('socket.io-client').then(({ io }) => {
      if (off) return;
      const s = io(API_URL, { withCredentials: true });
      sock = s;
      s.on('connect', () => setOnline(true));
      s.on('disconnect', () => setOnline(false));
      s.on('order:updated', (o: PublicOrder) => {
        setOrders((os) => (os.some((x) => x.id === o.id) ? os.map((x) => (x.id === o.id ? o : x)) : [o, ...os]));
        loadMe();
      });
      s.on('menu:updated', (p: { itemId?: string; soldOut?: boolean }) => {
        if (!p.itemId || p.soldOut === undefined) return void loadMenu(restaurantSlug.current).catch(() => {});
        setCategories((cs) => cs && cs.map((c) => ({ ...c, items: c.items.map((i) => (i.id === p.itemId ? { ...i, soldOut: !!p.soldOut } : i)) })));
        if (p.soldOut) setCart((c) => {
          const keep = c.filter((l) => l.itemId !== p.itemId);
          if (keep.length < c.length) say(`${c.find((l) => l.itemId === p.itemId)?.name} esgotou e saiu do seu pedido.`);
          return keep.length < c.length ? keep : c;
        });
      });
      s.on('session:closed', () => {
        s.disconnect();
        stopEvents();
        store.del(`gf_cart_${sessionId}`);
        setSessionId(null); setCart([]); setOrders([]); setTotalCents(0); setSheet(null); setHub(false); setDialog(null);
        setView('feed');
        setPhase('closed');
      });
    });
    return () => { off = true; sock?.disconnect(); };
  }, [sessionId, loadMe, loadMenu, say]);
  useEffect(() => { if (view === 'track' || view === 'bill' || view === 'orders') loadMe(); }, [view, loadMe]);

  // ---------- Ações ----------
  const addLine = useCallback((it: PublicItem, optionIds: string[], note: string, quantity: number) => {
    const opts = it.optionGroups.flatMap((g) => g.options).filter((o) => optionIds.includes(o.id));
    setCart((c) => [...c, {
      key: uuid(), itemId: it.id, name: it.name, unitPriceCents: unitPrice(it, optionIds),
      optionIds, optionLabels: opts.map((o) => o.name), note, quantity,
    }]);
    track('add_to_cart', { itemId: it.id, value: quantity });
  }, []);

  const sendOrder = async (name: string) => {
    if (sending || !cart.length) return;
    setSending(true);
    idemKey.current ??= uuid(); // mesma chave se a rede falhar e a pessoa reenviar
    const n = name.trim();
    store.set('gf_name', n);
    try {
      const o = await http<PublicOrder>('POST', '/public/orders', {
        idempotencyKey: idemKey.current,
        customerName: n || undefined,
        items: cart.map((l) => ({ itemId: l.itemId, quantity: l.quantity, optionIds: l.optionIds, note: l.note || undefined })),
      });
      track('order_sent', { value: cart.reduce((s, l) => s + l.quantity, 0) });
      setOrders((os) => [o, ...os.filter((x) => x.id !== o.id)]);
      setCart([]);
      setTrackId(o.id);
      go('track', true);
      loadMe();
    } catch (e) {
      const err = e as ApiError;
      if (err.code !== 'NETWORK') idemKey.current = null;
      say(err.message);
      if (['ITEM_SOLD_OUT', 'ITEM_UNAVAILABLE', 'INVALID_OPTIONS'].includes(err.code)) void loadMenu(restaurantSlug.current).catch(() => {});
      if (err.code === 'SESSION_CLOSED') setPhase('closed');
    } finally {
      setSending(false);
    }
  };

  /** M10: prazo do bloqueio guardado por sessão/tipo — reabrir não reinicia a contagem. */
  const call = async (type: CallType) => {
    if (!sessionId || calling.current) return;
    const k = `gf_cd_${sessionId}_${type}`;
    const until = store.get(k, 0);
    if (until > Date.now()) return setDialog({ type, until });
    calling.current = true;
    try {
      await http('POST', '/public/calls', { type });
      track(type === 'WAITER' ? 'call_waiter' : 'call_bill');
      const u = Date.now() + CALL_COOLDOWN_SEC * 1000;
      store.set(k, u);
      setDialog({ type, until: u });
    } catch (e) {
      const err = e as ApiError;
      if (err.code === 'CALL_COOLDOWN') {
        const u = Date.now() + (err.retryAfterSec ?? CALL_COOLDOWN_SEC) * 1000;
        store.set(k, u);
        setDialog({ type, until: u });
      } else say(err.message);
    } finally {
      calling.current = false;
    }
  };

  /** M12 "Mais uma igual": revalida disponibilidade, preço e opcionais no cardápio atual. */
  const repeat = (o: PublicOrder['items'][number]) => {
    const it = byId.get(o.itemId);
    if (!it) return say('Este item não está mais no cardápio.');
    if (it.soldOut) return say(`${it.name} está esgotado hoje.`);
    const ids = o.options.map((op) => it.optionGroups.find((g) => g.name === op.group)?.options.find((x) => x.name === op.option)?.id);
    const valid = ids.every(Boolean) && it.optionGroups.every((g) => {
      const n = g.options.filter((x) => ids.includes(x.id)).length;
      return n >= g.min && n <= g.max;
    });
    if (!valid) return setSheet({ item: it, optionIds: ids.filter((x): x is string => !!x), note: o.note ?? '' });
    addLine(it, ids as string[], o.note ?? '', 1);
    say(`Mais um ${it.name} no seu pedido.`);
  };

  // ---------- Render ----------
  if (phase === 'inactive') return <NotActive onRetry={boot} />;
  if (phase === 'error') return <ErrorScreen message={error} onRetry={boot} />;
  if (phase === 'loading') return <div className="media-fallback h-full" aria-busy="true" />;
  if (phase === 'welcome' || phase === 'closed') {
    return <Welcome restaurant={restaurant} table={table} closed={phase === 'closed'}
      onContinue={() => (phase === 'closed' ? void boot() : setPhase('ready'))} />;
  }

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.quantity * l.unitPriceCents, 0);
  const common = { restaurant: restaurant!, table, canOrder, cartCount, cartTotal, onCart: () => go('cart'), onHub: () => setHub(true) };
  const openItem = (it: PublicItem) => setSheet({ item: it });

  return (
    <div className="h-full">
      {!online && sessionId && (
        <div role="status" className="fixed inset-x-0 top-0 z-50 bg-danger px-4 py-2 text-center text-sm font-semibold text-white">
          Sem conexão — tentando reconectar…
        </div>
      )}
      {!categories ? <div className="media-fallback h-full" aria-busy="true" /> : view === 'grid' ? (
        <Grid {...common} categories={categories} activeIdx={activeIdx} items={items}
          onPick={(i) => { setActiveIdx(i); back(); }} onFeed={back} />
      ) : view === 'cart' ? (
        <Cart {...common} cart={cart} byId={byId} sending={sending} onBack={back} onSend={sendOrder}
          onQty={(key, q) => setCart((c) => c.map((l) => (l.key === key ? { ...l, quantity: Math.min(20, q) } : l)).filter((l) => l.quantity > 0))}
          onRemove={(key) => setCart((c) => c.filter((l) => l.key !== key))} />
      ) : view === 'track' ? (
        <Track {...common} order={orders.find((o) => o.id === trackId) ?? null} byId={byId} onBack={back} onCall={() => call('WAITER')} />
      ) : view === 'bill' ? (
        <Bill {...common} orders={orders} totalCents={totalCents} byId={byId} onBack={back} onCall={() => call('BILL')} />
      ) : view === 'orders' ? (
        <TableOrders {...common} orders={orders} byId={byId} onBack={back} onRepeat={repeat}
          onOpen={(id) => { setTrackId(id); go('track'); }} />
      ) : (
        <Feed {...common} categories={categories} items={items} activeIdx={activeIdx} setActiveIdx={setActiveIdx}
          onAdd={openItem} onGrid={() => go('grid')} say={say} />
      )}

      {sheet && <OptionsSheet {...sheet} canOrder={canOrder} onClose={() => setSheet(null)}
        onAdd={(ids, note, q) => { addLine(sheet.item, ids, note, q); setSheet(null); say(`${sheet.item.name} adicionado ao pedido.`); }} />}
      {hub && restaurant && <Hub restaurant={restaurant} table={table} hasSession={!!sessionId} onClose={() => setHub(false)}
        onCall={() => call('WAITER')} onBill={() => go('bill')} onOrders={() => go('orders')} say={say} />}
      {dialog && <CallDialog dialog={dialog} table={table} onClose={() => setDialog(null)} onAgain={() => call(dialog.type)} />}
      {toast && (
        <div role="status" aria-live="polite" className="fixed inset-x-4 bottom-24 z-[60] mx-auto max-w-sm rounded-card bg-gf-navy px-4 py-3 text-center text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
}
