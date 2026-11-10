import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CreateOrderBody, formatBRL, IdParams, LIMITS, ListOrdersQuery, ORDER_TRANSITIONS, UpdateOrderStatusBody,
  type OrderItemOption, type OrderStatus,
} from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { requireGuest, tenantId } from '../../lib/auth';
import { openGuestSession } from '../../lib/guest';
import { rateLimit } from '../../lib/rateLimit';
import { localDay, toPublicRestaurant } from '../../lib/restaurant';
import { notifyRestaurant } from '../../lib/push';
import { orderInclude, toPanelOrder, toPublicOrder, type OrderRow } from '../../lib/views';
import { emitToRestaurant, emitToSession } from '../../realtime/io';
import { validate } from '../../middleware/validate';

/** /orders (STAFF; KITCHEN filtrado pelo setor do token). Contrato: api.orders. */
export const router = Router();
/** /public/orders (requireGuest). */
export const publicRouter = Router();

const HOUR = 3_600_000;

/** Emite o pedido para o painel e para os celulares da mesa. */
function broadcast(event: 'order:new' | 'order:updated', o: OrderRow) {
  emitToRestaurant(o.restaurantId, event, toPanelOrder(o));
  emitToSession(o.sessionId, 'order:updated', toPublicOrder(o));
  emitToRestaurant(o.restaurantId, 'table:updated', { tableId: o.tableId });
}

// ---------- Público ----------
publicRouter.post('/orders', requireGuest, rateLimit('orders', 30, 60), validate({ body: CreateOrderBody }), async (req, res) => {
  const session = await openGuestSession(req);
  const rid = session.restaurantId;
  const body = req.body as CreateOrderBody;

  // reenvio com a mesma chave (rede ruim) → mesmo pedido
  const existing = await prisma.order.findUnique({ where: { sessionId_idempotencyKey: { sessionId: session.id, idempotencyKey: body.idempotencyKey } }, include: orderInclude });
  if (existing) return res.status(200).json(toPublicOrder(existing));

  if (!toPublicRestaurant(session.restaurant).canOrder) {
    throw new AppError('RESTAURANT_UNAVAILABLE', 'O restaurante não está recebendo pedidos agora. O cardápio está disponível só para consulta.');
  }

  const recent = await prisma.order.findMany({
    where: { sessionId: session.id, createdAt: { gt: new Date(Date.now() - HOUR) } }, select: { createdAt: true }, orderBy: { createdAt: 'asc' },
  });
  if (recent.length >= LIMITS.ordersPerSessionPerHour) {
    const retry = Math.ceil((recent[0]!.createdAt.getTime() + HOUR - Date.now()) / 1000);
    throw new AppError('ORDER_LIMIT', 'Limite de pedidos por hora atingido nesta mesa. Chame o garçom.', undefined, Math.max(1, retry));
  }

  // Validação de itens e opcionais sempre no servidor; preço e nome vêm do banco (snapshot).
  const items = await prisma.item.findMany({
    where: { id: { in: body.items.map((l) => l.itemId) }, restaurantId: rid },
    include: { category: true, optionGroups: { orderBy: { position: 'asc' }, include: { group: { include: { options: true } } } } },
  });
  const byId = new Map(items.map((i) => [i.id, i]));
  const lines = body.items.map((l) => {
    const item = byId.get(l.itemId);
    if (!item || !item.visible || !item.category.visible) throw new AppError('ITEM_UNAVAILABLE', 'Um item do pedido não está mais disponível.', { itemId: l.itemId });
    if (item.soldOut) throw new AppError('ITEM_SOLD_OUT', `${item.name} esgotou. Remova do carrinho para continuar.`, { itemId: item.id });
    if (new Set(l.optionIds).size !== l.optionIds.length) throw new AppError('INVALID_OPTIONS', 'Opcional repetido.', { itemId: item.id });
    const chosen: OrderItemOption[] = [];
    let used = 0;
    for (const { group } of item.optionGroups) {
      const picked = group.options.filter((o) => l.optionIds.includes(o.id));
      used += picked.length;
      if (picked.length < group.min || picked.length > group.max) {
        const msg = group.min === group.max ? `escolha ${group.min}` : `escolha de ${group.min} a ${group.max}`;
        throw new AppError('INVALID_OPTIONS', `${item.name}: em "${group.name}", ${msg}.`, { itemId: item.id, groupId: group.id });
      }
      chosen.push(...picked.sort((a, b) => a.position - b.position).map((o) => ({ group: group.name, option: o.name, priceCents: o.priceCents })));
    }
    if (used !== l.optionIds.length) throw new AppError('INVALID_OPTIONS', `${item.name}: opcional inválido.`, { itemId: item.id });
    const unitPriceCents = (item.promoPriceCents ?? item.priceCents) + chosen.reduce((s, o) => s + o.priceCents, 0);
    return {
      itemId: item.id, nameSnapshot: item.name, unitPriceCents, quantity: l.quantity, options: chosen,
      note: l.note || null, sector: item.category.sector,
    };
  });
  const totalCents = lines.reduce((s, l) => s + l.unitPriceCents * l.quantity, 0);

  const day = localDay(session.restaurant.timezone);
  let order: OrderRow;
  try {
    order = await prisma.$transaction(async (tx) => {
      const counter = await tx.orderCounter.upsert({
        where: { restaurantId_day: { restaurantId: rid, day } },
        create: { restaurantId: rid, day, last: 1 },
        update: { last: { increment: 1 } },
      });
      await tx.tableSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
      return tx.order.create({
        data: {
          restaurantId: rid, sessionId: session.id, tableId: session.tableId, day, number: counter.last,
          customerName: body.customerName || null, totalCents, idempotencyKey: body.idempotencyKey,
          status: session.restaurant.requireConfirmation ? 'PENDING' : 'CONFIRMED',
          items: { create: lines },
        },
        include: orderInclude,
      });
    });
  } catch (err) {
    // dois envios simultâneos com a mesma chave: o segundo devolve o primeiro
    const dup = (err as { code?: string }).code === 'P2002'
      && await prisma.order.findUnique({ where: { sessionId_idempotencyKey: { sessionId: session.id, idempotencyKey: body.idempotencyKey } }, include: orderInclude });
    if (dup) return res.status(200).json(toPublicOrder(dup));
    throw err;
  }

  broadcast('order:new', order);
  notifyRestaurant(rid, {
    title: `Novo pedido · ${order.table.name}`,
    body: `#${String(order.number).padStart(3, '0')} · ${formatBRL(order.totalCents)}`,
    tag: `order-${order.id}`,
  });
  res.status(201).json(toPublicOrder(order));
});

// ---------- Painel ----------
router.get('/', validate({ query: ListOrdersQuery }), async (req, res) => {
  const q = req.query as ListOrdersQuery;
  // KITCHEN só vê o próprio setor, independentemente do filtro pedido
  const sector = req.auth!.role === 'KITCHEN' ? (req.auth!.sector ?? q.sector) : q.sector;
  const where: Prisma.OrderWhereInput = {
    restaurantId: tenantId(req),
    status: q.status ? { in: q.status } : undefined,
    sessionId: q.sessionId,
    tableId: q.tableId,
    items: sector ? { some: { sector } } : undefined,
  };
  // shortcut: sem paginação, só os 300 mais recentes; paginar quando houver histórico/relatórios (V2)
  const rows = await prisma.order.findMany({ where, orderBy: { createdAt: 'desc' }, take: 300, include: orderInclude });
  res.json(rows.reverse().map((o) => {
    const p = toPanelOrder(o);
    return sector ? { ...p, items: p.items.filter((i) => i.sector === sector) } : p;
  }));
});

/** KITCHEN só avança o preparo (Em preparo / Pronto) dos pedidos que têm itens do seu setor. */
const KITCHEN_TARGETS: readonly OrderStatus[] = ['PREPARING', 'READY'];

router.patch('/:id/status', validate({ params: IdParams, body: UpdateOrderStatusBody }), async (req, res) => {
  const { status, reason } = req.body as UpdateOrderStatusBody;
  const auth = req.auth!;
  const order = await prisma.order.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: tenantId(req) }, include: orderInclude });
  if (!order) throw notFound('Pedido');
  if (auth.role === 'KITCHEN') {
    if (auth.sector && !order.items.some((i) => i.sector === auth.sector)) throw notFound('Pedido');
    if (!KITCHEN_TARGETS.includes(status)) throw new AppError('FORBIDDEN', 'A cozinha só marca "Em preparo" e "Pronto".');
  }
  if (!ORDER_TRANSITIONS[order.status].includes(status)) {
    throw new AppError('INVALID_TRANSITION', `Não é possível mudar de "${order.status}" para "${status}".`);
  }
  // condição no status atual: duas pessoas clicando ao mesmo tempo → só uma vence
  const { count } = await prisma.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status, ...(status === 'REJECTED' || status === 'CANCELED' ? { rejectReason: reason ?? null } : {}) },
  });
  if (!count) throw new AppError('INVALID_TRANSITION', 'O pedido foi alterado por outra pessoa. Atualize a tela.');
  const updated = await prisma.order.findUniqueOrThrow({ where: { id: order.id }, include: orderInclude });
  broadcast('order:updated', updated);
  res.json(toPanelOrder(updated));
});
