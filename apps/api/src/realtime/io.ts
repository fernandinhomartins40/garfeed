import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { parse } from 'cookie';
import {
  COOKIES, rooms, type ClientToServerEvents, type GuestServerEvents, type PanelServerEvents,
  type ServerToClientEvents,
} from '@garfeed/shared';
import { env } from '../lib/env';
import { createRedis } from '../lib/redis';
import { verifyAccessToken, verifyGuestToken } from '../lib/auth';
import { prisma } from '../lib/prisma';
import { logger } from '../lib/logger';

let io: Server<ClientToServerEvents, ServerToClientEvents> | undefined;

export function initRealtime(server: HttpServer) {
  const pub = createRedis();
  const sub = pub.duplicate();
  io = new Server(server, { cors: { origin: env.CORS_ORIGINS, credentials: true }, adapter: createAdapter(pub, sub) });

  // Painel: JWT em handshake.auth.token → sala restaurant:{id}. Cliente: cookie guestToken → session:{id} + guests:{id}.
  io.use(async (socket, next) => {
    try {
      const token: unknown = socket.handshake.auth?.token;
      if (typeof token === 'string') {
        const auth = verifyAccessToken(token);
        if (!auth.restaurantId) return next(new Error('Usuário sem restaurante'));
        await socket.join(rooms.restaurant(auth.restaurantId));
        return next();
      }
      const guestToken = parse(socket.handshake.headers.cookie ?? '')[COOKIES.guest];
      if (!guestToken) return next(new Error('Não autenticado'));
      const guest = verifyGuestToken(guestToken);
      const session = await prisma.tableSession.findFirst({ where: { id: guest.sessionId, restaurantId: guest.restaurantId, status: 'OPEN' } });
      if (!session) return next(new Error('Sessão da mesa encerrada'));
      await socket.join([rooms.session(session.id), rooms.guests(session.restaurantId)]);
      next();
    } catch (err) {
      next(err instanceof Error ? err : new Error('Não autenticado'));
    }
  });

  logger.info('socket.io pronto');
  return io;
}

// Sem initRealtime (testes com supertest) os emissores viram no-op.
const getIo = () => io;

// Emissores tipados — use estes nos módulos (ex.: emitToRestaurant(rid, 'order:new', order)).
export function emitToRestaurant<E extends keyof PanelServerEvents>(restaurantId: string, event: E, ...args: Parameters<PanelServerEvents[E]>) {
  getIo()?.to(rooms.restaurant(restaurantId)).emit(event, ...(args as Parameters<ServerToClientEvents[E]>));
}
export function emitToSession<E extends keyof GuestServerEvents>(sessionId: string, event: E, ...args: Parameters<GuestServerEvents[E]>) {
  getIo()?.to(rooms.session(sessionId)).emit(event, ...(args as Parameters<ServerToClientEvents[E]>));
}
/** menu:updated para o painel e para todos os clientes com o feed aberto. */
export function emitMenuUpdated(restaurantId: string, payload: Parameters<PanelServerEvents['menu:updated']>[0] = {}) {
  getIo()?.to([rooms.restaurant(restaurantId), rooms.guests(restaurantId)]).emit('menu:updated', payload);
}
