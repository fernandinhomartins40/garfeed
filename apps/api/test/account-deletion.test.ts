// Exclusão da conta pelo dono (App Store 5.1.1(v) / Google Play): apaga só o restaurante do token, cancela a assinatura
// e devolve as placas ao estoque. O Asaas é trocado por um falso.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  process.env.ASAAS_API_KEY = '';
  process.env.ASAAS_API_URL = 'http://127.0.0.1:9';
});

import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { asaas } from '../src/lib/asaas';
import { AppError } from '../src/lib/errors';
import { redis } from '../src/lib/redis';
import { app, bearer, dropRestaurants, joinTable, makeRestaurant, password, type Fixture } from './helpers';

let a: Fixture;
let b: Fixture;
const del = (token: string, pw = password) => request(app).post('/settings/delete-account').set(bearer(token)).send({ password: pw });

beforeAll(async () => {
  const limits = await redis.keys('rl:delete-account:*'); // o limite por IP sobrevive entre execuções seguidas
  if (limits.length) await redis.del(...limits);
  a = await makeRestaurant();
  b = await makeRestaurant();
  await joinTable(a.codes[0]!); // sessão aberta em A
  await prisma.billing.create({ data: { restaurantId: a.r.id, cpfCnpj: '11222333000181', asaasSubscriptionId: `sub_del_${a.r.id}` } });
});
afterAll(async () => {
  vi.restoreAllMocks();
  await dropRestaurants(a.r.id, b.r.id);
  await prisma.tag.deleteMany({ where: { code: { in: a.codes } } });
});

describe('POST /settings/delete-account', () => {
  it('só o OWNER; senha errada não apaga nada', async () => {
    for (const role of ['MANAGER', 'WAITER', 'KITCHEN'] as const) expect((await del(await a.token(role))).status).toBe(403);
    expect((await del(await a.token('OWNER'), 'senha-errada')).status).toBe(400);
    expect(await prisma.restaurant.count({ where: { id: a.r.id } })).toBe(1);
  });

  it('Asaas fora do ar: nada é apagado (a cobrança não fica órfã)', async () => {
    const spy = vi.spyOn(asaas, 'deleteSubscription').mockRejectedValueOnce(new AppError('BILLING_PROVIDER', 'O Asaas não respondeu.'));
    expect((await del(await a.token('OWNER'))).status).toBe(502);
    expect(spy).toHaveBeenCalledOnce();
    expect(await prisma.restaurant.count({ where: { id: a.r.id } })).toBe(1);
  });

  it('apaga o restaurante do token e tudo dele; o restaurante B fica intacto', async () => {
    const spy = vi.spyOn(asaas, 'deleteSubscription').mockResolvedValue({ id: `sub_del_${a.r.id}`, deleted: true });
    const owner = await a.token('OWNER');
    const res = await del(owner);
    expect(res.status).toBe(204);
    expect(spy).toHaveBeenCalledWith(`sub_del_${a.r.id}`);
    expect(String(res.headers['set-cookie'])).toMatch(/gf_refresh=;/);

    expect(await prisma.restaurant.count({ where: { id: a.r.id } })).toBe(0);
    expect(await prisma.user.count({ where: { restaurantId: a.r.id } })).toBe(0);
    expect(await prisma.tag.count({ where: { code: { in: a.codes }, status: 'UNASSIGNED', restaurantId: null, tableId: null } })).toBe(a.codes.length);
    // token antigo deixa de valer na hora
    expect((await request(app).get('/settings').set(bearer(owner))).status).toBe(401);

    expect(await prisma.restaurant.count({ where: { id: b.r.id } })).toBe(1);
    expect(await prisma.user.count({ where: { restaurantId: b.r.id } })).toBe(5);
    expect(await prisma.tag.count({ where: { code: { in: b.codes }, restaurantId: b.r.id, status: 'ACTIVE' } })).toBe(b.codes.length);
  });
});
