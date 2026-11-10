import { Router } from 'express';
import { IdParams, type CloseSessionResponse, type SessionMeResponse } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { requireGuest, tenantId } from '../../lib/auth';
import { orderInclude, sessionTotal, tableRef, toPublicCall, toPublicOrder } from '../../lib/views';
import { emitToRestaurant, emitToSession } from '../../realtime/io';
import { validate } from '../../middleware/validate';

/** /sessions/:id/close (OPERATE). Contrato: api.sessions. */
export const router = Router();
/** /public/sessions/me (requireGuest). */
export const publicRouter = Router();

/** Pedidos e chamados de TODOS os celulares da mesa. Responde mesmo com a sessão encerrada (status mostra). */
publicRouter.get('/sessions/me', requireGuest, async (req, res) => {
  const g = req.guest!;
  const session = await prisma.tableSession.findFirst({
    where: { id: g.sessionId, restaurantId: g.restaurantId },
    include: { table: true, orders: { orderBy: { createdAt: 'asc' }, include: orderInclude }, calls: { orderBy: { createdAt: 'asc' } } },
  });
  if (!session) throw new AppError('SESSION_CLOSED', 'A sessão desta mesa foi encerrada. Aproxime o celular da placa novamente.');
  const body: SessionMeResponse = {
    session: { id: session.id, status: session.status, openedAt: session.openedAt.toISOString() },
    table: tableRef(session.table),
    orders: session.orders.map(toPublicOrder),
    calls: session.calls.map(toPublicCall),
    totalCents: sessionTotal(session.orders),
  };
  res.json(body);
});

/** Fecha a mesa: chamados abertos são concluídos; os celulares recebem session:closed. Idempotente. */
router.post('/:id/close', validate({ params: IdParams }), async (req, res) => {
  const rid = tenantId(req);
  const session = await prisma.tableSession.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: rid } });
  if (!session) throw notFound('Sessão');
  if (session.status === 'OPEN') {
    const now = new Date();
    await prisma.$transaction([
      prisma.tableSession.update({ where: { id: session.id }, data: { status: 'CLOSED', closedAt: now } }),
      prisma.serviceCall.updateMany({ where: { sessionId: session.id, status: 'OPEN' }, data: { status: 'DONE', doneAt: now, doneById: req.auth!.sub } }),
    ]);
    emitToSession(session.id, 'session:closed', { sessionId: session.id });
    emitToRestaurant(rid, 'table:updated', { tableId: session.tableId });
  }
  const body: CloseSessionResponse = { id: session.id, status: session.status === 'OPEN' ? 'CLOSED' : session.status };
  res.json(body);
});
