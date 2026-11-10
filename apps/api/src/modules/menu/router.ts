import { Router } from 'express';
import { IdParams, UpdateCategoryBody, type Category } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { validate } from '../../middleware/validate';

/** /menu/* (OWNER, MANAGER). Contrato: api.menu em @garfeed/shared. */
export const router = Router();
/** /public/restaurants/:slug/menu — TODO(próximo agente) com cache Redis 60 s. */
export const publicRouter = Router();

const toCategory = (c: { id: string; name: string; position: number; sector: Category['sector']; visible: boolean; _count: { items: number } }): Category => ({
  id: c.id, name: c.name, position: c.position, sector: c.sector, visible: c.visible, itemCount: c._count.items,
});
const withCount = { _count: { select: { items: true } } } as const;

// Rotas-modelo do padrão multi-tenant: restaurantId sempre de tenantId(req).
router.get('/categories', async (req, res) => {
  const rows = await prisma.category.findMany({ where: { restaurantId: tenantId(req) }, orderBy: { position: 'asc' }, include: withCount });
  res.json(rows.map(toCategory));
});

router.patch('/categories/:id', validate({ params: IdParams, body: UpdateCategoryBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  // updateMany com restaurantId no where: nunca altera registro de outro tenant; count 0 → 404
  const { count } = await prisma.category.updateMany({ where: { id, restaurantId: tenantId(req) }, data: req.body as UpdateCategoryBody });
  if (!count) throw notFound('Categoria');
  const row = await prisma.category.findUniqueOrThrow({ where: { id }, include: withCount });
  res.json(toCategory(row));
});

// TODO(próximo agente): demais rotas de api.menu (itens, sold-out + menu:updated, option-groups, import-csv, reorder).
