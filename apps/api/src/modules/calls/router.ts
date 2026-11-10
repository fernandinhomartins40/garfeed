import { Router } from 'express';

/** /calls (OPERATE). Contrato: api.calls. TODO. */
export const router = Router();
/** /public/calls (requireGuest) — cooldown 60 s por tipo. TODO. */
export const publicRouter = Router();
