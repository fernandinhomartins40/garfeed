import { Router } from 'express';
import { CreateCallBody, IdParams, LIMITS, ListCallsQuery } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { AppError, notFound } from '../../lib/errors';
import { requireGuest, tenantId } from '../../lib/auth';
import { openGuestSession } from '../../lib/guest';
import { rateLimit } from '../../lib/rateLimit';
import { notifyRestaurant } from '../../lib/push';
import { toPublicRestaurant } from '../../lib/restaurant';
import { toPanelCall, toPublicCall } from '../../lib/views';
import { emitToRestaurant } from '../../realtime/io';
import { validate } from '../../middleware/validate';

/** /calls (OPERATE). Contrato: api.calls. */
export const router = Router();
/** /public/calls (requireGuest) — cooldown 60 s por tipo. */
export const publicRouter = Router();

publicRouter.post('/calls', requireGuest, rateLimit('calls', 20, 60), validate({ body: CreateCallBody }), async (req, res) => {
  const session = await openGuestSession(req);
  const { type } = req.body as CreateCallBody;
  if (!toPublicRestaurant(session.restaurant).canOrder) {
    throw new AppError('RESTAURANT_UNAVAILABLE', 'O restaurante não está atendendo pelo Garfeed agora.');
  }
  // SET NX = cooldown atômico por sessão e tipo (dois toques simultâneos → um chamado só)
  const key = `cooldown:call:${session.id}:${type}`;
  if (!(await redis.set(key, '1', 'EX', LIMITS.callCooldownSec, 'NX'))) {
    const ttl = await redis.ttl(key);
    throw new AppError('CALL_COOLDOWN', 'Chamado já enviado. Aguarde um pouco para chamar de novo.', undefined, Math.max(1, ttl));
  }
  const [call] = await prisma.$transaction([
    prisma.serviceCall.create({ data: { restaurantId: session.restaurantId, sessionId: session.id, tableId: session.tableId, type }, include: { table: true } }),
    prisma.tableSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } }),
  ]);
  emitToRestaurant(session.restaurantId, 'call:new', toPanelCall(call));
  emitToRestaurant(session.restaurantId, 'table:updated', { tableId: session.tableId });
  notifyRestaurant(session.restaurantId, {
    title: `${session.table.name} ${type === 'BILL' ? 'pediu a conta' : 'chamou o garçom'}`,
    body: 'Toque para abrir o painel',
    tag: `call-${call.id}`,
  });
  res.status(201).json(toPublicCall(call));
});

router.get('/', validate({ query: ListCallsQuery }), async (req, res) => {
  const { status } = req.query as ListCallsQuery;
  // shortcut: sem paginação (200 mais recentes); paginar se virar histórico
  const rows = await prisma.serviceCall.findMany({
    where: { restaurantId: tenantId(req), status }, orderBy: { createdAt: 'desc' }, take: 200, include: { table: true },
  });
  res.json(rows.reverse().map(toPanelCall));
});

router.post('/:id/done', validate({ params: IdParams }), async (req, res) => {
  const rid = tenantId(req);
  const call = await prisma.serviceCall.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: rid } });
  if (!call) throw notFound('Chamado');
  const { count } = await prisma.serviceCall.updateMany({ where: { id: call.id, status: 'OPEN' }, data: { status: 'DONE', doneAt: new Date(), doneById: req.auth!.sub } });
  const updated = await prisma.serviceCall.findUniqueOrThrow({ where: { id: call.id }, include: { table: true } });
  if (count) {
    emitToRestaurant(rid, 'call:done', toPanelCall(updated));
    emitToRestaurant(rid, 'table:updated', { tableId: call.tableId });
  }
  res.json(toPanelCall(updated));
});
