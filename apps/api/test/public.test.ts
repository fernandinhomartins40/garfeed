import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import express from 'express';
import { PublicMenuResponse, TagResolveResponse } from '@garfeed/shared';
import { prisma } from '../src/lib/prisma';
import { rateLimit } from '../src/lib/rateLimit';
import { errorHandler } from '../src/lib/errors';
import { expireIdleSessions } from '../src/jobs/sessions';
import { isOpenAt } from '../src/lib/restaurant';
import { app, bearer, dropRestaurants, freeCode, joinTable, makeRestaurant, type Fixture } from './helpers';

let f: Fixture;
beforeAll(async () => { f = await makeRestaurant(); });
afterAll(async () => { await dropRestaurants(f.r.id); });

describe('placa e sessão (público)', () => {
  it('placa nova (sem vínculo) → "não ativada"; entrar → TAG_NOT_ACTIVE', async () => {
    const code = await freeCode();
    await prisma.tag.create({ data: { code } });
    const res = await request(app).get(`/public/tags/${code}`);
    expect(TagResolveResponse.parse(res.body)).toEqual({ code, status: 'UNASSIGNED', restaurant: null, table: null });
    expect((await request(app).post(`/public/tags/${code}/session`)).body.error.code).toBe('TAG_NOT_ACTIVE');
    await prisma.tag.delete({ where: { code } });
  });

  it('placa ativa → restaurante e mesa certos; cookie httpOnly; código minúsculo é aceito', async () => {
    const res = await request(app).get(`/public/tags/${f.codes[0]!.toLowerCase()}`);
    expect(res.body).toMatchObject({ status: 'ACTIVE', restaurant: { slug: f.r.slug, canOrder: true }, table: { name: 'Mesa 1' } });
    const join = await joinTable(f.codes[0]!);
    expect(join.res.status).toBe(200);
    expect(String(join.res.headers['set-cookie'])).toMatch(/gf_guest=.*HttpOnly/i);
  });

  it('placa bloqueada → TAG_BLOCKED e resolve sem restaurante', async () => {
    const code = await freeCode();
    await prisma.tag.create({ data: { code, status: 'BLOCKED', restaurantId: f.r.id } });
    expect((await request(app).get(`/public/tags/${code}`)).body.restaurant).toBeNull();
    expect((await request(app).post(`/public/tags/${code}/session`)).body.error.code).toBe('TAG_BLOCKED');
  });

  it('restaurante suspenso → canOrder false (somente visualização)', async () => {
    await prisma.restaurant.update({ where: { id: f.r.id }, data: { status: 'SUSPENDED' } });
    expect((await request(app).get(`/public/tags/${f.codes[0]}`)).body.restaurant.canOrder).toBe(false);
    await prisma.restaurant.update({ where: { id: f.r.id }, data: { status: 'ACTIVE' } });
  });

  it('sessão ociosa há 3 h expira (job e na entrada)', async () => {
    const join = await joinTable(f.codes[1]!);
    const id = join.res.body.session.id as string;
    await prisma.tableSession.update({ where: { id }, data: { lastActivityAt: new Date(Date.now() - 3 * 3_600_000 - 1000) } });
    expect(await expireIdleSessions()).toBeGreaterThanOrEqual(1);
    expect((await prisma.tableSession.findUniqueOrThrow({ where: { id } })).status).toBe('EXPIRED');
    expect((await request(app).post('/public/calls').set('Cookie', join.cookie).send({ type: 'WAITER' })).body.error.code).toBe('SESSION_CLOSED');
    expect((await joinTable(f.codes[1]!)).res.body.session.id).not.toBe(id);
  });
});

describe('chamados', () => {
  it('cooldown de 60 s por tipo, com retryAfterSec; outro tipo passa; painel conclui', async () => {
    const { cookie } = await joinTable(f.codes[2]!);
    const a = await request(app).post('/public/calls').set('Cookie', cookie).send({ type: 'WAITER' });
    expect(a.status).toBe(201);
    expect(a.body.retryAfterSec).toBe(60);
    const b = await request(app).post('/public/calls').set('Cookie', cookie).send({ type: 'WAITER' });
    expect(b.status).toBe(429);
    expect(b.body.error.code).toBe('CALL_COOLDOWN');
    expect(b.body.error.retryAfterSec).toBeGreaterThan(50);
    expect(b.headers['retry-after']).toBeDefined();
    expect((await request(app).post('/public/calls').set('Cookie', cookie).send({ type: 'BILL' })).status).toBe(201);

    const waiter = await f.token('WAITER');
    const tables = (await request(app).get('/tables').set(bearer(waiter))).body as { name: string; status: string }[];
    expect(tables.find((t) => t.name === 'Mesa 3')?.status).toBe('BILL');
    const open = (await request(app).get('/calls?status=OPEN').set(bearer(waiter))).body as { id: string }[];
    expect(open.length).toBe(2);
    const done = await request(app).post(`/calls/${a.body.id}/done`).set(bearer(waiter));
    expect(done.body).toMatchObject({ status: 'DONE', table: { name: 'Mesa 3' } });
    expect(done.body.doneAt).toBeTruthy();
  });
});

describe('eventos', () => {
  it('lote salvo com ids do próprio restaurante; ids estranhos descartados → 204', async () => {
    const { cookie, res } = await joinTable(f.codes[0]!);
    const r = await request(app).post('/public/events').set('Cookie', cookie).send({
      events: [{ type: 'item_view', itemId: f.burger.id, value: 1200 }, { type: 'item_view', itemId: 'inexistente' }, { type: 'session_start' }],
    });
    expect(r.status).toBe(204);
    expect(await prisma.event.count({ where: { sessionId: res.body.session.id } })).toBe(2);
  });

  it('aceita text/plain (navigator.sendBeacon) com o mesmo schema', async () => {
    const { cookie, res } = await joinTable(f.codes[0]!);
    const send = (body: string) => request(app).post('/public/events').set('Cookie', cookie).set('Content-Type', 'text/plain;charset=UTF-8').send(body);
    expect((await send(JSON.stringify({ events: [{ type: 'favorite', itemId: f.burger.id }] }))).status).toBe(204);
    expect(await prisma.event.count({ where: { sessionId: res.body.session.id, type: 'favorite' } })).toBe(1);
    expect((await send('não é json')).status).toBe(400);
    expect((await send(JSON.stringify({ events: [{ type: 'inventado' }] }))).status).toBe(400);
  });
});

describe('cardápio público', () => {
  it('só visíveis, categorias vazias omitidas, opcionais na ordem; edição invalida o cache', async () => {
    const owner = await f.token('OWNER');
    const m1 = PublicMenuResponse.parse((await request(app).get(`/public/restaurants/${f.r.slug}/menu`)).body);
    expect(m1.categories.map((c) => c.name)).toEqual(['Lanches', 'Bebidas']);
    expect(m1.restaurant.timezone).toBe('America/Sao_Paulo');
    expect(m1.categories[0]!.items[0]!.optionGroups.map((g) => g.name)).toEqual(['Ponto', 'Adicionais']);
    await request(app).patch(`/menu/categories/${f.bebidas.id}`).set(bearer(owner)).send({ visible: false });
    const m2 = PublicMenuResponse.parse((await request(app).get(`/public/restaurants/${f.r.slug}/menu`)).body);
    expect(m2.categories.map((c) => c.name)).toEqual(['Lanches']);
    await request(app).patch(`/menu/categories/${f.bebidas.id}`).set(bearer(owner)).send({ visible: true });
  });

  it('slug inexistente → 404', async () => {
    expect((await request(app).get('/public/restaurants/nao-existe-xyz/menu')).status).toBe(404);
  });
});

describe('utilitários', () => {
  it('rate limit Redis devolve 429 RATE_LIMITED depois do máximo', async () => {
    const mini = express();
    mini.get('/x', rateLimit(`teste-${Date.now()}`, 2, 60), (_req, res) => { res.json({ ok: true }); });
    mini.use(errorHandler);
    expect((await request(mini).get('/x')).status).toBe(200);
    expect((await request(mini).get('/x')).status).toBe(200);
    const r = await request(mini).get('/x');
    expect(r.status).toBe(429);
    expect(r.body.error.code).toBe('RATE_LIMITED');
  });

  it('horário de funcionamento no fuso do restaurante, inclusive virando a noite', () => {
    // terça 2026-11-10 20:00 em São Paulo = 23:00 UTC
    const tue20 = new Date('2026-11-10T23:00:00Z');
    expect(isOpenAt({ tue: [['18:00', '23:00']] }, 'America/Sao_Paulo', tue20)).toBe(true);
    expect(isOpenAt({ tue: [['11:00', '15:00']] }, 'America/Sao_Paulo', tue20)).toBe(false);
    expect(isOpenAt({ mon: [['22:00', '02:00']] }, 'America/Sao_Paulo', new Date('2026-11-10T04:00:00Z'))).toBe(true); // terça 01:00
    expect(isOpenAt(null, 'America/Sao_Paulo', tue20)).toBe(true);
  });
});
