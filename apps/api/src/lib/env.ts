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
  // Push nativo iOS (APNs direto, sem Firebase): faltando qualquer uma das quatro primeiras = desligado
  APNS_KEY_ID: z.string().optional().transform((s) => s || undefined),
  APNS_TEAM_ID: z.string().optional().transform((s) => s || undefined),
  /** Conteúdo do AuthKey_XXXX.p8: em base64 (uma linha) ou o PEM com \n literais. */
  APNS_KEY_P8: z.string().optional().transform((s) => (!s ? undefined : s.includes('BEGIN') ? s.replace(/\\n/g, '\n') : Buffer.from(s, 'base64').toString('utf8'))),
  APNS_BUNDLE_ID: z.string().optional().transform((s) => s || undefined),
  /** true = api.push.apple.com (TestFlight e App Store); false = sandbox (build de desenvolvimento pelo Xcode). */
  APNS_PRODUCTION: z.stringbool().default(true),

  // E-mail transacional pelo Velomail (docs/EMAILS.md). Sem VELOMAIL_API_KEY = não envia; em dev o e-mail (com o link) vai para o log.
  VELOMAIL_API_URL: z.string().default('https://www.velomail.com.br/api/emails/send'),
  VELOMAIL_API_KEY: z.string().optional().transform((s) => s || undefined),
  MAIL_FROM: z.string().default('nao-responda@garfeed.com.br'),
  MAIL_REPLY_TO: z.string().default('contato@garfeed.com.br'),
  /** Base dos links dos e-mails (definir senha, login). */
  PAINEL_URL: z.string().default('http://localhost:5173').transform((s) => s.replace(/\/+$/, '')),
  /** Requisições por minuto por IP nas rotas /public (o Wi-Fi do restaurante soma todos os celulares). */
  PUBLIC_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(600),
  // Cobrança da assinatura (Asaas): sem ASAAS_API_KEY = cobrança desligada. URL vazia = sandbox fora de produção.
  ASAAS_API_URL: z.string().optional().transform((s) => s?.replace(/\/+$/, '') || undefined),
  ASAAS_API_KEY: z.string().optional().transform((s) => s || undefined),
  /** Token que o Asaas envia no header asaas-access-token (32 a 255 caracteres, exigência do Asaas). */
  ASAAS_WEBHOOK_TOKEN: z.string().optional().transform((s) => s || undefined).pipe(z.string().min(32).max(255).optional()),
  /** Dias de tolerância depois do vencimento antes de suspender o restaurante. */
  BILLING_GRACE_DAYS: z.coerce.number().int().min(0).default(7),
});

export const env = Env.parse(process.env);
export const isProd = env.NODE_ENV === 'production';
