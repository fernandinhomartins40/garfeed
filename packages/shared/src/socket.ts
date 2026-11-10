// Contrato do tempo real (Socket.io). Só servidor → cliente; não há eventos cliente → servidor.
//
// Conexão:
//   painel  → io(API_URL, { auth: { token: accessToken } })         entra em restaurant:{id}
//   cliente → io(API_URL, { withCredentials: true })  (cookie gf_guest) entra em session:{id} e guests:{restaurantId}
// Ao renovar o accessToken o painel não precisa reconectar; se o socket cair, reconecte com o token novo.
import type { PanelCall, PanelOrder, PublicOrder } from './schemas';

export const rooms = {
  restaurant: (id: string) => `restaurant:${id}`,
  session: (id: string) => `session:${id}`,
  /** Todos os clientes de um restaurante (broadcast de menu:updated). */
  guests: (restaurantId: string) => `guests:${restaurantId}`,
} as const;

/** Mudança no cardápio. Com itemId+soldOut o cliente atualiza na hora; sem eles, refaz GET do menu. */
export type MenuUpdatedPayload = { itemId?: string; soldOut?: boolean };
export type TableUpdatedPayload = { tableId: string };
export type SessionClosedPayload = { sessionId: string };

/** Eventos recebidos pelo painel (sala restaurant:{id}). */
export interface PanelServerEvents {
  'order:new': (order: PanelOrder) => void;
  'order:updated': (order: PanelOrder) => void;
  'call:new': (call: PanelCall) => void;
  'call:done': (call: PanelCall) => void;
  'table:updated': (p: TableUpdatedPayload) => void;
  'menu:updated': (p: MenuUpdatedPayload) => void;
}

/** Eventos recebidos pelo cliente (salas session:{id} e guests:{restaurantId}). */
export interface GuestServerEvents {
  'order:updated': (order: PublicOrder) => void;
  'menu:updated': (p: MenuUpdatedPayload) => void;
  /** Mesa fechada pelo garçom: o cliente deve descartar a sessão. */
  'session:closed': (p: SessionClosedPayload) => void;
}

export type ServerToClientEvents = PanelServerEvents & GuestServerEvents;
export type ClientToServerEvents = Record<string, never>;

export const SOCKET_EVENTS = [
  'order:new', 'order:updated', 'call:new', 'call:done', 'table:updated', 'menu:updated', 'session:closed',
] as const satisfies readonly (keyof ServerToClientEvents)[];

// ---------- Filas BullMQ (api → worker) ----------
export const QUEUES = { media: 'media', sessions: 'sessions' } as const;
export type MediaJobData = { mediaId: string; restaurantId: string };
