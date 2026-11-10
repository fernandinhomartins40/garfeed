import { Queue } from 'bullmq';
import { QUEUES, type MediaJobData } from '@garfeed/shared';
import { createRedis } from '../lib/redis';

/** Fila consumida por apps/worker (FFmpeg/sharp). Enfileirar em POST /media/:id/complete. */
export const mediaQueue = new Queue<MediaJobData>(QUEUES.media, {
  connection: createRedis(),
  defaultJobOptions: { attempts: 3, backoff: { type: 'exponential', delay: 10_000 }, removeOnComplete: 1000, removeOnFail: 5000 },
});
// TODO(semana 5/6): fila QUEUES.sessions com job repetível para expirar sessões ociosas (LIMITS.sessionIdleHours).
