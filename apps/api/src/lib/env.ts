import { z } from 'zod';

const Env = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  LOG_LEVEL: z.string().default('info'),
  API_PORT: z.coerce.number().int().default(3000),
  CORS_ORIGINS: z.string().default('http://localhost:5173,http://localhost:5174').transform((s) => s.split(',').map((o) => o.trim()).filter(Boolean)),
  COOKIE_DOMAIN: z.string().optional().transform((s) => s || undefined),
  JWT_ACCESS_SECRET: z.string().min(32),
  GUEST_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_DAYS: z.coerce.number().int().positive().default(30),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  MINIO_ENDPOINT: z.string().default('localhost'),
  MINIO_PORT: z.coerce.number().int().default(9000),
  MINIO_USE_SSL: z.stringbool().default(false),
  MINIO_ROOT_USER: z.string().min(1),
  MINIO_ROOT_PASSWORD: z.string().min(1),
  MINIO_BUCKET: z.string().default('garfeed-media'),
  MEDIA_PUBLIC_URL: z.string().min(1),
  TAG_BASE_URL: z.string().default('https://g.garfeed.com.br'),
  // Web Push: vazio = push desligado (o resto funciona normalmente)
  VAPID_PUBLIC_KEY: z.string().optional().transform((s) => s || undefined),
  VAPID_PRIVATE_KEY: z.string().optional().transform((s) => s || undefined),
  VAPID_SUBJECT: z.string().default('mailto:contato@garfeed.com.br'),
  /** Requisições por minuto por IP nas rotas /public (o Wi-Fi do restaurante soma todos os celulares). */
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
});

export const env = Env.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
