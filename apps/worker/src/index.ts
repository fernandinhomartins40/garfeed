// Consumidor da fila de mídia (FFmpeg/sharp). Ver src/media.ts.
import { UnrecoverableError, Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { pino } from 'pino';
import { QUEUES, type MediaJobData } from '@garfeed/shared';
import { MediaRejected, markFailed, prisma, processMedia } from './media';

const logger = pino({ level: process.env.LOG_LEVEL ?? 'info' });
const connection = new Redis(process.env.REDIS_URL ?? 'redis://localhost:6379', { maxRetriesPerRequest: null });
const cache = connection.duplicate();

const worker = new Worker<MediaJobData>(
  QUEUES.media,
  async (job) => {
    try {
      const r = await processMedia(job.data.mediaId, cache);
      logger.info({ jobId: job.id, mediaId: job.data.mediaId, outputBytes: r?.outputBytes }, 'mídia pronta');
    } catch (err) {
      const rejected = err instanceof MediaRejected;
      // última tentativa (ou arquivo inválido): o painel passa a mostrar "Falhou"
      if (rejected || job.attemptsMade + 1 >= (job.opts.attempts ?? 1)) {
        await markFailed(job.data.mediaId, rejected ? err.message : 'Não foi possível processar o arquivo');
      }
      throw rejected ? new UnrecoverableError(err.message) : err;
    }
  },
  { connection, concurrency: 2 },
);

worker.on('failed', (job, err) => logger.error({ jobId: job?.id, err: err.message }, 'job de mídia falhou'));
logger.info(`worker ouvindo a fila "${QUEUES.media}"`);

const shutdown = async () => {
  await worker.close();
  await Promise.all([connection.quit(), cache.quit(), prisma.$disconnect()]);
  process.exit(0);
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
