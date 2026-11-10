import { Router, type Response } from 'express';
import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { LoginBody, type AuthResponse } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { ACCESS_TTL_SEC, COOKIES, hashToken, newRefreshToken, refreshCookie, signAccessToken } from '../../lib/auth';
import { validate } from '../../middleware/validate';

export const router = Router();

const invalid = () => new AppError('UNAUTHORIZED', 'E-mail ou senha incorretos.');
const userWithRestaurant = { include: { restaurant: true } } as const;
type UserRow = Prisma.UserGetPayload<typeof userWithRestaurant>;

// Hash fixo para gastar o mesmo tempo quando o e-mail não existe (evita enumeração de usuários).
const dummyHash = argon2.hash('senha-inexistente');

async function issueSession(res: Response, user: UserRow): Promise<AuthResponse> {
  const token = newRefreshToken();
  await prisma.refreshToken.create({
    data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + env.REFRESH_TOKEN_DAYS * 86_400_000) },
  });
  res.cookie(COOKIES.refresh, token, refreshCookie);
  const r = user.restaurant;
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role, restaurantId: user.restaurantId, sector: user.sector }),
    expiresInSec: ACCESS_TTL_SEC,
    user: { id: user.id, name: user.name, email: user.email, role: user.role, restaurantId: user.restaurantId, sector: user.sector },
    restaurant: r && { id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, plan: r.plan, status: r.status },
  };
}

router.post('/login', validate({ body: LoginBody }), async (req, res) => {
  const { email, password } = req.body as LoginBody;
  const user = await prisma.user.findUnique({ where: { email }, ...userWithRestaurant });
  const ok = await argon2.verify(user?.passwordHash ?? (await dummyHash), password);
  if (!user || !ok || !user.active) throw invalid();
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json(await issueSession(res, user));
});

/** Rotação: o refresh usado é revogado e um novo é emitido. */
router.post('/refresh', async (req, res) => {
  const token: unknown = req.cookies?.[COOKIES.refresh];
  if (typeof token !== 'string') throw new AppError('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  const now = new Date();
  // updateMany condicional = revogação atômica; dois refresh simultâneos com o mesmo token → só um passa
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash: hashToken(token) } });
  const revoked = stored && (await prisma.refreshToken.updateMany({
    where: { id: stored.id, revokedAt: null, expiresAt: { gt: now } },
    data: { revokedAt: now },
  }));
  if (!stored || !revoked?.count) {
    res.clearCookie(COOKIES.refresh, refreshCookie);
    throw new AppError('UNAUTHORIZED', 'Sessão expirada. Entre novamente.');
  }
  const user = await prisma.user.findUnique({ where: { id: stored.userId }, ...userWithRestaurant });
  if (!user?.active) throw new AppError('UNAUTHORIZED', 'Usuário desativado.');
  res.json(await issueSession(res, user));
});

router.post('/logout', async (req, res) => {
  const token: unknown = req.cookies?.[COOKIES.refresh];
  if (typeof token === 'string') {
    await prisma.refreshToken.updateMany({ where: { tokenHash: hashToken(token), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  res.clearCookie(COOKIES.refresh, refreshCookie);
  res.status(204).end();
});
