import { LIMITS } from '@garfeed/shared';
import type { UserTokenType } from '@prisma/client';
import { hashToken, newRefreshToken } from './auth';
import { env } from './env';
import { prisma } from './prisma';

const TTL_MS: Record<UserTokenType, number> = {
  PASSWORD_RESET: LIMITS.passwordResetMinutes * 60_000,
  INVITE: LIMITS.inviteDays * 86_400_000,
};
const PAGE: Record<UserTokenType, string> = { PASSWORD_RESET: 'redefinir-senha', INVITE: 'aceitar-convite' };

/**
 * Cria o link de definir senha e devolve a URL do painel. Só o hash vai para o banco.
 * Um link válido por vez: os anteriores do mesmo tipo deixam de valer (reenvio de convite, novo pedido de recuperação).
 */
export async function issuePasswordLink(userId: string, type: UserTokenType): Promise<string> {
  const token = newRefreshToken();
  await prisma.$transaction([
    prisma.userToken.deleteMany({ where: { userId, type } }),
    prisma.userToken.create({ data: { userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + TTL_MS[type]) } }),
  ]);
  return `${env.PAINEL_URL}/${PAGE[type]}?token=${token}`;
}
