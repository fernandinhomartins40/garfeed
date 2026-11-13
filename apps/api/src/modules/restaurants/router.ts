import { Router } from 'express';
import argon2 from 'argon2';
import { Prisma, type Restaurant } from '@prisma/client';
import { DeleteAccountBody, OpeningHours, UpdateSettingsBody, type Settings } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { COOKIES, refreshCookie, revokeAccessTokens, tenantId } from '../../lib/auth';
import { asaas } from '../../lib/asaas';
import { AppError } from '../../lib/errors';
import { logger } from '../../lib/logger';
import { bucket, minio } from '../../lib/minio';
import { menuChanged } from '../../lib/menuCache';
import { rateLimit } from '../../lib/rateLimit';
import { validate } from '../../middleware/validate';

/** /settings (OWNER). Contrato: api.settings. */
export const router = Router();

const toSettings = (r: Restaurant): Settings => ({
  id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, accentColor: r.accentColor, darkColor: r.darkColor, plan: r.plan, status: r.status,
  requireConfirmation: r.requireConfirmation, soundEnabled: r.soundEnabled, timezone: r.timezone,
  openingHours: OpeningHours.safeParse(r.openingHours).data ?? null,
  wifiName: r.wifiName, wifiPassword: r.wifiPassword, instagram: r.instagram, googleReviewUrl: r.googleReviewUrl,
});

router.get('/', async (req, res) => {
  res.json(toSettings(await prisma.restaurant.findUniqueOrThrow({ where: { id: tenantId(req) } })));
});

router.patch('/', validate({ body: UpdateSettingsBody }), async (req, res) => {
  const rid = tenantId(req);
  const { openingHours, ...b } = req.body as UpdateSettingsBody;
  const r = await prisma.restaurant.update({
    where: { id: rid },
    data: { ...b, ...(openingHours !== undefined ? { openingHours: openingHours ?? Prisma.DbNull } : {}) },
  });
  await menuChanged(rid); // nome, cor, horário e Wi-Fi aparecem no cardápio público
  res.json(toSettings(r));
});

/** Arquivos do restaurante no MinIO (chaves `{restaurantId}/...`). Melhor esforço: o banco já foi apagado. */
async function removeMediaFiles(rid: string) {
  const names: string[] = [];
  for await (const o of minio.listObjectsV2(bucket, `${rid}/`, true) as AsyncIterable<{ name?: string }>) if (o.name) names.push(o.name);
  if (names.length) await minio.removeObjects(bucket, names);
}

/** Exclusão da conta pelo dono (App Store 5.1.1(v) / Google Play). Contrato: api.settings.deleteAccount. */
router.post('/delete-account', rateLimit('delete-account', 5, 3600), validate({ body: DeleteAccountBody }), async (req, res) => {
  const rid = tenantId(req);
  const me = await prisma.user.findFirst({ where: { id: req.auth!.sub, restaurantId: rid } });
  if (!me?.passwordHash || !(await argon2.verify(me.passwordHash, (req.body as DeleteAccountBody).password))) {
    throw new AppError('VALIDATION', 'Senha incorreta');
  }
  const r = await prisma.restaurant.findUniqueOrThrow({ where: { id: rid }, include: { billing: true, users: { select: { id: true } } } });
  // cancela antes de apagar: se o Asaas falhar, nada é apagado e a cobrança não continua órfã
  if (r.billing?.asaasSubscriptionId) await asaas.deleteSubscription(r.billing.asaasSubscriptionId);
  await prisma.$transaction([
    // placas físicas voltam ao estoque (a leitura mostra "placa não ativada")
    prisma.tag.updateMany({ where: { restaurantId: rid }, data: { status: 'UNASSIGNED', restaurantId: null, tableId: null, activatedAt: null } }),
    // OrderItem → Item é Restrict: pedidos saem antes do cascade do restaurante
    prisma.order.deleteMany({ where: { restaurantId: rid } }),
    prisma.restaurant.delete({ where: { id: rid } }),
  ]);
  await Promise.all(r.users.map((u) => revokeAccessTokens(u.id)));
  await menuChanged(rid);
  removeMediaFiles(rid).catch((err: unknown) => logger.warn({ err, restaurantId: rid }, 'exclusão de conta: arquivos de mídia não removidos'));
  logger.info({ restaurantId: rid, userId: me.id }, 'conta excluída pelo dono');
  res.clearCookie(COOKIES.refresh, refreshCookie);
  res.status(204).end();
});
