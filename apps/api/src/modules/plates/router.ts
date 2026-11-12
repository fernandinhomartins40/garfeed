import { Router } from 'express';
import type { PlateDesign as Row } from '@prisma/client';
import { IdParams, PlateDoc, SavePlateDesignBody, type PlateDesign, type PlateDesignSummary } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { validate } from '../../middleware/validate';

/** /plate-designs (OWNER, MANAGER): artes de placa/adesivo do editor. Contrato: api.plateDesigns. */
export const router = Router();

const summary = (d: Row): PlateDesignSummary => ({ id: d.id, name: d.name, widthMm: d.widthMm, heightMm: d.heightMm, updatedAt: d.updatedAt.toISOString() });
const full = (d: Row): PlateDesign => ({ ...summary(d), doc: PlateDoc.parse(d.doc) });
const own = async (id: string, restaurantId: string) => {
  const d = await prisma.plateDesign.findFirst({ where: { id, restaurantId } });
  if (!d) throw notFound('Arte');
  return d;
};

router.get('/', async (req, res) => {
  const rows = await prisma.plateDesign.findMany({ where: { restaurantId: tenantId(req) }, orderBy: { updatedAt: 'desc' } });
  res.json(rows.map(summary));
});

router.get('/:id', validate({ params: IdParams }), async (req, res) => {
  res.json(full(await own((req.params as IdParams).id, tenantId(req))));
});

router.post('/', validate({ body: SavePlateDesignBody }), async (req, res) => {
  const { name, widthMm, heightMm, doc } = req.body as SavePlateDesignBody;
  const d = await prisma.plateDesign.create({ data: { restaurantId: tenantId(req), name, widthMm, heightMm, doc } });
  res.status(201).json(full(d));
});

router.put('/:id', validate({ params: IdParams, body: SavePlateDesignBody }), async (req, res) => {
  const { id } = await own((req.params as IdParams).id, tenantId(req));
  const { name, widthMm, heightMm, doc } = req.body as SavePlateDesignBody;
  res.json(full(await prisma.plateDesign.update({ where: { id }, data: { name, widthMm, heightMm, doc } })));
});

router.delete('/:id', validate({ params: IdParams }), async (req, res) => {
  const { id } = await own((req.params as IdParams).id, tenantId(req));
  await prisma.plateDesign.delete({ where: { id } });
  res.status(204).end();
});
