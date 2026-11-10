import { Router } from 'express';
import type { Prisma } from '@prisma/client';
import { BulkTablesBody, CreateTableBody, IdParams, ROLES, UpdateTableBody, type Table, type TableStatus } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { requireRole, tenantId } from '../../lib/auth';
import { sessionTotal } from '../../lib/views';
import { validate } from '../../middleware/validate';

/** /tables (leitura: OPERATE; escrita: MANAGE). Contrato: api.tables. */
export const router = Router();
const manage = requireRole(...ROLES.MANAGE);

const tableInclude = {
  tag: true,
  sessions: {
    where: { status: 'OPEN' },
    include: { orders: { select: { status: true, totalCents: true } }, calls: { where: { status: 'OPEN' }, select: { type: true } } },
  },
} satisfies Prisma.TableInclude;
type TableRow = Prisma.TableGetPayload<{ include: typeof tableInclude }>;

function toTable(t: TableRow): Table {
  const s = t.sessions[0];
  // prioridade do mapa de mesas: conta > garçom > pedido pendente > ocupada > livre
  const status: TableStatus = !s ? 'FREE'
    : s.calls.some((c) => c.type === 'BILL') ? 'BILL'
      : s.calls.length ? 'CALLING'
        : s.orders.some((o) => o.status === 'PENDING') ? 'PENDING_ORDER' : 'OCCUPIED';
  return {
    id: t.id, name: t.name, area: t.area, active: t.active,
    tag: t.tag && { code: t.tag.code, status: t.tag.status },
    status,
    session: s ? { id: s.id, openedAt: s.openedAt.toISOString(), totalCents: sessionTotal(s.orders) } : null,
  };
}

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, 'pt-BR', { numeric: true });

router.get('/', async (req, res) => {
  const rows = await prisma.table.findMany({ where: { restaurantId: tenantId(req) }, include: tableInclude });
  res.json(rows.sort(byName).map(toTable));
});

const nameTaken = () => new AppError('CONFLICT', 'Já existe uma mesa com esse nome');

router.post('/', manage, validate({ body: CreateTableBody }), async (req, res) => {
  const rid = tenantId(req);
  const b = req.body as CreateTableBody;
  if (await prisma.table.count({ where: { restaurantId: rid, name: b.name } })) throw nameTaken();
  const row = await prisma.table.create({ data: { restaurantId: rid, name: b.name, area: b.area ?? null }, include: tableInclude });
  res.status(201).json(toTable(row));
});

/** "Mesa 1".."Mesa 20"; nomes já existentes vão para skipped. */
router.post('/bulk', manage, validate({ body: BulkTablesBody }), async (req, res) => {
  const rid = tenantId(req);
  const { prefix, from, to, area } = req.body as BulkTablesBody;
  const names = Array.from({ length: to - from + 1 }, (_, i) => `${prefix} ${from + i}`);
  const existing = new Set((await prisma.table.findMany({ where: { restaurantId: rid, name: { in: names } }, select: { name: true } })).map((t) => t.name));
  const toCreate = names.filter((n) => !existing.has(n));
  await prisma.table.createMany({ data: toCreate.map((name) => ({ restaurantId: rid, name, area: area ?? null })), skipDuplicates: true });
  const created = await prisma.table.findMany({ where: { restaurantId: rid, name: { in: toCreate } }, include: tableInclude });
  res.status(201).json({ created: created.sort(byName).map(toTable), skipped: names.filter((n) => existing.has(n)) });
});

router.patch('/:id', manage, validate({ params: IdParams, body: UpdateTableBody }), async (req, res) => {
  const rid = tenantId(req);
  const { id } = req.params as IdParams;
  const b = req.body as UpdateTableBody;
  if (b.name && (await prisma.table.count({ where: { restaurantId: rid, name: b.name, id: { not: id } } }))) throw nameTaken();
  const { count } = await prisma.table.updateMany({ where: { id, restaurantId: rid }, data: b });
  if (!count) throw notFound('Mesa');
  res.json(toTable(await prisma.table.findUniqueOrThrow({ where: { id }, include: tableInclude })));
});

/** Mesa com histórico de pedidos não é excluída (o cascade apagaria os pedidos): desative. */
router.delete('/:id', manage, validate({ params: IdParams }), async (req, res) => {
  const rid = tenantId(req);
  const table = await prisma.table.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: rid }, include: { _count: { select: { orders: true } } } });
  if (!table) throw notFound('Mesa');
  if (table._count.orders) throw new AppError('CONFLICT', 'Esta mesa tem pedidos registrados; desative-a em vez de excluir');
  await prisma.$transaction([
    prisma.tag.updateMany({ where: { tableId: table.id }, data: { status: 'UNASSIGNED', tableId: null } }),
    prisma.table.delete({ where: { id: table.id } }),
  ]);
  res.status(204).end();
});
