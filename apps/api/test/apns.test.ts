// Push nativo iOS (APNs): registro do aparelho, envio (falso) nos gatilhos do Web Push e isolamento por restaurante.
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';

// As variáveis precisam existir antes de env.ts ser importado; a chave é descartável, gerada na hora.
const keys = await vi.hoisted(async () => {
  const { generateKeyPairSync } = await import('node:crypto');
  const k = generateKeyPairSync('ec', { namedCurve: 'prime256v1', publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
  Object.assign(process.env, { APNS_KEY_ID: 'KEYID12345', APNS_TEAM_ID: 'TEAMID1234', APNS_BUNDLE_ID: 'br.com.garfeed.painel', APNS_KEY_P8: Buffer.from(k.privateKey).toString('base64') });
  return k;
});

import { prisma } from '../src/lib/prisma';
import { providerToken, transport } from '../src/lib/apns';
import { notifyRestaurant } from '../src/lib/push';
import { app, bearer, dropRestaurants, makeRestaurant, type Fixture } from './helpers';

const tok = (c: string) => c.repeat(64);
let a: Fixture;
let b: Fixture;

beforeAll(async () => { [a, b] = await Promise.all([makeRestaurant(), makeRestaurant()]); });
afterAll(async () => {
  for (const k of ['APNS_KEY_ID', 'APNS_TEAM_ID', 'APNS_BUNDLE_ID', 'APNS_KEY_P8']) delete process.env[k]; // não vazar para os outros arquivos de teste
  await dropRestaurants(a.r.id, b.r.id);
});
afterEach(() => { vi.restoreAllMocks(); });

describe('APNs', () => {
  it('JWT do provedor: ES256 com kid e iss, verificável pela chave pública', () => {
    const decoded = jwt.verify(providerToken(), keys.publicKey, { algorithms: ['ES256'], complete: true });
    expect(decoded.header.kid).toBe('KEYID12345');
    expect((decoded.payload as jwt.JwtPayload).iss).toBe('TEAMID1234');
    expect(providerToken()).toBe(providerToken()); // reaproveita dentro da janela
  });

  it('registra o aparelho só para equipe autenticada e com token válido', async () => {
    expect((await request(app).post('/push/apns-device').send({ token: tok('a') })).status).toBe(401);
    const waiter = await a.token('WAITER');
    expect((await request(app).post('/push/apns-device').set(bearer(waiter)).send({ token: 'nao-e-hex' })).status).toBe(400);
    expect((await request(app).post('/push/apns-device').set(bearer(waiter)).send({ token: tok('A') })).status).toBe(204);
    // mesmo aparelho, outro login: passa a ser do usuário atual (sem duplicar)
    expect((await request(app).post('/push/apns-device').set(bearer(await a.token('OWNER'))).send({ token: tok('a') })).status).toBe(204);
    const rows = await prisma.apnsDevice.findMany({ where: { token: tok('a') }, include: { user: true } });
    expect(rows).toHaveLength(1);
    expect(rows[0]!.user.role).toBe('OWNER');
  });

  it('gatilho do Web Push também envia por APNs, só para o restaurante certo, e remove token morto', async () => {
    await request(app).post('/push/apns-device').set(bearer(await a.token('WAITER'))).send({ token: tok('c') });
    await request(app).post('/push/apns-device').set(bearer(await b.token('OWNER'))).send({ token: tok('b') });
    const send = vi.spyOn(transport, 'send').mockImplementation(async (tokens) => tokens.map((t) => (t === tok('c') ? 'Unregistered' : null)));

    notifyRestaurant(a.r.id, { title: 'Novo pedido · Mesa 1', body: '#001', tag: 'order-1' });
    await vi.waitFor(async () => expect(await prisma.apnsDevice.count({ where: { token: tok('c') } })).toBe(0));

    expect(send).toHaveBeenCalledTimes(1);
    const [tokens, payload] = send.mock.calls[0]!;
    expect([...tokens].sort()).toEqual([tok('a'), tok('c')]); // nunca o aparelho do restaurante B
    expect(payload.title).toBe('Novo pedido · Mesa 1');
    expect(await prisma.apnsDevice.count({ where: { token: { in: [tok('a'), tok('b')] } } })).toBe(2);
  });

  it('usuário desativado não recebe', async () => {
    const send = vi.spyOn(transport, 'send').mockResolvedValue([]);
    await prisma.user.updateMany({ where: { restaurantId: b.r.id }, data: { active: false } });
    notifyRestaurant(b.r.id, { title: 't', body: 'b' });
    await new Promise((r) => setTimeout(r, 300));
    expect(send).not.toHaveBeenCalled();
  });
});
