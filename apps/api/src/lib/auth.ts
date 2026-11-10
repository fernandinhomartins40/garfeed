import { createHash, randomBytes } from 'node:crypto';
import type { CookieOptions, Request, RequestHandler } from 'express';
import jwt from 'jsonwebtoken';
import { AccessTokenPayload, COOKIES, LIMITS, type Role } from '@garfeed/shared';
import { env, isProd } from './env';
import { AppError } from './errors';

export type GuestTokenPayload = { sessionId: string; restaurantId: string; tableId: string };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: AccessTokenPayload;
      guest?: GuestTokenPayload;
    }
  }
}

// ---------- JWT de acesso (painel) ----------
export const ACCESS_TTL_SEC = LIMITS.accessTokenMinutes * 60;

export const signAccessToken = (p: AccessTokenPayload) =>
  jwt.sign(p, env.JWT_ACCESS_SECRET, { expiresIn: ACCESS_TTL_SEC, algorithm: 'HS256' });

export function verifyAccessToken(token: string): AccessTokenPayload {
  try {
    return AccessTokenPayload.parse(jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] }));
  } catch {
    throw new AppError('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  }
}

// ---------- Refresh token (cookie httpOnly; só o hash vai para o banco) ----------
export const newRefreshToken = () => randomBytes(32).toString('base64url');
export const hashToken = (t: string) => createHash('sha256').update(t).digest('hex');

const baseCookie: CookieOptions = { httpOnly: true, secure: isProd, sameSite: 'lax', domain: env.COOKIE_DOMAIN };
export const refreshCookie: CookieOptions = { ...baseCookie, path: '/auth', maxAge: env.REFRESH_TOKEN_DAYS * 86_400_000 };
export const guestCookie: CookieOptions = { ...baseCookie, path: '/', maxAge: LIMITS.guestTokenHours * 3_600_000 };
export { COOKIES };

// ---------- guestToken (cliente anônimo) ----------
export const signGuestToken = (p: GuestTokenPayload) =>
  jwt.sign(p, env.GUEST_TOKEN_SECRET, { expiresIn: LIMITS.guestTokenHours * 3600, algorithm: 'HS256' });

export function verifyGuestToken(token: string): GuestTokenPayload {
  try {
    const p = jwt.verify(token, env.GUEST_TOKEN_SECRET, { algorithms: ['HS256'] }) as GuestTokenPayload;
    return { sessionId: p.sessionId, restaurantId: p.restaurantId, tableId: p.tableId };
  } catch {
    throw new AppError('UNAUTHORIZED', 'Sessão da mesa expirada. Aproxime o celular da placa novamente.');
  }
}

// ---------- Middlewares ----------
export const requireAuth: RequestHandler = (req, _res, next) => {
  const [scheme, token] = (req.headers.authorization ?? '').split(' ');
  if (scheme !== 'Bearer' || !token) throw new AppError('UNAUTHORIZED', 'Faça login para continuar.');
  req.auth = verifyAccessToken(token);
  next();
};

/** Use depois de requireAuth. */
export const requireRole = (...roles: readonly Role[]): RequestHandler => (req, _res, next) => {
  if (!req.auth || !roles.includes(req.auth.role)) throw new AppError('FORBIDDEN', 'Você não tem permissão para isso.');
  next();
};

/**
 * Valida o cookie guestToken. O status da sessão (OPEN) é responsabilidade da rota,
 * porque a mesa pode ter sido fechada depois que o token foi emitido.
 */
export const requireGuest: RequestHandler = (req, _res, next) => {
  const token: unknown = req.cookies?.[COOKIES.guest];
  if (typeof token !== 'string') throw new AppError('UNAUTHORIZED', 'Aproxime o celular da placa da mesa para pedir.');
  req.guest = verifyGuestToken(token);
  next();
};

/**
 * Multi-tenant: o restaurantId de TODA query de negócio vem daqui (token), nunca do corpo/query.
 * Padrão: prisma.x.findFirst({ where: { id, restaurantId: tenantId(req) } }) — nunca findUnique só por id.
 */
export function tenantId(req: Request): string {
  const id = req.auth?.restaurantId;
  if (!id) throw new AppError('FORBIDDEN', 'Usuário sem restaurante vinculado.');
  return id;
}
