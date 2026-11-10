import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { CreateOrderResponse, PanelOrder, SessionMeResponse } from '@garfeed/shared';
import { prisma } from '../src/lib/prisma';
import { app, bearer, dropRestaurants, joinTable, makeRestaurant, type Fixture } from './helpers';

let f: Fixture;
let other: Fixture;
let cookie = '';

const order = (c: string, items: unknown[], key = randomUUID()) =>
  request(app).post('/public/orders').set('Cookie', c).send({ idempotencyKey: key, customerName: 'Ana', items });

beforeAll(async () => {
  f = await makeRestaurant();
  other = await makeRestaurant();
  cookie = (await joinTable(f.codes[0]!)).cookie;
});
afterAll(async () => {
  await dropRestaurants(f.r.id, other.r.id);
});

describe('pedido (cliente → painel)', () => {
  it('fluxo completo: valida opcionais, snapshot de preço, número do dia, transições até Entregue', async () => {
    const [aoPonto] = f.ponto.options;
    const bacon = f.adicionais.options.find((o) => o.name === 'Bacon')!;
    const res = await order(cookie, [
      { itemId: f.burger.id, quantity: 2, optionIds: [aoPonto!.id, bacon.id], note: 'sem cebola' },
      { itemId: f.chopp.id, quantity: 1 },
    ]);
    expect(res.status).toBe(201);
    const o = CreateOrderResponse.parse(res.body);
    expect(o.status).toBe('PENDING'); // requireConfirmation padrão
    expect(o.number).toBe(1);
    // burger 30,00 + bacon 5,00 = 35,00 ×2 ; chopp promo 12,00
    expect(o.items.map((i) => [i.name, i.unitPriceCents, i.sector])).toEqual([['Burger', 3500, 'KITCHEN'], ['Chopp', 1200, 'BAR']]);
    expect(o.totalCents).toBe(8200);
    expect(o.items[0]!.options).toEqual([{ group: 'Ponto', option: 'Ao ponto', priceCents: 0 }, { group: 'Adicionais', option: 'Bacon', priceCents: 500 }]);

    // mudança de preço depois não altera o pedido (snapshot)
    await prisma.item.update({ where: { id: f.chopp.id }, data: { promoPriceCents: null } });

    const waiter = await f.token('WAITER');
    const kitchen = await f.token('KITCHEN', 'KITCHEN');
    const bar = await f.token('KITCHEN', 'BAR');
    const path = `/orders/${o.id}/status`;

    expect((await request(app).patch(path).set(bearer(waiter)).send({ status: 'READY' })).body.error.code).toBe('INVALID_TRANSITION');
    expect((await request(app).patch(path).set(bearer(waiter)).send({ status: 'REJECTED' })).status).toBe(400); // motivo obrigatório
    expect((await request(app).patch(path).set(bearer(kitchen)).send({ status: 'CONFIRMED' })).status).toBe(403); // cozinha não aceita
    expect((await request(app).patch(path).set(bearer(waiter)).send({ status: 'CONFIRMED' })).status).toBe(200);
    expect((await request(app).patch(path).set(bearer(kitchen)).send({ status: 'PREPARING' })).status).toBe(200);
    expect((await request(app).patch(path).set(bearer(bar)).send({ status: 'READY' })).status).toBe(200); // bar tem o chopp
    const done = await request(app).patch(path).set(bearer(waiter)).send({ status: 'DELIVERED' });
    expect(PanelOrder.parse(done.body)).toMatchObject({ status: 'DELIVERED', totalCents: 8200, table: { name: 'Mesa 1' } });

    const me = SessionMeResponse.parse((await request(app).get('/public/sessions/me').set('Cookie', cookie)).body);
    expect(me.orders.map((x) => x.status)).toEqual(['DELIVERED']);
    expect(me.totalCents).toBe(8200);
  });

  it('dois celulares na mesma mesa: mesma sessão e veem os pedidos um do outro', async () => {
    const phone2 = await joinTable(f.codes[0]!);
    const phone1 = await joinTable(f.codes[0]!, cookie);
    expect(phone2.res.body.session.id).toBe(phone1.res.body.session.id);
    await order(phone2.cookie, [{ itemId: f.chopp.id, quantity: 1 }]);
    const me = (await request(app).get('/public/sessions/me').set('Cookie', cookie)).body as SessionMeResponse;
    expect(me.orders).toHaveLength(2);
  });

  it('idempotencyKey: reenvio devolve o mesmo pedido sem duplicar', async () => {
    const key = randomUUID();
    const a = await order(cookie, [{ itemId: f.chopp.id, quantity: 1 }], key);
    const b = await order(cookie, [{ itemId: f.chopp.id, quantity: 1 }], key);
    expect(a.status).toBe(201);
    expect(b.status).toBe(200);
    expect(b.body.id).toBe(a.body.id);
    expect(await prisma.order.count({ where: { idempotencyKey: key } })).toBe(1);
  });

  it('esgotado bloqueia o pedido (ITEM_SOLD_OUT)', async () => {
    const res = await order(cookie, [{ itemId: f.brownie.id, quantity: 1 }]);
    expect(res.status).toBe(422);
    expect(res.body.error).toMatchObject({ code: 'ITEM_SOLD_OUT', details: { itemId: f.brownie.id } });
  });

  it('esgotar pelo painel bloqueia na hora (cache do cardápio invalidado)', async () => {
    const owner = await f.token('OWNER');
    await request(app).get(`/public/restaurants/${f.r.slug}/menu`); // aquece o cache
    expect((await request(app).patch(`/menu/items/${f.chopp.id}/sold-out`).set(bearer(owner)).send({ soldOut: true })).status).toBe(200);
    const menu = await request(app).get(`/public/restaurants/${f.r.slug}/menu`);
    const chopp = menu.body.categories.flatMap((c: { items: { id: string; soldOut: boolean }[] }) => c.items).find((i: { id: string }) => i.id === f.chopp.id);
    expect(chopp.soldOut).toBe(true);
    expect((await order(cookie, [{ itemId: f.chopp.id, quantity: 1 }])).body.error.code).toBe('ITEM_SOLD_OUT');
    await request(app).patch(`/menu/items/${f.chopp.id}/sold-out`).set(bearer(owner)).send({ soldOut: false });
  });

  it('opcionais inválidos: obrigatório faltando, acima do máximo, opção de outro item', async () => {
    const [aoPonto, bem] = f.ponto.options;
    const [bacon, ovo, queijo] = f.adicionais.options.sort((a, b) => a.position - b.position);
    const cases = [
      [{ itemId: f.burger.id, quantity: 1, optionIds: [] }],
      [{ itemId: f.burger.id, quantity: 1, optionIds: [aoPonto!.id, bem!.id] }],
      [{ itemId: f.burger.id, quantity: 1, optionIds: [aoPonto!.id, bacon!.id, ovo!.id, queijo!.id] }],
      [{ itemId: f.chopp.id, quantity: 1, optionIds: [bacon!.id] }],
    ];
    for (const items of cases) expect((await order(cookie, items)).body.error.code).toBe('INVALID_OPTIONS');
  });

  it('item de outro restaurante → ITEM_UNAVAILABLE', async () => {
    expect((await order(cookie, [{ itemId: other.chopp.id, quantity: 1 }])).body.error.code).toBe('ITEM_UNAVAILABLE');
  });

  it('confirmação obrigatória desligada → nasce CONFIRMED', async () => {
    await prisma.restaurant.update({ where: { id: other.r.id }, data: { requireConfirmation: false } });
    const c = (await joinTable(other.codes[0]!)).cookie;
    expect((await order(c, [{ itemId: other.chopp.id, quantity: 1 }])).body.status).toBe('CONFIRMED');
  });

  it('máximo de 10 pedidos por sessão por hora (ORDER_LIMIT com retryAfterSec)', async () => {
    const c = (await joinTable(f.codes[1]!)).cookie;
    for (let i = 0; i < 10; i++) expect((await order(c, [{ itemId: f.chopp.id, quantity: 1 }])).status).toBe(201);
    const res = await order(c, [{ itemId: f.chopp.id, quantity: 1 }]);
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('ORDER_LIMIT');
    expect(res.body.error.retryAfterSec).toBeGreaterThan(3000);
  });

  it('restaurante suspenso ou fora do horário → só visualização (RESTAURANT_UNAVAILABLE)', async () => {
    const c = (await joinTable(f.codes[2]!)).cookie;
    await prisma.restaurant.update({ where: { id: f.r.id }, data: { status: 'SUSPENDED' } });
    expect((await order(c, [{ itemId: f.chopp.id, quantity: 1 }])).body.error.code).toBe('RESTAURANT_UNAVAILABLE');
    await prisma.restaurant.update({ where: { id: f.r.id }, data: { status: 'ACTIVE', openingHours: {} } }); // nenhum dia aberto
    expect((await order(c, [{ itemId: f.chopp.id, quantity: 1 }])).body.error.code).toBe('RESTAURANT_UNAVAILABLE');
    await prisma.restaurant.update({ where: { id: f.r.id }, data: { openingHours: undefined } });
  });

  it('KITCHEN só vê pedidos e itens do próprio setor', async () => {
    const bar = await f.token('KITCHEN', 'BAR');
    const list = (await request(app).get('/orders').set(bearer(bar))).body as PanelOrder[];
    expect(list.length).toBeGreaterThan(0);
    expect(list.flatMap((o) => o.items).every((i) => i.sector === 'BAR')).toBe(true);
    const waiter = await f.token('WAITER');
    const filtered = (await request(app).get('/orders?status=PENDING').set(bearer(waiter))).body as PanelOrder[];
    expect(filtered.every((o) => o.status === 'PENDING')).toBe(true);
  });

  it('sem cookie → 401; sessão fechada pelo garçom → SESSION_CLOSED', async () => {
    expect((await request(app).post('/public/orders').send({})).status).toBe(401);
    const join = await joinTable(f.codes[2]!);
    const waiter = await f.token('WAITER');
    const closed = await request(app).post(`/sessions/${join.res.body.session.id}/close`).set(bearer(waiter));
    expect(closed.body).toEqual({ id: join.res.body.session.id, status: 'CLOSED' });
    expect((await order(join.cookie, [{ itemId: f.chopp.id, quantity: 1 }])).body.error.code).toBe('SESSION_CLOSED');
    // novo acesso abre sessão nova
    expect((await joinTable(f.codes[2]!)).res.body.session.id).not.toBe(join.res.body.session.id);
  });
});
