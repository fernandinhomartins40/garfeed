import { Router } from 'express';

/** /sessions/:id/close (OPERATE) — emitir session:closed e table:updated. Contrato: api.sessions. TODO. */
export const router = Router();
/** /public/sessions/me (requireGuest). TODO. */
export const publicRouter = Router();
