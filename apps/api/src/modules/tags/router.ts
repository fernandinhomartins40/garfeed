import { Router } from 'express';

/** /tags (OWNER, MANAGER). Contrato: api.tags. TODO(próximo agente). */
export const router = Router();
/** /public/tags/:code e /public/tags/:code/session (seta cookie COOKIES.guest). Contrato: api.public. TODO. */
export const publicRouter = Router();
