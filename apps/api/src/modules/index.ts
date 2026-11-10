// Registro único das rotas. Auth e papel são aplicados aqui por prefixo (ROLES de @garfeed/shared);
// rotas que exigem papel mais restrito que o prefixo adicionam requireRole na própria rota.
import { Router } from 'express';
import { ROLES, type Role } from '@garfeed/shared';
import { requireAuth, requireRole } from '../lib/auth';
import * as admin from './admin/router';
import * as auth from './auth/router';
import * as calls from './calls/router';
import * as events from './events/router';
import * as media from './media/router';
import * as menu from './menu/router';
import * as orders from './orders/router';
import * as push from './push/router';
import * as restaurants from './restaurants/router';
import * as sessions from './sessions/router';
import * as tables from './tables/router';
import * as tags from './tags/router';
import * as users from './users/router';

export const routes = Router();

routes.use('/auth', auth.router);

// Pública (cliente anônimo). Cada publicRouter define o caminho completo abaixo de /public.
routes.use('/public', tags.publicRouter, menu.publicRouter, orders.publicRouter, sessions.publicRouter, calls.publicRouter, events.publicRouter);

const staff = (roles: readonly Role[]) => [requireAuth, requireRole(...roles)];
routes.use('/menu', staff(ROLES.MANAGE), menu.router);
routes.use('/media', staff(ROLES.MANAGE), media.router);
routes.use('/tables', staff(ROLES.OPERATE), tables.router);
routes.use('/tags', staff(ROLES.MANAGE), tags.router);
routes.use('/sessions', staff(ROLES.OPERATE), sessions.router);
routes.use('/orders', staff(ROLES.STAFF), orders.router);
routes.use('/calls', staff(ROLES.OPERATE), calls.router);
routes.use('/users', staff(ROLES.OWNER), users.router);
routes.use('/settings', staff(ROLES.OWNER), restaurants.router);
routes.use('/push', staff(ROLES.STAFF), push.router);
routes.use('/admin', staff(ROLES.ADMIN), admin.router);
