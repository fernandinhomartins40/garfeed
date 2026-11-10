import { randomUUID } from 'node:crypto';
import { Router, type Request } from 'express';
import { IdParams, MEDIA_LIMITS, UploadUrlBody, type UploadUrlResponse } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { bucket, minio, presignedPut } from '../../lib/minio';
import { toMedia } from '../../lib/views';
import { mediaQueue } from '../../jobs/queues';
import { validate } from '../../middleware/validate';

/** /media (OWNER, MANAGER) — upload direto para o MinIO por URL pré-assinada; complete → fila do worker. */
export const router = Router();

const EXPIRES_SEC = 15 * 60;
const EXT: Record<string, string> = {
  'video/mp4': 'mp4', 'video/quicktime': 'mov', 'image/jpeg': 'jpg', 'image/png': 'png',
  'image/webp': 'webp', 'image/heic': 'heic', 'image/heif': 'heif',
};

router.post('/upload-url', validate({ body: UploadUrlBody }), async (req, res) => {
  const rid = tenantId(req);
  const b = req.body as UploadUrlBody;
  // pasta própria por mídia: o worker grava os derivados ao lado do original
  const originalKey = `${rid}/${randomUUID()}/original.${EXT[b.mimeType] ?? 'bin'}`;
  const media = await prisma.media.create({ data: { restaurantId: rid, type: b.type, mimeType: b.mimeType, sizeBytes: b.sizeBytes, originalKey } });
  const body: UploadUrlResponse = { mediaId: media.id, uploadUrl: await presignedPut(originalKey, EXPIRES_SEC), expiresInSec: EXPIRES_SEC };
  res.status(201).json(body);
});

const findMedia = async (req: Request) => {
  const m = await prisma.media.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: tenantId(req) } });
  if (!m) throw notFound('Mídia');
  return m;
};

/** A URL pré-assinada não limita o tamanho: conferimos o objeto real antes de enfileirar. */
router.post('/:id/complete', validate({ params: IdParams }), async (req, res) => {
  const m = await findMedia(req);
  if (m.status !== 'UPLOADING') return res.json(toMedia(m));
  const stat = await minio.statObject(bucket, m.originalKey).catch(() => null);
  if (!stat) throw new AppError('VALIDATION', 'O arquivo ainda não foi enviado.');
  if (stat.size > MEDIA_LIMITS[m.type].maxBytes) {
    await minio.removeObject(bucket, m.originalKey);
    const failed = await prisma.media.update({ where: { id: m.id }, data: { status: 'FAILED', error: 'Arquivo maior que o permitido' } });
    return res.json(toMedia(failed));
  }
  const updated = await prisma.media.update({ where: { id: m.id }, data: { status: 'PROCESSING', sizeBytes: stat.size } });
  await mediaQueue.add('process', { mediaId: m.id, restaurantId: m.restaurantId }, { jobId: m.id });
  res.json(toMedia(updated));
});

router.get('/:id', validate({ params: IdParams }), async (req, res) => {
  res.json(toMedia(await findMedia(req)));
});
