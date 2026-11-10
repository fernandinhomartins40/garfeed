import { Router } from 'express';
import { Prisma, type Restaurant } from '@prisma/client';
import { OpeningHours, UpdateSettingsBody, type Settings } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { tenantId } from '../../lib/auth';
import { menuChanged } from '../../lib/menuCache';
import { validate } from '../../middleware/validate';

/** /settings (OWNER). Contrato: api.settings. */
export const router = Router();

const toSettings = (r: Restaurant): Settings => ({
  id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, accentColor: r.accentColor, plan: r.plan, status: r.status,
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
