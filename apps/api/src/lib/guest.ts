import type { Request } from 'express';
import { LIMITS } from '@garfeed/shared';
import { prisma } from './prisma';
import { AppError } from './errors';

export const SESSION_IDLE_MS = LIMITS.sessionIdleHours * 3_600_000;

/** Sessão do cookie guestToken, exigindo OPEN e não ociosa (3 h). Use depois de requireGuest. */
export async function openGuestSession(req: Request) {
  const g = req.guest!;
  const session = await prisma.tableSession.findFirst({
    where: { id: g.sessionId, restaurantId: g.restaurantId, status: 'OPEN' },
    include: { restaurant: true, table: true },
  });
  if (session && Date.now() - session.lastActivityAt.getTime() <= SESSION_IDLE_MS) return session;
  if (session) await prisma.tableSession.updateMany({ where: { id: session.id, status: 'OPEN' }, data: { status: 'EXPIRED', closedAt: new Date() } });
  throw new AppError('SESSION_CLOSED', 'A sessão desta mesa foi encerrada. Aproxime o celular da placa novamente.');
}
