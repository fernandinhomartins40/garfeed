import { Router } from 'express';
import { PushSubscribeBody, type VapidPublicKeyResponse } from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { vapidPublicKey } from '../../lib/push';
import { validate } from '../../middleware/validate';

/** /push (STAFF). */
export const router = Router();

router.get('/vapid-public-key', (_req, res) => {
  const body: VapidPublicKeyResponse = { publicKey: vapidPublicKey() };
  res.json(body);
});

/** Mesmo navegador com outro login: a assinatura passa a ser do usuário atual. */
router.post('/subscribe', validate({ body: PushSubscribeBody }), async (req, res) => {
  const { endpoint, keys } = req.body as PushSubscribeBody;
  await prisma.pushSubscription.upsert({
    where: { endpoint },
    create: { endpoint, keys, userId: req.auth!.sub },
    update: { keys, userId: req.auth!.sub },
  });
  res.status(204).end();
});
