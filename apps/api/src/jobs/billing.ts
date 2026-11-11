import { prisma } from '../lib/prisma';
import { env } from '../lib/env';
import { logger } from '../lib/logger';
import { menuChanged } from '../lib/menuCache';
import { localDay } from '../lib/restaurant';

// shortcut: "hoje" no fuso de São Paulo para todos (como no admin); separar por timezone quando houver clientes fora do BRT
/** AAAA-MM-DD de hoje (+ dias) como Date UTC — o formato das colunas @db.Date. */
export function billingDay(now = new Date(), plusDays = 0) {
  const d = new Date(`${localDay('America/Sao_Paulo', now)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d;
}

/** Fatura vencida até esta data já estourou a tolerância (BILLING_GRACE_DAYS). */
export const graceLimit = (now = new Date()) => billingDay(now, -env.BILLING_GRACE_DAYS);

/**
 * Suspende restaurantes com fatura vencida há BILLING_GRACE_DAYS ou mais (o cardápio vira somente visualização).
 * Idempotente: roda no webhook de vencimento e de hora em hora.
 */
export async function suspendOverdue(now = new Date(), restaurantId?: string) {
  const late = await prisma.restaurant.findMany({
    where: { id: restaurantId, status: { not: 'SUSPENDED' }, invoices: { some: { status: 'OVERDUE', dueDate: { lte: graceLimit(now) } } } },
    select: { id: true },
  });
  let suspended = 0;
  for (const r of late) {
    const { count } = await prisma.restaurant.updateMany({ where: { id: r.id, status: { not: 'SUSPENDED' } }, data: { status: 'SUSPENDED' } });
    if (!count) continue;
    suspended++;
    logger.warn({ restaurantId: r.id }, 'cobrança: restaurante suspenso por fatura vencida');
    await menuChanged(r.id); // canOrder=false no cardápio público
    // TODO(e-mail): avisar o dono da suspensão por falta de pagamento (com o link da fatura)
  }
  return suspended;
}

// shortcut: setInterval no processo da API (como jobs/sessions.ts) em vez de job repetível do BullMQ
export function startBillingJob(everyMs = 60 * 60_000) {
  const run = () => suspendOverdue().catch((err) => logger.error({ err }, 'falha ao suspender inadimplentes'));
  return setInterval(run, everyMs).unref();
}
