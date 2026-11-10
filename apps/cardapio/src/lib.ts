import type { Badge, EventsBody, ErrorResponse, OptionGroup, OrderStatus, PublicItem, PublicRestaurant } from '@garfeed/shared';

type OpeningHours = PublicRestaurant['openingHours'];

export const API_URL: string = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3000' : 'https://api.garfeed.com.br');

/** = LIMITS.callCooldownSec (importar contract.ts traria o zod para o bundle; o teste garante a igualdade). */
export const CALL_COOLDOWN_SEC = 60;
/** = ORDER_STATUS_LABEL / BADGE_LABEL de enums.ts (que chama z.enum no topo e puxaria o zod). Teste garante a igualdade. */
export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Enviado', CONFIRMED: 'Confirmado', PREPARING: 'Em preparo', READY: 'Pronto', DELIVERED: 'Entregue', REJECTED: 'Recusado', CANCELED: 'Cancelado',
};
export const BADGES: Record<Badge, string> = { MOST_ORDERED: 'Mais pedido', NEW: 'Novo', VEGAN: 'Vegano', SPICY: 'Picante' };

// ---------- HTTP ----------
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryAfterSec?: number) { super(message); }
}

/** fetch com cookie guestToken (credentials: 'include'). Erros viram ApiError com a mensagem pt-BR do servidor. */
export async function http<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      method, credentials: 'include',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão. Verifique a internet e tente de novo.');
  }
  if (res.status === 204) return undefined as T;
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const e = (data as ErrorResponse | null)?.error;
    throw new ApiError(res.status, e?.code ?? 'INTERNAL', e?.message ?? 'Algo deu errado. Tente de novo.', e?.retryAfterSec);
  }
  return data as T;
}

// ---------- Eventos RF-27 (lote a cada 10 s e no pagehide) ----------
type Ev = EventsBody['events'][number];
let queue: Ev[] = [];
let eventsOn = false;
export const track = (type: Ev['type'], extra: Omit<Ev, 'type' | 'at'> = {}) => {
  if (eventsOn) queue.push({ type, ...extra, at: new Date().toISOString() });
};
function flush(beacon = false) {
  if (!queue.length) return;
  const events = queue.splice(0, 200);
  const url = `${API_URL}/public/events`;
  // sendBeacon só aceita tipos "simples" sem preflight: vai como text/plain (API precisa aceitar — ver relatório).
  if (beacon && navigator.sendBeacon?.(url, new Blob([JSON.stringify({ events })], { type: 'text/plain' }))) return;
  http('POST', '/public/events', { events }).catch(() => { queue = events.concat(queue).slice(-500); });
}
export function startEvents() {
  if (eventsOn) return;
  eventsOn = true;
  setInterval(flush, 10_000);
  addEventListener('pagehide', () => flush(true));
}
export const stopEvents = () => { eventsOn = false; queue = []; };

// ---------- localStorage seguro ----------
export const store = {
  get<T>(k: string, fallback: T): T {
    try { const v = localStorage.getItem(k); return v === null ? fallback : (JSON.parse(v) as T); } catch { return fallback; }
  },
  set(k: string, v: unknown) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } },
  del(k: string) { try { localStorage.removeItem(k); } catch { /* modo privado */ } },
};

// ---------- Opcionais (M6) ----------
/** Mensagem de erro do grupo ou null se válido. */
export function groupError(g: OptionGroup, picked: string[]): string | null {
  const n = g.options.filter((o) => picked.includes(o.id)).length;
  if (n < g.min) return g.min === 1 ? `Escolha 1 em "${g.name}"` : `Escolha pelo menos ${g.min} em "${g.name}"`;
  if (n > g.max) return `Máximo de ${g.max} em "${g.name}"`;
  return null;
}
export const itemPrice = (it: PublicItem) => it.promoPriceCents ?? it.priceCents;
/** Preço unitário com opcionais (centavos). */
export const unitPrice = (it: PublicItem, picked: string[]) =>
  itemPrice(it) + it.optionGroups.flatMap((g) => g.options).filter((o) => picked.includes(o.id)).reduce((s, o) => s + o.priceCents, 0);
export function groupHint(g: OptionGroup) {
  if (g.min >= 1) return g.min === g.max ? `Obrigatório · escolha ${g.min}` : `Obrigatório · escolha de ${g.min} a ${g.max}`;
  return g.max >= g.options.length ? 'Opcional · selecione quantos quiser' : `Opcional · até ${g.max}`;
}

// ---------- Horário (M9) ----------
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const hh = (t: string) => (t.endsWith(':00') ? `${Number(t.slice(0, 2))}h` : t.replace(':', 'h'));
/** Faixas de hoje, ex.: "11h às 15h · 18h às 23h" (null = fechado/sem horário). shortcut: usa o fuso do aparelho, não o do restaurante. */
export function todayHours(h: OpeningHours, now = new Date()): string | null {
  const ranges = h?.[DAYS[now.getDay()]!];
  return ranges?.length ? ranges.map(([a, b]) => `${hh(a)} às ${hh(b)}`).join(' · ') : null;
}
/** Fim da faixa atual ("23h") para "Aberto até 23h". */
export function openUntil(h: OpeningHours, now = new Date()): string | null {
  const cur = now.toTimeString().slice(0, 5);
  const r = h?.[DAYS[now.getDay()]!]?.find(([a, b]) => a <= cur && cur < b);
  return r ? hh(r[1]) : null;
}

// ---------- Cor do restaurante ----------
/** Texto legível (AA) sobre a cor de destaque: branco ou marinho. */
export function onColor(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return (1.05 / (L + 0.05)) >= 3 ? '#FFFFFF' : '#142433'; // 3:1 = AA para texto grande/negrito (chips e botões)
}

export const pad3 = (n: number) => String(n).padStart(3, '0');
export const uuid = () => crypto.randomUUID?.() ?? '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
  (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0]! & (15 >> (Number(c) / 4)))).toString(16));
