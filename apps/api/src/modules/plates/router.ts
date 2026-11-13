import { Router } from 'express';
import type { PlateDesign as Row } from '@prisma/client';
import { hasBranding, IdParams, PlateDoc, SavePlateDesignBody, type PlateBrand, type PlateDesign, type PlateDesignSummary } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { validate } from '../../middleware/validate';
import { bucket, minio, publicUrl } from '../../lib/minio';
import { logger } from '../../lib/logger';

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

/** Logo do restaurante (objeto do próprio restaurante no MinIO) como data URL; null se não der para ler. */
async function logoDataUrl(logoUrl: string, restaurantId: string) {
  const prefix = publicUrl('');
  if (!logoUrl.startsWith(prefix)) return null;
  const key = logoUrl.slice(prefix.length);
  if (!key.startsWith(`${restaurantId}/`)) return null; // só arquivos do próprio restaurante
  try {
    const st = await minio.statObject(bucket, key);
    if (st.size > 800_000) return null;
    const chunks: Buffer[] = [];
    for await (const c of await minio.getObject(bucket, key)) chunks.push(c as Buffer);
    const type = String(st.metaData['content-type'] ?? 'image/webp');
    return /^image\/(png|jpeg|webp)$/.test(type) ? `data:${type};base64,${Buffer.concat(chunks).toString('base64')}` : null;
  } catch (err) {
    logger.warn({ err, restaurantId }, 'kit da marca: logo indisponível');
    return null;
  }
}

/** Kit da marca do editor: cores e logo do restaurante (só com marca própria). */
router.get('/brand', async (req, res) => {
  const rid = tenantId(req);
  const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: rid } });
  const enabled = hasBranding(r.plan, r.status);
  const body: PlateBrand = {
    enabled, name: r.name,
    accent: enabled ? r.accentColor : null, dark: enabled ? r.darkColor : null,
    logo: enabled && r.logoUrl ? await logoDataUrl(r.logoUrl, rid) : null,
  };
  res.json(body);
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
