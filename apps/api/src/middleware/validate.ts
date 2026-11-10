import type { RequestHandler } from 'express';
import { z } from 'zod';
import { AppError } from '../lib/errors';

type Schemas = { body?: z.ZodType; query?: z.ZodType; params?: z.ZodType };

/**
 * Valida e substitui req.body/query/params pelos valores parseados (com defaults e transformações).
 * Uso: router.post('/x', validate({ body: CreateXBody }), handler) — schemas vêm de @garfeed/shared.
 */
export const validate = (schemas: Schemas): RequestHandler => (req, _res, next) => {
  for (const key of ['params', 'query', 'body'] as const) {
    const schema = schemas[key];
    if (!schema) continue;
    const r = schema.safeParse(req[key] ?? {});
    if (!r.success) {
      throw new AppError('VALIDATION', r.error.issues[0]?.message ?? 'Dados inválidos', z.flattenError(r.error));
    }
    // Express 5: req.query é getter; defineProperty sobrepõe com o valor validado
    Object.defineProperty(req, key, { value: r.data, writable: true, enumerable: true, configurable: true });
  }
  next();
};
