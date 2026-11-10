// MODELO de teste de isolamento multi-tenant: copie este padrão para cada módulo novo.
// Cria os restaurantes A e B, loga como equipe de A e prova que não lê nem altera dados de B em NENHUM módulo.
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app, bearer, dropRestaurants, joinTable, makeRestaurant, type Fixture } from './helpers';

let a: Fixture;
let b: Fixture;
let ownerA = '';
const idsB = { session: '', order: '', call: '', media: '', user: '' };

beforeAll(async () => {
  a = await makeRestaurant();
  b = await makeRestaurant();
  ownerA = await a.token('OWNER');
  // dados operacionais em B: sessão, pedido, chamado, mídia
  const { cookie, res } = await joinTable(b.codes[0]!);
  idsB.session = res.body.session.id;
  idsB.order = (await request(app).post('/public/orders').set('Cookie', cookie).send({ idempotencyKey: randomUUID(), items: [{ itemId: b.chopp.id, quantity: 1 }] })).body.id;
  idsB.call = (await request(app).post('/public/calls').set('Cookie', cookie).send({ type: 'WAITER' })).body.id;
  idsB.media = (await prisma.media.create({ data: { restaurantId: b.r.id, type: 'IMAGE', mimeType: 'image/png', sizeBytes: 1, originalKey: 'x' } })).id;
  idsB.user = (await prisma.user.findFirstOrThrow({ where: { restaurantId: b.r.id, role: 'WAITER' } })).id;
});

afterAll(async () => {
  await dropRestaurants(a.r.id, b.r.id);
  await prisma.$disconnect();
});

describe('isolamento multi-tenant', () => {
  it('listagens só trazem dados do próprio restaurante', async () => {
    const get = async (path: string) => (await request(app).get(path).set(bearer(ownerA))).body as { id?: string; code?: string; sessionId?: string }[];
    expect((await get('/menu/categories')).map((c) => c.id)).toEqual([a.lanches.id, a.bebidas.id]);
    expect((await get('/menu/items')).every((i) => [a.burger.id, a.chopp.id, a.brownie.id].includes(i.id!))).toBe(true);
    expect((await get('/menu/option-groups')).map((g) => g.id).sort()).toEqual([a.ponto.id, a.adicionais.id].sort());
    expect((await get('/tables')).map((t) => t.id).sort()).toEqual(a.tables.map((t) => t.id).sort());
    expect((await get('/tags')).map((t) => t.code).sort()).toEqual([...a.codes].sort());
    expect(await get('/orders')).toEqual([]);
    expect(await get('/calls')).toEqual([]);
    expect((await get('/users')).some((u) => u.id === idsB.user)).toBe(false);
    expect(((await request(app).get('/settings').set(bearer(ownerA))).body as { id: string }).id).toBe(a.r.id);
  });

  it('ler/alterar registro de outro restaurante → 404 e nada muda', async () => {
    const calls: [string, string, object?][] = [
      ['patch', `/menu/categories/${b.lanches.id}`, { name: 'invadido' }],
      ['delete', `/menu/categories/${b.bebidas.id}`],
      ['get', `/menu/items/${b.burger.id}`],
      ['patch', `/menu/items/${b.burger.id}`, { name: 'invadido' }],
      ['patch', `/menu/items/${b.chopp.id}/sold-out`, { soldOut: true }],
      ['delete', `/menu/items/${b.burger.id}`],
      ['put', `/menu/option-groups/${b.ponto.id}`, { name: 'x', options: [{ name: 'y' }] }],
      ['delete', `/menu/option-groups/${b.ponto.id}`],
      ['post', '/menu/items', { categoryId: b.lanches.id, name: 'x', priceCents: 1 }],
      ['post', '/menu/items', { categoryId: a.lanches.id, name: 'x', priceCents: 1, optionGroupIds: [b.ponto.id] }],
      ['post', '/menu/items', { categoryId: a.lanches.id, name: 'x', priceCents: 1, mediaId: idsB.media }],
      ['get', `/media/${idsB.media}`],
      ['post', `/media/${idsB.media}/complete`],
      ['patch', `/tables/${b.tables[0]!.id}`, { name: 'invadida' }],
      ['delete', `/tables/${b.tables[1]!.id}`],
      ['get', `/tags/${b.codes[0]}`],
      ['post', '/tags/link', { code: b.codes[0], tableId: a.tables[0]!.id }],
      ['post', '/tags/link', { code: a.codes[0], tableId: b.tables[0]!.id }],
      ['post', `/tags/${b.codes[0]}/unlink`],
      ['post', `/tags/${b.codes[1]}/block`],
      ['post', `/sessions/${idsB.session}/close`],
      ['patch', `/orders/${idsB.order}/status`, { status: 'CONFIRMED' }],
      ['post', `/calls/${idsB.call}/done`],
      ['patch', `/users/${idsB.user}`, { name: 'invadido' }],
    ];
    for (const [method, path, body] of calls) {
      const res = await (request(app) as unknown as Record<string, (p: string) => request.Test>)[method]!(path).set(bearer(ownerA)).send(body);
      expect(res.status, `${method.toUpperCase()} ${path}`).toBe(404);
    }
    expect((await prisma.category.findUniqueOrThrow({ where: { id: b.lanches.id } })).name).toBe('Lanches');
    expect((await prisma.item.findUniqueOrThrow({ where: { id: b.chopp.id } })).soldOut).toBe(false);
    expect((await prisma.tableSession.findUniqueOrThrow({ where: { id: idsB.session } })).status).toBe('OPEN');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: idsB.order } })).status).toBe('PENDING');
    expect((await prisma.serviceCall.findUniqueOrThrow({ where: { id: idsB.call } })).status).toBe('OPEN');
    expect((await prisma.tag.findUniqueOrThrow({ where: { code: b.codes[1]! } })).status).toBe('ACTIVE');
  });

  it('reordenar com ids de outro restaurante → 400', async () => {
    expect((await request(app).put('/menu/categories/order').set(bearer(ownerA)).send({ ids: [a.lanches.id, b.lanches.id] })).status).toBe(400);
    expect((await request(app).put('/menu/items/order').set(bearer(ownerA)).send({ ids: [b.burger.id] })).status).toBe(400);
  });

  it('guestToken de B não lê pedidos de A (sessions/me só vê a própria sessão)', async () => {
    const { cookie } = await joinTable(b.codes[2]!);
    const me = (await request(app).get('/public/sessions/me').set('Cookie', cookie)).body as { orders: unknown[] };
    expect(me.orders).toEqual([]);
  });
});

describe('RBAC', () => {
  it('WAITER não acessa cardápio, mídia, placas, equipe nem configurações; acessa operação', async () => {
    const waiter = await a.token('WAITER');
    for (const path of ['/menu/categories', '/menu/items', '/media/x', '/tags', '/users', '/settings', '/admin/stats']) {
      expect((await request(app).get(path).set(bearer(waiter))).status, path).toBe(403);
    }
    expect((await request(app).post('/tables').set(bearer(waiter)).send({ name: 'Mesa 99' })).status).toBe(403);
    for (const path of ['/tables', '/orders', '/calls']) expect((await request(app).get(path).set(bearer(waiter))).status, path).toBe(200);
  });

  it('MANAGER gerencia cardápio mas não equipe/configurações; KITCHEN só pedidos', async () => {
    const manager = await a.token('MANAGER');
    expect((await request(app).get('/menu/categories').set(bearer(manager))).status).toBe(200);
    expect((await request(app).get('/users').set(bearer(manager))).status).toBe(403);
    expect((await request(app).patch('/settings').set(bearer(manager)).send({ name: 'x' })).status).toBe(403);
    const kitchen = await a.token('KITCHEN');
    expect((await request(app).get('/orders').set(bearer(kitchen))).status).toBe(200);
    for (const path of ['/tables', '/calls', '/menu/items']) expect((await request(app).get(path).set(bearer(kitchen))).status, path).toBe(403);
    expect((await request(app).post(`/sessions/${idsB.session}/close`).set(bearer(kitchen))).status).toBe(403);
  });
});
