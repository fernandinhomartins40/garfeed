// Espelha os enums de apps/api/prisma/schema.prisma — mantenha os dois em sincronia.
import { z } from 'zod';

const e = <const T extends readonly [string, ...string[]]>(values: T) => z.enum(values);

export const Plan = e(['ESSENTIAL', 'PRO', 'NETWORK']);
export const RestStatus = e(['TRIAL', 'ACTIVE', 'SUSPENDED']);
export const Role = e(['SUPERADMIN', 'OWNER', 'MANAGER', 'WAITER', 'KITCHEN']);
export const TagStatus = e(['UNASSIGNED', 'ACTIVE', 'BLOCKED']);
export const SessionStatus = e(['OPEN', 'CLOSED', 'EXPIRED']);
export const OrderStatus = e(['PENDING', 'CONFIRMED', 'PREPARING', 'READY', 'DELIVERED', 'REJECTED', 'CANCELED']);
export const CallType = e(['WAITER', 'BILL']);
export const CallStatus = e(['OPEN', 'DONE']);
export const MediaType = e(['VIDEO', 'IMAGE']);
export const MediaStatus = e(['UPLOADING', 'PROCESSING', 'READY', 'FAILED']);
export const Sector = e(['KITCHEN', 'BAR']);
/** Selos do item (Item.badges é String[] no banco; o contrato restringe a estes). */
export const Badge = e(['MOST_ORDERED', 'NEW', 'VEGAN', 'SPICY']);
/** Tipos de evento do feed (RF-27). */
export const EventType = e([
  'session_start', 'item_view', 'category_change', 'add_to_cart',
  'order_sent', 'call_waiter', 'call_bill', 'favorite',
]);

export type Plan = z.infer<typeof Plan>;
export type RestStatus = z.infer<typeof RestStatus>;
export type Role = z.infer<typeof Role>;
export type TagStatus = z.infer<typeof TagStatus>;
export type SessionStatus = z.infer<typeof SessionStatus>;
export type OrderStatus = z.infer<typeof OrderStatus>;
export type CallType = z.infer<typeof CallType>;
export type CallStatus = z.infer<typeof CallStatus>;
export type MediaType = z.infer<typeof MediaType>;
export type MediaStatus = z.infer<typeof MediaStatus>;
export type Sector = z.infer<typeof Sector>;
export type Badge = z.infer<typeof Badge>;
export type EventType = z.infer<typeof EventType>;

/** Papéis da equipe de um restaurante (SUPERADMIN fica de fora). */
export const StaffRole = Role.exclude(['SUPERADMIN']);
export type StaffRole = z.infer<typeof StaffRole>;

/** Transições permitidas de status do pedido no painel (PATCH /orders/:id/status). */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  PENDING: ['CONFIRMED', 'REJECTED', 'CANCELED'],
  CONFIRMED: ['PREPARING', 'READY', 'CANCELED'],
  PREPARING: ['READY', 'CANCELED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  REJECTED: [],
  CANCELED: [],
};

/** Rótulos pt-BR para exibição. */
export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Enviado',
  CONFIRMED: 'Confirmado',
  PREPARING: 'Em preparo',
  READY: 'Pronto',
  DELIVERED: 'Entregue',
  REJECTED: 'Recusado',
  CANCELED: 'Cancelado',
};
export const ROLE_LABEL: Record<Role, string> = {
  SUPERADMIN: 'Admin Garfeed', OWNER: 'Dono', MANAGER: 'Gerente', WAITER: 'Garçom', KITCHEN: 'Cozinha',
};
export const BADGE_LABEL: Record<Badge, string> = {
  MOST_ORDERED: 'Mais pedido', NEW: 'Novo', VEGAN: 'Vegano', SPICY: 'Picante',
};
