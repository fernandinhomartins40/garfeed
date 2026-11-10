import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';
import { SESSION_IDLE_MS } from '../lib/guest';
import { emitToRestaurant, emitToSession } from '../realtime/io';

/** Expira sessões OPEN sem atividade há 3 h. Idempotente: várias instâncias da API podem rodar ao mesmo tempo. */
export async function expireIdleSessions(now = new Date()) {
  const idle = await prisma.tableSession.findMany({
    where: { status: 'OPEN', lastActivityAt: { lt: new Date(now.getTime() - SESSION_IDLE_MS) } },
    select: { id: true, restaurantId: true, tableId: true },
  });
  for (const s of idle) {
    const { count } = await prisma.tableSession.updateMany({ where: { id: s.id, status: 'OPEN' }, data: { status: 'EXPIRED', closedAt: now } });
    if (!count) continue;
    emitToSession(s.id, 'session:closed', { sessionId: s.id });
    emitToRestaurant(s.restaurantId, 'table:updated', { tableId: s.tableId });
  }
  return idle.length;
}

// shortcut: setInterval no processo da API em vez de job repetível do BullMQ; as rotas também expiram na leitura
export function startSessionExpiry(everyMs = 5 * 60_000) {
  const run = () => expireIdleSessions().catch((err) => logger.error({ err }, 'falha ao expirar sessões'));
  return setInterval(run, everyMs).unref();
}
