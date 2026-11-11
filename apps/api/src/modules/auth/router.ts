import { Router, type Response } from 'express';
import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { ForgotPasswordBody, LoginBody, PasswordTokenBody, ResetPasswordBody, type AuthResponse, type PasswordTokenInfo } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError } from '../../lib/errors';
import { ACCESS_TTL_SEC, COOKIES, hashToken, newRefreshToken, refreshCookie, revokeAccessTokens, signAccessToken } from '../../lib/auth';
import { passwordChangedEmail, passwordResetEmail } from '../../lib/emails';
import { sendMail } from '../../lib/mailer';
import { issuePasswordLink } from '../../lib/passwordTokens';
import { rateLimit } from '../../lib/rateLimit';
import { redis } from '../../lib/redis';
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

// ---------- Recuperação de senha e convite (link por e-mail) ----------
const FORGOT_PER_EMAIL_PER_HOUR = 3;

/** Resposta sempre 204: não revela se o e-mail existe. Limite por IP (429) e, em silêncio, por e-mail. */
router.post('/forgot-password', rateLimit('forgot', 5, 15 * 60), validate({ body: ForgotPasswordBody }), async (req, res) => {
  const { email } = req.body as ForgotPasswordBody;
  const key = `rl:forgot-email:${hashToken(email)}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, 3600);
  const user = count <= FORGOT_PER_EMAIL_PER_HOUR ? await prisma.user.findUnique({ where: { email } }) : null;
  // convite ainda não aceito (sem senha) não se recupera por aqui: o dono reenvia o convite
  if (user?.active && user.passwordHash) {
    sendMail({ to: user.email, ...passwordResetEmail({ name: user.name, url: await issuePasswordLink(user.id, 'PASSWORD_RESET') }) });
  }
  res.status(204).end();
});

const invalidLink = () => new AppError('VALIDATION', 'Este link é inválido ou expirou. Peça um novo.');
const tokenLimit = rateLimit('password-token', 30, 15 * 60);

async function findToken(token: string) {
  const t = await prisma.userToken.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: userWithRestaurant } });
  if (!t || t.usedAt || t.expiresAt <= new Date() || !t.user.active) throw invalidLink();
  return t;
}

router.post('/password-token', tokenLimit, validate({ body: PasswordTokenBody }), async (req, res) => {
  const t = await findToken((req.body as PasswordTokenBody).token);
  const body: PasswordTokenInfo = {
    purpose: t.type === 'INVITE' ? 'INVITE' : 'RESET', name: t.user.name, email: t.user.email, restaurantName: t.user.restaurant?.name ?? null,
  };
  res.json(body);
});

router.post('/reset-password', tokenLimit, validate({ body: ResetPasswordBody }), async (req, res) => {
  const { token, password } = req.body as ResetPasswordBody;
  const t = await findToken(token);
  const passwordHash = await argon2.hash(password);
  const now = new Date();
  await prisma.$transaction(async (tx) => {
    // uso único atômico: dois envios simultâneos do mesmo link → só um passa
    const used = await tx.userToken.updateMany({ where: { id: t.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
    if (!used.count) throw invalidLink();
    await tx.user.update({ where: { id: t.userId }, data: { passwordHash } });
    await tx.userToken.deleteMany({ where: { userId: t.userId, usedAt: null } }); // outros links pendentes deixam de valer
    await tx.refreshToken.updateMany({ where: { userId: t.userId, revokedAt: null }, data: { revokedAt: now } });
  });
  await revokeAccessTokens(t.userId);
  if (t.type === 'PASSWORD_RESET') sendMail({ to: t.user.email, ...passwordChangedEmail({ name: t.user.name }) });
  res.status(204).end();
});
