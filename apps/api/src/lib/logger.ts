import { pino } from 'pino';
import { env } from './env';

export const logger = pino({
  level: env.NODE_ENV === 'test' ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'req.headers["asaas-access-token"]', 'res.headers["set-cookie"]', '*.password', '*.passwordHash'],
});
