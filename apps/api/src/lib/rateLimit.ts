import type { RequestHandler } from 'express';
import { redis } from './redis';
import { AppError } from './errors';

/**
 * Janela fixa no Redis. Chave = sessão da mesa (depois de requireGuest) ou IP — vários celulares no Wi-Fi do
 * restaurante compartilham o IP, então rotas de cliente limitam por sessão. Atrás do Nginx, req.ip vem de X-Forwarded-For.
 */
export const rateLimit = (name: string, max: number, windowSec: number): RequestHandler => async (req, _res, next) => {
  const win = Math.floor(Date.now() / 1000 / windowSec);
  const key = `rl:${name}:${req.guest?.sessionId ?? req.ip}:${win}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, windowSec);
  if (count > max) {
    const retry = (win + 1) * windowSec - Math.floor(Date.now() / 1000);
    throw new AppError('RATE_LIMITED', 'Muitas requisições. Aguarde um instante.', undefined, Math.max(1, retry));
  }
  next();
};
