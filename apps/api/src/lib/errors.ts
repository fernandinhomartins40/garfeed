import type { ErrorRequestHandler, RequestHandler } from 'express';
import { Prisma } from '@prisma/client';
import type { ErrorCode, ErrorResponse } from '@garfeed/shared';
import { logger } from './logger';

const STATUS: Partial<Record<ErrorCode, number>> = {
  VALIDATION: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404, CONFLICT: 409,
  RATE_LIMITED: 429, CALL_COOLDOWN: 429, ORDER_LIMIT: 429, INTERNAL: 500,
};

/** Erro de negócio com mensagem pt-BR pronta para o usuário. Códigos sem status mapeado → 422. */
export class AppError extends Error {
  constructor(
    public code: ErrorCode,
    message: string,
    public details?: unknown,
    public retryAfterSec?: number,
  ) {
    super(message);
  }
  get status() {
    return STATUS[this.code] ?? 422;
  }
}

export const notFound = (what = 'Registro') => new AppError('NOT_FOUND', `${what} não encontrado`);

export const notFoundHandler: RequestHandler = (_req, _res, next) => next(new AppError('NOT_FOUND', 'Rota não encontrada'));

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  let e: AppError;
  if (err instanceof AppError) e = err;
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') e = new AppError('CONFLICT', 'Já existe um registro com esses dados');
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2025') e = notFound();
  else if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2003') e = new AppError('CONFLICT', 'Registro em uso por outros dados; não pode ser excluído');
  else if (err?.type === 'entity.parse.failed') e = new AppError('VALIDATION', 'JSON inválido');
  else {
    logger.error({ err }, 'erro não tratado');
    e = new AppError('INTERNAL', 'Erro interno. Tente novamente.');
  }
  if (e.retryAfterSec) res.setHeader('Retry-After', String(e.retryAfterSec));
  const body: ErrorResponse = { error: { code: e.code, message: e.message, details: e.details, retryAfterSec: e.retryAfterSec } };
  res.status(e.status).json(body);
};
