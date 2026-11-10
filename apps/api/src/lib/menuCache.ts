import { menuCacheKey, type MenuUpdatedPayload } from '@garfeed/shared';
import { redis } from './redis';
import { emitMenuUpdated } from '../realtime/io';

/** Toda edição de cardápio/restaurante: invalida o cache público e avisa painel + clientes. */
export async function menuChanged(restaurantId: string, payload: MenuUpdatedPayload = {}) {
  await redis.del(menuCacheKey(restaurantId));
  emitMenuUpdated(restaurantId, payload);
}
