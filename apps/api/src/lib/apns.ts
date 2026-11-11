import http2 from 'node:http2';
import jwt from 'jsonwebtoken';
import { env } from './env';
import { prisma } from './prisma';
import { logger } from './logger';

// Push nativo do app iOS: HTTP/2 direto na Apple com a chave .p8 (sem Firebase). Sem configuração = desligado.
const enabled = !!(env.APNS_KEY_ID && env.APNS_TEAM_ID && env.APNS_KEY_P8 && env.APNS_BUNDLE_ID);
const HOST = env.APNS_PRODUCTION ? 'https://api.push.apple.com' : 'https://api.sandbox.push.apple.com';
/** Respostas da Apple que significam "este token não serve mais". */
const DEAD = new Set(['Unregistered', 'BadDeviceToken', 'DeviceTokenNotForTopic']);

export type ApnsPayload = { title: string; body: string; tag?: string; url?: string };

let cached: { token: string; at: number } | null = null;
/** JWT do provedor (ES256). A Apple recusa tokens com mais de 60 min e renovações a cada menos de 20. */
export function providerToken(now = Date.now()) {
  if (!cached || now - cached.at > 40 * 60_000) {
    cached = { at: now, token: jwt.sign({ iss: env.APNS_TEAM_ID, iat: Math.floor(now / 1000) }, env.APNS_KEY_P8!, { algorithm: 'ES256', keyid: env.APNS_KEY_ID }) };
  }
  return cached.token;
}

/** Objeto (e não função solta) para o teste trocar o envio por um falso. */
export const transport = {
  /** Uma conexão HTTP/2 por lote; devolve, por token, `null` (entregue) ou o motivo da falha. */
  // shortcut: abre uma conexão por notificação; se o volume de pedidos crescer, manter a conexão aberta.
  async send(tokens: string[], p: ApnsPayload): Promise<(string | null)[]> {
    const client = http2.connect(HOST);
    client.on('error', () => undefined); // o erro chega em cada stream abaixo
    const body = JSON.stringify({ aps: { alert: { title: p.title, body: p.body }, sound: 'default' }, url: p.url });
    try {
      return await Promise.all(tokens.map((token) => new Promise<string | null>((resolve) => {
        const req = client.request({
          ':method': 'POST', ':path': `/3/device/${token}`,
          authorization: `bearer ${providerToken()}`,
          'apns-topic': env.APNS_BUNDLE_ID, 'apns-push-type': 'alert', 'apns-priority': '10',
          'apns-expiration': String(Math.floor(Date.now() / 1000) + 300),
          ...(p.tag ? { 'apns-collapse-id': p.tag.slice(0, 64) } : {}),
        });
        let status = 0;
        let data = '';
        req.setEncoding('utf8');
        req.on('response', (h) => { status = Number(h[':status']); });
        req.on('data', (c: string) => { data += c; });
        req.on('end', () => {
          if (status === 200) return resolve(null);
          try { resolve((JSON.parse(data) as { reason?: string }).reason ?? `HTTP ${status}`); } catch { resolve(`HTTP ${status}`); }
        });
        req.on('error', (err) => resolve(err.message));
        req.on('close', () => resolve('conexão encerrada')); // só vale se nada resolveu antes
        req.setTimeout(10_000, () => req.close());
        req.end(body);
      })));
    } finally {
      client.close();
    }
  },
};

/** APNs para a equipe ativa do restaurante. Nunca lança: falha de push não pode derrubar pedido/chamado. */
export async function notifyApns(restaurantId: string, payload: ApnsPayload) {
  if (!enabled) return;
  try {
    const devices = await prisma.apnsDevice.findMany({ where: { user: { restaurantId, active: true } } });
    if (!devices.length) return;
    const results = await transport.send(devices.map((d) => d.token), payload);
    const dead = devices.filter((_, i) => DEAD.has(results[i] ?? ''));
    if (dead.length) await prisma.apnsDevice.deleteMany({ where: { id: { in: dead.map((d) => d.id) } } });
    const failed = results.filter((r) => r && !DEAD.has(r));
    if (failed.length) logger.warn({ failed }, 'falha no push APNs');
  } catch (err) {
    logger.warn({ err }, 'falha no push APNs');
  }
}
