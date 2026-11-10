import { Redis } from 'ioredis';
import { env } from './env';

/** Conexão geral (cache, rate limit). Para pub/sub e BullMQ crie conexões próprias com `createRedis()`. */
export const redis = createRedis();

export function createRedis() {
  // maxRetriesPerRequest: null é exigido pelo BullMQ; inofensivo para o resto
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, lazyConnect: true });
}
