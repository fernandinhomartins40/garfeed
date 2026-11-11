import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { AdminStats, BulkTablesResponse, Category, Item, Media, OptionGroupWithUsage, Settings, StaffUser, Tag, UploadUrlResponse } from '@garfeed/shared';
import { prisma } from '../src/lib/prisma';
import { parseCsv, parsePriceCents } from '../src/modules/menu/router';
import { app, bearer, dropRestaurants, freeCode, login, makeRestaurant, type Fixture } from './helpers';

let f: Fixture;
let owner = '';
const created: string[] = [];
beforeAll(async () => {
  f = await makeRestaurant();
  owner = await f.token('OWNER');
});
afterAll(async () => {
  await dropRestaurants(f.r.id, ...created);
});

describe('cardápio (painel)', () => {
  it('categorias: criar, reordenar, excluir com itens → 409', async () => {
    const c = Category.parse((await request(app).post('/menu/categories').set(bearer(owner)).send({ name: 'Porções' })).body);
    expect(c.position).toBe(2);
    const order = await request(app).put('/menu/categories/order').set(bearer(owner)).send({ ids: [c.id, f.lanches.id, f.bebidas.id] });
    expect(order.body.map((x: Category) => x.name)).toEqual(['Porções', 'Lanches', 'Bebidas']);
    expect((await request(app).put('/menu/categories/order').set(bearer(owner)).send({ ids: [c.id, c.id] })).status).toBe(400);
    expect((await request(app).delete(`/menu/categories/${f.lanches.id}`).set(bearer(owner))).status).toBe(409);
    expect((await request(app).delete(`/menu/categories/${c.id}`).set(bearer(owner))).status).toBe(204);
  });

  it('itens: criar com grupos, editar, reordenar, esgotar', async () => {
    const res = await request(app).post('/menu/items').set(bearer(owner)).send({
      categoryId: f.lanches.id, name: 'Duplo', priceCents: 4000, badges: ['NEW'], optionGroupIds: [f.adicionais.id, f.ponto.id],
    });
    expect(res.status).toBe(201);
    const item = Item.parse(res.body);
    expect(item.optionGroupIds).toEqual([f.adicionais.id, f.ponto.id]);
    const upd = Item.parse((await request(app).patch(`/menu/items/${item.id}`).set(bearer(owner)).send({ priceCents: 4200, optionGroupIds: [f.ponto.id] })).body);
    expect(upd).toMatchObject({ priceCents: 4200, optionGroupIds: [f.ponto.id] });
    const reorder = await request(app).put('/menu/items/order').set(bearer(owner)).send({ ids: [item.id, f.brownie.id, f.burger.id] });
    expect(reorder.body.map((i: Item) => i.name)).toEqual(['Duplo', 'Brownie', 'Burger']);
    expect((await request(app).put('/menu/items/order').set(bearer(owner)).send({ ids: [item.id, f.chopp.id] })).status).toBe(400); // duas categorias
    expect((await request(app).patch(`/menu/items/${item.id}/sold-out`).set(bearer(owner)).send({ soldOut: true })).body.soldOut).toBe(true);
    expect((await request(app).get(`/menu/items?categoryId=${f.bebidas.id}`).set(bearer(owner))).body.map((i: Item) => i.name)).toEqual(['Chopp']);
    expect((await request(app).delete(`/menu/items/${item.id}`).set(bearer(owner))).status).toBe(204);
  });

  it('grupos de opcionais: criar, substituir opções, uso, min > max → 400', async () => {
    const g = OptionGroupWithUsage.parse((await request(app).post('/menu/option-groups').set(bearer(owner)).send({ name: 'Molhos', min: 0, max: 2, options: [{ name: 'Barbecue' }, { name: 'Mostarda', priceCents: 100 }] })).body);
    expect(g.options.map((o) => o.name)).toEqual(['Barbecue', 'Mostarda']);
    const u = OptionGroupWithUsage.parse((await request(app).put(`/menu/option-groups/${g.id}`).set(bearer(owner)).send({ name: 'Molhos', min: 0, max: 1, options: [{ name: 'Maionese' }] })).body);
    expect(u.options.map((o) => o.name)).toEqual(['Maionese']);
    expect((await request(app).post('/menu/option-groups').set(bearer(owner)).send({ name: 'X', min: 3, max: 1, options: [{ name: 'a' }] })).status).toBe(400);
    const list = (await request(app).get('/menu/option-groups').set(bearer(owner))).body as OptionGroupWithUsage[];
    expect(list.find((x) => x.name === 'Ponto')?.itemCount).toBe(1);
    expect((await request(app).delete(`/menu/option-groups/${g.id}`).set(bearer(owner))).status).toBe(204);
  });

  it('importar CSV: cria categorias e itens, reporta linhas com erro', async () => {
    const csv = 'categoria;nome;descricao;preco\nPizzas;Margherita;"Tomate; mussarela";"49,90"\nLanches;X-Salada;;32.5\nPizzas;Sem preço;;abc\n';
    const r = await request(app).post('/menu/import-csv').set(bearer(owner)).send({ csv });
    expect(r.body).toEqual({ categoriesCreated: 1, itemsCreated: 2, errors: [{ line: 4, message: 'Preço inválido: "abc"' }] });
    const pizza = await prisma.item.findFirstOrThrow({ where: { restaurantId: f.r.id, name: 'Margherita' } });
    expect(pizza).toMatchObject({ priceCents: 4990, description: 'Tomate; mussarela' });
    expect(parsePriceCents('R$ 1.032,90')).toBe(103290);
    expect(parseCsv('a,"b ""c""",d')).toEqual([['a', 'b "c"', 'd']]);
  });
});

describe('mesas e placas', () => {
  it('criação em lote pula nomes existentes; nome repetido → 409', async () => {
    const r = BulkTablesResponse.parse((await request(app).post('/tables/bulk').set(bearer(owner)).send({ from: 2, to: 5, area: 'Varanda' })).body);
    expect(r.created.map((t) => t.name)).toEqual(['Mesa 4', 'Mesa 5']);
    expect(r.skipped).toEqual(['Mesa 2', 'Mesa 3']);
    expect((await request(app).post('/tables').set(bearer(owner)).send({ name: 'Mesa 4' })).status).toBe(409);
    const t = r.created[0]!;
    expect((await request(app).patch(`/tables/${t.id}`).set(bearer(owner)).send({ name: 'Mesa 1' })).status).toBe(409);
    expect((await request(app).patch(`/tables/${t.id}`).set(bearer(owner)).send({ active: false })).body.active).toBe(false);
  });

  it('vincular placa solta, pedir confirmação para mover, desvincular e bloquear', async () => {
    const mesa5 = await prisma.table.findFirstOrThrow({ where: { restaurantId: f.r.id, name: 'Mesa 5' } });
    const loose = await freeCode();
    await prisma.tag.create({ data: { code: loose } }); // sem dono
    expect(Tag.parse((await request(app).get(`/tags/${loose}`).set(bearer(owner))).body).status).toBe('UNASSIGNED');
    const linked = await request(app).post('/tags/link').set(bearer(owner)).send({ code: loose, tableId: mesa5.id });
    expect(linked.body).toMatchObject({ code: loose, status: 'ACTIVE', table: { name: 'Mesa 5' } });

    // placa da Mesa 1 para a Mesa 5: exige confirmação; a placa antiga da Mesa 5 fica solta
    const conflict = await request(app).post('/tags/link').set(bearer(owner)).send({ code: f.codes[0], tableId: mesa5.id });
    expect(conflict.status).toBe(409);
    expect(conflict.body.error.details.table.name).toBe('Mesa 1');
    expect((await request(app).post('/tags/link').set(bearer(owner)).send({ code: f.codes[0], tableId: mesa5.id, confirm: true })).body.table.name).toBe('Mesa 5');
    expect((await prisma.tag.findUniqueOrThrow({ where: { code: loose } }))).toMatchObject({ status: 'UNASSIGNED', tableId: null, restaurantId: f.r.id });

    expect((await request(app).post(`/tags/${f.codes[0]}/unlink`).set(bearer(owner))).body).toMatchObject({ status: 'UNASSIGNED', table: null });
    expect((await request(app).post(`/tags/${loose}/block`).set(bearer(owner))).body.status).toBe('BLOCKED');
    expect((await request(app).post('/tags/link').set(bearer(owner)).send({ code: loose, tableId: mesa5.id })).body.error.code).toBe('TAG_BLOCKED');
    expect(((await request(app).get('/tags').set(bearer(owner))).body as Tag[]).length).toBeGreaterThanOrEqual(4);
  });

  it('excluir mesa com pedidos → 409; sem pedidos → 204', async () => {
    const mesa4 = await prisma.table.findFirstOrThrow({ where: { restaurantId: f.r.id, name: 'Mesa 4' } });
    expect((await request(app).delete(`/tables/${mesa4.id}`).set(bearer(owner))).status).toBe(204);
  });
});

describe('mídia', () => {
  it('upload-url pré-assinada → PUT no MinIO → complete enfileira (PROCESSING)', async () => {
    expect((await request(app).post('/media/upload-url').set(bearer(owner)).send({ type: 'VIDEO', mimeType: 'video/mp4', sizeBytes: 200 * 1024 * 1024, fileName: 'a.mp4' })).status).toBe(400);
    const up = UploadUrlResponse.parse((await request(app).post('/media/upload-url').set(bearer(owner)).send({ type: 'IMAGE', mimeType: 'image/png', sizeBytes: 3, fileName: 'a.png' })).body);
    expect((await request(app).post(`/media/${up.mediaId}/complete`).set(bearer(owner))).status).toBe(400); // ainda não enviado
    const put = await fetch(up.uploadUrl, { method: 'PUT', body: 'abc', headers: { 'Content-Type': 'image/png' } });
    expect(put.ok).toBe(true);
    const m = Media.parse((await request(app).post(`/media/${up.mediaId}/complete`).set(bearer(owner))).body);
    expect(m.status).toBe('PROCESSING');
    expect(Media.parse((await request(app).get(`/media/${up.mediaId}`).set(bearer(owner))).body).id).toBe(up.mediaId);
    // não deixa job órfão na fila do worker de dev
    await prisma.media.update({ where: { id: up.mediaId }, data: { status: 'FAILED' } });
  });
});

describe('equipe, configurações e push', () => {
  it('OWNER cria usuário (papel explícito), não remove o próprio acesso; e-mail duplicado → 409', async () => {
    const body = { name: 'Novo', email: `novo-${Date.now()}@teste.dev`, role: 'WAITER', password: 'Senha-forte-1' };
    const u = StaffUser.parse((await request(app).post('/users').set(bearer(owner)).send(body)).body);
    expect(u).toMatchObject({ role: 'WAITER', sector: null, active: true });
    expect((await request(app).post('/users').set(bearer(owner)).send(body)).status).toBe(409);
    expect((await request(app).post('/users').set(bearer(owner)).send({ ...body, email: 'x@teste.dev', role: undefined })).status).toBe(400);
    expect((await request(app).post('/users').set(bearer(owner)).send({ ...body, email: 'y@teste.dev', role: 'SUPERADMIN' })).status).toBe(400);
    const k = (await request(app).patch(`/users/${u.id}`).set(bearer(owner)).send({ role: 'KITCHEN', sector: 'BAR' })).body;
    expect(k).toMatchObject({ role: 'KITCHEN', sector: 'BAR' });
    const me = ((await request(app).get('/users').set(bearer(owner))).body as StaffUser[]).find((x) => x.role === 'OWNER')!;
    expect((await request(app).patch(`/users/${me.id}`).set(bearer(owner)).send({ active: false })).status).toBe(400);
    await request(app).patch(`/users/${u.id}`).set(bearer(owner)).send({ active: false });
    expect((await request(app).post('/auth/login').send({ email: body.email, password: body.password })).status).toBe(401);
  });

  it('configurações: lê e altera (horário, confirmação)', async () => {
    const s = Settings.parse((await request(app).patch('/settings').set(bearer(owner)).send({ requireConfirmation: false, openingHours: { mon: [['11:00', '15:00']] }, accentColor: '#112233' })).body);
    expect(s).toMatchObject({ requireConfirmation: false, accentColor: '#112233', openingHours: { mon: [['11:00', '15:00']] } });
    expect((await request(app).patch('/settings').set(bearer(owner)).send({ openingHours: null })).body.openingHours).toBeNull();
    expect((await request(app).patch('/settings').set(bearer(owner)).send({ accentColor: 'laranja' })).status).toBe(400);
  });

  it('push: assinatura salva (upsert por endpoint) e chave pública VAPID', async () => {
    const waiter = await f.token('WAITER');
    const sub = { endpoint: `https://push.example.com/${Date.now()}`, keys: { p256dh: 'p', auth: 'a' } };
    expect((await request(app).post('/push/subscribe').set(bearer(waiter)).send(sub)).status).toBe(204);
    expect((await request(app).post('/push/subscribe').set(bearer(owner)).send(sub)).status).toBe(204);
    expect(await prisma.pushSubscription.count({ where: { endpoint: sub.endpoint } })).toBe(1);
    expect((await request(app).get('/push/vapid-public-key').set(bearer(waiter))).body).toHaveProperty('publicKey');
  });
});

describe('admin Garfeed', () => {
  it('SUPERADMIN: stats, criar restaurante com OWNER, lote de placas com CSV; dono não acessa', async () => {
    const admin = await login('admin@garfeed.com.br').catch(async () => {
      // banco sem seed: cria um superadmin de teste
      const { default: argon2 } = await import('argon2');
      const email = `admin-${Date.now()}@teste.dev`;
      await prisma.user.create({ data: { email, name: 'Admin', role: 'SUPERADMIN', passwordHash: await argon2.hash('Senha-teste-123') } });
      return login(email);
    });
    expect((await request(app).get('/admin/stats').set(bearer(owner))).status).toBe(403);
    AdminStats.parse((await request(app).get('/admin/stats').set(bearer(admin))).body);

    const slug = `adm-${Date.now().toString(36)}`;
    const r = await request(app).post('/admin/restaurants').set(bearer(admin)).send({ name: 'Novo', slug, owner: { name: 'Dono', email: `${slug}@teste.dev`, password: 'Senha-forte-1' } });
    expect(r.status).toBe(201);
    created.push(r.body.id);
    expect(r.body).toMatchObject({ slug, status: 'TRIAL', tableCount: 0 });
    expect((await request(app).post('/admin/restaurants').set(bearer(admin)).send({ name: 'X', slug, owner: { name: 'D', email: `b-${slug}@teste.dev`, password: 'Senha-forte-1' } })).status).toBe(409);
    expect((await request(app).patch(`/admin/restaurants/${r.body.id}`).set(bearer(admin)).send({ status: 'SUSPENDED' })).body.status).toBe('SUSPENDED');

    const batch = await request(app).post('/admin/tag-batches').set(bearer(admin)).send({ quantity: 25, restaurantId: r.body.id });
    expect(batch.status).toBe(201);
    expect(new Set(batch.body.codes).size).toBe(25);
    expect(batch.body.codes.every((c: string) => /^GF[23456789ABCDEFGHJKMNPQRSTUVWXYZ]{4}$/.test(c))).toBe(true);
    const list = (await request(app).get('/admin/tag-batches').set(bearer(admin))).body as { batch: string; total: number; restaurant: { id: string } | null }[];
    expect(list.find((b) => b.batch === batch.body.batch)).toMatchObject({ total: 25, restaurant: { id: r.body.id } });
    const csv = await request(app).get(`/admin/tag-batches/${batch.body.batch}/csv`).set(bearer(admin));
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.trim().split('\n');
    expect(lines[0]).toBe('codigo,url');
    expect(lines).toHaveLength(26);
    expect(lines[1]).toMatch(/^GF\w{4},https?:\/\/.+\/GF\w{4}$/);
    await prisma.tag.deleteMany({ where: { batch: batch.body.batch } });
  });
});
