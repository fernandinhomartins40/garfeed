import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CodeParams, COOKIES, LinkTagBody, type SessionJoinResponse, type Tag, type TagResolveResponse,
} from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { guestCookie, signGuestToken, tenantId } from '../../lib/auth';
import { toPublicRestaurant } from '../../lib/restaurant';
import { tableRef } from '../../lib/views';
import { SESSION_IDLE_MS } from '../../lib/guest';
import { emitToRestaurant } from '../../realtime/io';
import { validate } from '../../middleware/validate';

/** /tags (OWNER, MANAGER). Contrato: api.tags. */
export const router = Router();
/** /public/tags/:code e /public/tags/:code/session. Contrato: api.public. */
export const publicRouter = Router();

const tagInclude = { table: true, restaurant: true } as const;
type TagRow = Prisma.TagGetPayload<{ include: { table: true } }>;
const toTag = (t: TagRow): Tag => ({
  code: t.code, status: t.status, table: t.table && tableRef(t.table),
  activatedAt: t.activatedAt?.toISOString() ?? null, lastReadAt: t.lastReadAt?.toISOString() ?? null,
});

// ---------- Público ----------
/** Placa utilizável = ACTIVE, com mesa ativa e restaurante. */
async function usableTag(code: string) {
  const tag = await prisma.tag.findUnique({ where: { code }, include: tagInclude });
  if (!tag) throw notFound('Placa');
  const ok = tag.status === 'ACTIVE' && tag.table?.active && tag.restaurant;
  return { tag, ok: !!ok };
}

publicRouter.get('/tags/:code', validate({ params: CodeParams }), async (req, res) => {
  const { tag, ok } = await usableTag((req.params as CodeParams).code);
  await prisma.tag.update({ where: { id: tag.id }, data: { lastReadAt: new Date() } });
  const r = ok ? toPublicRestaurant(tag.restaurant!) : null;
  const body: TagResolveResponse = {
    code: tag.code,
    status: tag.status,
    restaurant: r && { id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, accentColor: r.accentColor, isOpen: r.isOpen, canOrder: r.canOrder },
    table: ok ? tableRef(tag.table!) : null,
  };
  res.json(body);
});

/** Sessão OPEN da mesa (reaproveita; expira a ociosa; cria se não houver). O índice parcial impede duas OPEN. */
async function openSessionFor(restaurantId: string, tableId: string) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const open = await prisma.tableSession.findFirst({ where: { tableId, restaurantId, status: 'OPEN' } });
    if (open && Date.now() - open.lastActivityAt.getTime() > SESSION_IDLE_MS) {
      await prisma.tableSession.updateMany({ where: { id: open.id, status: 'OPEN' }, data: { status: 'EXPIRED', closedAt: new Date() } });
      continue;
    }
    if (open) {
      // mesmo celular voltando ou outro celular da mesa: mesma sessão
      return { session: await prisma.tableSession.update({ where: { id: open.id }, data: { lastActivityAt: new Date() } }), created: false };
    }
    try {
      return { session: await prisma.tableSession.create({ data: { restaurantId, tableId } }), created: true };
    } catch (err) {
      if ((err as { code?: string }).code !== 'P2002') throw err; // corrida: outro celular criou ao mesmo tempo
    }
  }
  throw new AppError('CONFLICT', 'Não foi possível abrir a mesa. Tente novamente.');
}

publicRouter.post('/tags/:code/session', validate({ params: CodeParams }), async (req, res) => {
  const { tag, ok } = await usableTag((req.params as CodeParams).code);
  if (tag.status === 'BLOCKED') throw new AppError('TAG_BLOCKED', 'Esta placa foi bloqueada. Chame o garçom.');
  if (!ok) throw new AppError('TAG_NOT_ACTIVE', 'Esta mesa ainda não foi ativada.');
  const table = tag.table!;
  const restaurant = tag.restaurant!;
  const { session, created } = await openSessionFor(restaurant.id, table.id);
  res.cookie(COOKIES.guest, signGuestToken({ sessionId: session.id, restaurantId: restaurant.id, tableId: table.id }), guestCookie);
  if (created) emitToRestaurant(restaurant.id, 'table:updated', { tableId: table.id });
  const body: SessionJoinResponse = {
    session: { id: session.id, openedAt: session.openedAt.toISOString() },
    restaurant: toPublicRestaurant(restaurant),
    table: tableRef(table),
  };
  res.json(body);
});

// ---------- Painel ----------
router.get('/', async (req, res) => {
  const rows = await prisma.tag.findMany({ where: { restaurantId: tenantId(req) }, include: { table: true }, orderBy: { code: 'asc' } });
  res.json(rows.map(toTag));
});

/** Placa do próprio restaurante ou sem dono; de outro restaurante → 404 (não revela existência). */
const findLinkable = (code: string, restaurantId: string) =>
  prisma.tag.findFirst({ where: { code, OR: [{ restaurantId }, { restaurantId: null }] }, include: { table: true } });

router.get('/:code', validate({ params: CodeParams }), async (req, res) => {
  const tag = await findLinkable((req.params as CodeParams).code, tenantId(req));
  if (!tag) throw notFound('Placa');
  res.json(toTag(tag));
});

router.post('/link', validate({ body: LinkTagBody }), async (req, res) => {
  const rid = tenantId(req);
  const { code, tableId, confirm } = req.body as LinkTagBody;
  const [tag, table] = await Promise.all([
    findLinkable(code, rid),
    prisma.table.findFirst({ where: { id: tableId, restaurantId: rid }, include: { tag: true } }),
  ]);
  if (!tag) throw notFound('Placa');
  if (!table) throw notFound('Mesa');
  if (tag.status === 'BLOCKED') throw new AppError('TAG_BLOCKED', 'Esta placa está bloqueada e não pode ser vinculada.');
  if (tag.tableId === table.id) return res.json(toTag(tag));
  if (tag.status === 'ACTIVE' && tag.table && !confirm) {
    throw new AppError('CONFLICT', `Esta placa já está vinculada à ${tag.table.name}. Confirme para mover.`, { table: tableRef(tag.table) });
  }
  const updated = await prisma.$transaction(async (tx) => {
    // a mesa troca de placa: a anterior fica solta (continua do restaurante)
    if (table.tag) await tx.tag.update({ where: { id: table.tag.id }, data: { status: 'UNASSIGNED', tableId: null } });
    return tx.tag.update({
      where: { id: tag.id },
      data: { status: 'ACTIVE', restaurantId: rid, tableId: table.id, activatedAt: new Date() },
      include: { table: true },
    });
  });
  emitToRestaurant(rid, 'table:updated', { tableId: table.id });
  if (tag.tableId) emitToRestaurant(rid, 'table:updated', { tableId: tag.tableId });
  res.json(toTag(updated));
});

async function setOwnTag(req: Request, data: Prisma.TagUpdateInput) {
  const rid = tenantId(req);
  const tag = await prisma.tag.findFirst({ where: { code: (req.params as CodeParams).code, restaurantId: rid } });
  if (!tag) throw notFound('Placa');
  const updated = await prisma.tag.update({ where: { id: tag.id }, data, include: { table: true } });
  if (tag.tableId) emitToRestaurant(rid, 'table:updated', { tableId: tag.tableId });
  return toTag(updated);
}

router.post('/:code/unlink', validate({ params: CodeParams }), async (req, res) => {
  res.json(await setOwnTag(req, { status: 'UNASSIGNED', table: { disconnect: true } }));
});

/** Placa perdida: bloqueia e solta da mesa. Leituras passam a responder "bloqueada". */
router.post('/:code/block', validate({ params: CodeParams }), async (req, res) => {
  res.json(await setOwnTag(req, { status: 'BLOCKED', table: { disconnect: true } }));
});
