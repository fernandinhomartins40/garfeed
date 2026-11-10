import express, { Router, type RequestHandler } from 'express';
import { EventsBody } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { requireGuest } from '../../lib/auth';
import { openGuestSession } from '../../lib/guest';
import { rateLimit } from '../../lib/rateLimit';
import { AppError } from '../../lib/errors';
import { validate } from '../../middleware/validate';

/** /public/events (requireGuest) — lote de eventos RF-27. Sem dados pessoais. */
export const publicRouter = Router();

const DAY = 86_400_000;

/** sendBeacon envia o JSON como text/plain (evita preflight): converte e segue para o mesmo schema. */
const textJson: RequestHandler = (req, _res, next) => {
  if (typeof req.body === 'string') {
    try { req.body = JSON.parse(req.body); } catch { throw new AppError('VALIDATION', 'JSON inválido'); }
  }
  next();
};

publicRouter.post('/events', express.text({ type: 'text/plain', limit: '256kb' }), textJson, requireGuest, rateLimit('events', 30, 60), validate({ body: EventsBody }), async (req, res) => {
  const session = await openGuestSession(req);
  const rid = session.restaurantId;
  const { events } = req.body as EventsBody;
  // ids de outro restaurante (ou inventados) são descartados para não sujar os relatórios
  const [items, cats] = await Promise.all([
    prisma.item.findMany({ where: { restaurantId: rid, id: { in: events.flatMap((e) => e.itemId ?? []) } }, select: { id: true } }),
    prisma.category.findMany({ where: { restaurantId: rid, id: { in: events.flatMap((e) => e.categoryId ?? []) } }, select: { id: true } }),
  ]);
  const itemIds = new Set(items.map((i) => i.id));
  const catIds = new Set(cats.map((c) => c.id));
  const now = Date.now();
  const data = events
    .filter((e) => (!e.itemId || itemIds.has(e.itemId)) && (!e.categoryId || catIds.has(e.categoryId)))
    .map((e) => {
      const at = e.at ? Date.parse(e.at) : NaN;
      // relógio do celular não é confiável: fora de [agora-24h, agora] usa a hora do servidor
      const createdAt = new Date(Number.isFinite(at) && at <= now && at > now - DAY ? at : now);
      return { restaurantId: rid, sessionId: session.id, type: e.type, itemId: e.itemId, categoryId: e.categoryId, value: e.value, createdAt };
    });
  if (data.length) await prisma.event.createMany({ data });
  await prisma.tableSession.update({ where: { id: session.id }, data: { lastActivityAt: new Date() } });
  res.status(204).end();
});
