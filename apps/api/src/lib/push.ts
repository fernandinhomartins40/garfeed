import webpush from 'web-push';
import { env } from './env';
import { prisma } from './prisma';
import { logger } from './logger';

const enabled = !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);
if (enabled) webpush.setVapidDetails(env.VAPID_SUBJECT, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);

export const vapidPublicKey = () => env.VAPID_PUBLIC_KEY ?? null;

/** Web Push para a equipe ativa do restaurante. Nunca lança: falha de push não pode derrubar pedido/chamado. */
export function notifyRestaurant(restaurantId: string, payload: { title: string; body: string; tag?: string; url?: string }) {
  if (!enabled) return;
  void (async () => {
    const subs = await prisma.pushSubscription.findMany({ where: { user: { restaurantId, active: true } } });
    await Promise.all(subs.map(async (s) => {
      try {
        const keys = s.keys as { p256dh: string; auth: string };
        await webpush.sendNotification({ endpoint: s.endpoint, keys }, JSON.stringify(payload), { TTL: 300 });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        // assinatura expirada/removida no navegador
        if (status === 404 || status === 410) await prisma.pushSubscription.deleteMany({ where: { id: s.id } });
        else logger.warn({ err, endpoint: s.endpoint }, 'falha no web push');
      }
    }));
  })().catch((err) => logger.warn({ err }, 'falha no web push'));
}
