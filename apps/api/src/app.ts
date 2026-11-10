import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './lib/env';
import { logger } from './lib/logger';
import { errorHandler, notFoundHandler } from './lib/errors';
import { routes } from './modules';

/** App sem listen — usado pelo servidor (index.ts) e pelos testes (supertest). */
export function createApp() {
  const app = express();
  app.set('trust proxy', 1); // atrás do Nginx
  app.disable('x-powered-by');
  app.use(pinoHttp({ logger }));
  app.use(cors({ origin: env.CORS_ORIGINS, credentials: true }));
  app.use(express.json({ limit: '2mb' }));
  app.use(cookieParser());
  app.get('/health', (_req, res) => { res.json({ ok: true }); });
  app.use(routes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
