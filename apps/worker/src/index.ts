// Consumidor da fila de mídia. Processamento real (FFmpeg 720×1280 H.264 ~1,5 Mbps faststart + pôster JPG
// + miniatura WebP; sharp para imagens) fica para a semana 2 — ver PRD RF-16.
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { QUEUES, type MediaJobData } from '@garfeed/shared';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });

const worker = new Worker<MediaJobData>(
  QUEUES.media,
  async (job) => {
    logger.info({ jobId: job.id, ...job.data }, 'mídia recebida');
    // TODO(semana 2): baixar originalKey do MinIO → ffmpeg/sharp → subir derivados → Media READY (ou FAILED com error).
    throw new Error('Processamento de mídia ainda não implementado');
  },
  { connection, concurrency: 2 },
);

worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de mídia falhou'));
logger.info(`worker ouvindo a fila "${QUEUES.media}"`);

const shutdown = async () => {
  await worker.close();
  await connection.quit();
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
