import { Router } from 'express';

/** /orders (STAFF; KITCHEN filtrado pelo setor do token). Contrato: api.orders. TODO. */
export const router = Router();
/** /public/orders (requireGuest) — idempotencyKey, OrderCounter, limite 10/h. TODO. */
export const publicRouter = Router();
