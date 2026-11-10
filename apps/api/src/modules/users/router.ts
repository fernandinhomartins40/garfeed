import { Router } from 'express';
import argon2 from 'argon2';
import type { User } from '@prisma/client';
import { CreateUserBody, IdParams, UpdateUserBody, type StaffUser } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { AppError, notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { validate } from '../../middleware/validate';

/** /users (OWNER). Contrato: api.users. O papel é sempre explícito no corpo (nunca OWNER por padrão). */
export const router = Router();

const toStaff = (u: User): StaffUser => ({
  id: u.id, name: u.name, email: u.email, role: u.role, sector: u.sector, active: u.active, lastLoginAt: u.lastLoginAt?.toISOString() ?? null,
});

router.get('/', async (req, res) => {
  const rows = await prisma.user.findMany({ where: { restaurantId: tenantId(req) }, orderBy: { name: 'asc' } });
  res.json(rows.map(toStaff));
});

router.post('/', validate({ body: CreateUserBody }), async (req, res) => {
  const { password, sector, ...b } = req.body as CreateUserBody;
  if (await prisma.user.count({ where: { email: b.email } })) throw new AppError('CONFLICT', 'Este e-mail já está cadastrado');
  const user = await prisma.user.create({
    data: {
      ...b, restaurantId: tenantId(req), passwordHash: await argon2.hash(password),
      sector: b.role === 'KITCHEN' ? (sector ?? 'KITCHEN') : null,
    },
  });
  res.status(201).json(toStaff(user));
});

router.patch('/:id', validate({ params: IdParams, body: UpdateUserBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  const user = await prisma.user.findFirst({ where: { id, restaurantId: tenantId(req) } });
  if (!user) throw notFound('Usuário');
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
      ...(password ? { passwordHash: await argon2.hash(password) } : {}),
    },
  });
  // senha, papel ou desativação: derruba as sessões (o access token vence em 15 min)
  if (password || b.role || b.active === false) await prisma.refreshToken.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
  res.json(toStaff(updated));
});
