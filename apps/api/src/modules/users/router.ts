import { Router, type Request } from 'express';
import argon2 from 'argon2';
import type { Prisma } from '@prisma/client';
import { CreateUserBody, IdParams, UpdateUserBody, type StaffUser } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError, notFound } from '../../lib/errors';
import { revokeAccessTokens, tenantId } from '../../lib/auth';
import { accountStatusEmail, inviteEmail, passwordChangedEmail } from '../../lib/emails';
import { sendMail } from '../../lib/mailer';
import { issuePasswordLink } from '../../lib/passwordTokens';
import { rateLimit } from '../../lib/rateLimit';
import { validate } from '../../middleware/validate';

/** /users (OWNER). Contrato: api.users. O papel é sempre explícito no corpo (nunca OWNER por padrão). */
export const router = Router();

// convite pendente = usuário sem senha; o link (se ainda existir e não tiver vencido) diz se está pendente ou expirado
const withInvite = { include: { tokens: { where: { type: 'INVITE', usedAt: null }, select: { expiresAt: true } } } } as const;
type UserRow = Prisma.UserGetPayload<typeof withInvite>;

const toStaff = (u: UserRow): StaffUser => ({
  id: u.id, name: u.name, email: u.email, role: u.role, sector: u.sector, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
  invite: u.passwordHash ? null : u.tokens.some((t) => t.expiresAt > new Date()) ? 'PENDING' : 'EXPIRED',
});

/** Usuário do restaurante do token (multi-tenant) ou 404. */
async function findUser(req: Request, id: string) {
  const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId(req) }, ...withInvite });
  if (!user) throw notFound('Usuário');
  return user;
}

/** Gera um novo link (7 dias; o anterior deixa de valer), envia o convite e devolve o usuário já como "pendente". */
async function invite(req: Request, userId: string) {
  const inviter = await prisma.user.findUniqueOrThrow({ where: { id: req.auth!.sub }, include: { restaurant: true } });
  const url = await issuePasswordLink(userId, 'INVITE');
  const user = await findUser(req, userId);
  sendMail({ to: user.email, ...inviteEmail({ name: user.name, restaurantName: inviter.restaurant!.name, inviterName: inviter.name, role: user.role, url }) });
  return toStaff(user);
}

router.get('/', async (req, res) => {
  const rows = await prisma.user.findMany({ where: { restaurantId: tenantId(req) }, orderBy: { name: 'asc' }, ...withInvite });
  res.json(rows.map(toStaff));
});

/** Sem `password` = convite por e-mail (a pessoa define a senha pelo link). Com `password` = acesso criado na hora. */
router.post('/', validate({ body: CreateUserBody }), async (req, res) => {
  const { password, sector, ...b } = req.body as CreateUserBody;
  if (await prisma.user.count({ where: { email: b.email } })) throw new AppError('CONFLICT', 'Este e-mail já está cadastrado');
  const user = await prisma.user.create({
    data: {
      ...b, restaurantId: tenantId(req), passwordHash: password ? await argon2.hash(password) : null,
      sector: b.role === 'KITCHEN' ? (sector ?? 'KITCHEN') : null,
    },
    ...withInvite,
  });
  res.status(201).json(password ? toStaff(user) : await invite(req, user.id));
});

const pendingOnly = (user: UserRow) => {
  if (user.passwordHash) throw new AppError('CONFLICT', 'Esta pessoa já aceitou o convite');
};

router.post('/:id/invite', rateLimit('invite', 30, 3600), validate({ params: IdParams }), async (req, res) => {
  const user = await findUser(req, (req.params as IdParams).id);
  pendingOnly(user);
  if (!user.active) throw new AppError('VALIDATION', 'Reative o acesso antes de reenviar o convite');
  res.json(await invite(req, user.id));
});

/** Cancelar convite = apagar o usuário que nunca definiu senha (não há histórico a preservar). */
router.delete('/:id/invite', validate({ params: IdParams }), async (req, res) => {
  const user = await findUser(req, (req.params as IdParams).id);
  pendingOnly(user);
  await prisma.user.delete({ where: { id: user.id } });
  res.status(204).end();
});

router.patch('/:id', validate({ params: IdParams, body: UpdateUserBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  const user = await findUser(req, id);
  const { password, sector, ...b } = req.body as UpdateUserBody;
  if (id === req.auth!.sub && (b.active === false || (b.role && b.role !== 'OWNER'))) {
    throw new AppError('VALIDATION', 'Você não pode remover o seu próprio acesso de dono');
  }
  const role = b.role ?? user.role;
  const updated = await prisma.user.update({
    where: { id },
    data: {
      ...b,
      sector: role === 'KITCHEN' ? (sector ?? user.sector ?? 'KITCHEN') : null,
      // senha definida pelo dono: links pendentes (convite/recuperação) deixam de valer
      ...(password ? { passwordHash: await argon2.hash(password), tokens: { deleteMany: {} } } : {}),
    },
    ...withInvite,
  });
  // senha, papel ou desativação: derruba as sessões (refresh no banco; access tokens já emitidos via Redis)
  if (password || b.role || b.active === false) {
    await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await revokeAccessTokens(id);
  }
  // avisos por e-mail; quem ainda não aceitou o convite não tem acesso para ser avisado
  if (password && user.passwordHash) sendMail({ to: user.email, ...passwordChangedEmail({ name: updated.name }) });
  if (b.active !== undefined && b.active !== user.active && updated.passwordHash) {
    const restaurant = await prisma.restaurant.findUniqueOrThrow({ where: { id: tenantId(req) } });
    sendMail({ to: user.email, ...accountStatusEmail({ name: updated.name, restaurantName: restaurant.name, active: b.active, loginUrl: `${env.PAINEL_URL}/login` }) });
  }
  res.json(toStaff(updated));
});
