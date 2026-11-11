// Envio de e-mail transacional pelo Velomail (servidor de e-mail próprio do dono — docs/DECISOES.md e docs/EMAILS.md).
import { env } from './env';
import { logger } from './logger';

export type MailContent = { subject: string; html: string; text: string };
export type Mail = MailContent & { to: string };

export const mailConfigured = () => !!env.VELOMAIL_API_KEY;

async function deliver(mail: Mail): Promise<void> {
  // Os testes rodam com o .env de dev: nunca falam com o Velomail (substituem transport.deliver por um falso).
  if (env.NODE_ENV === 'test') return;
  if (!env.VELOMAIL_API_KEY) {
    // Só em dev o corpo (que traz o link com o token) vai para o log.
    logger.warn({ to: mail.to, subject: mail.subject, ...(env.NODE_ENV === 'development' ? { text: mail.text } : {}) }, 'e-mail NÃO enviado: VELOMAIL_API_KEY vazio');
    return;
  }
  const res = await fetch(env.VELOMAIL_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.VELOMAIL_API_KEY}`, 'Content-Type': 'application/json' },
    // tracking_enabled: false — rastreio de clique reescreveria os links, e eles carregam o token de definir senha
    body: JSON.stringify({ from: env.MAIL_FROM, reply_to: env.MAIL_REPLY_TO, to: mail.to, subject: mail.subject, html: mail.html, text: mail.text, tracking_enabled: false }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Velomail respondeu ${res.status}: ${(await res.text()).slice(0, 300)}`);
}

/** Ponto único de saída; os testes trocam `deliver` por um falso que captura as mensagens. */
export const transport = { deliver };

/**
 * Envia sem bloquear nem derrubar a requisição: 3 tentativas e log de erro.
 * shortcut: a fila vive na memória do processo (um restart no meio perde o e-mail; o usuário pede de novo);
 * migrar para BullMQ se o volume ou a criticidade crescerem.
 */
export function sendMail(mail: Mail): void {
  void (async () => {
    for (let attempt = 1; ; attempt++) {
      try {
        await transport.deliver(mail);
        return;
      } catch (err) {
        if (attempt === 3) {
          logger.error({ err, to: mail.to, subject: mail.subject }, 'falha ao enviar e-mail');
          return;
        }
        await new Promise((r) => setTimeout(r, attempt * 2000));
      }
    }
  })();
}
