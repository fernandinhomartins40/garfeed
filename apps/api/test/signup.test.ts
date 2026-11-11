// Autoatendimento: cadastro do restaurante (POST /auth/signup) e assinatura pelo próprio dono (/settings/billing).
// O cliente do Asaas é trocado por um falso — nenhum teste chama a API real; o mailer é capturado.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { AuthResponse, COOKIES, OwnerBilling } from '@garfeed/shared';

vi.hoisted(() => {
  // garantia extra: mesmo que o .env local tenha chave, os testes nunca falam com o Asaas
  process.env.ASAAS_API_KEY = '';
  process.env.ASAAS_API_URL = 'http://127.0.0.1:9';
});

import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { asaas } from '../src/lib/asaas';
import { transport, type Mail } from '../src/lib/mailer';
import { slugify } from '../src/modules/auth/router';
import { app, bearer, dropRestaurants, makeRestaurant, type Fixture } from './helpers';

const outbox: Mail[] = [];
vi.spyOn(transport, 'deliver').mockImplementation(async (m) => { outbox.push(m); });

const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const NAME = `Cantina Açaí & Pão ${uid}`;
const mail = (n: string) => `dono-${n}-${uid}@teste.dev`;
const body = (n: string, extra: object = {}) => ({ restaurantName: NAME, name: 'Maria Dona', email: mail(n), password: 'senha-forte-123', acceptTerms: true, ...extra });
const signup = (b: object) => request(app).post('/auth/signup').send(b);
const iso = (plusDays: number) => new Date(Date.now() + plusDays * 86_400_000).toISOString().slice(0, 10);

let a: Fixture; // faz o papel do "Brasa & Pão": restaurante que já existia, com cardápio, mesas e placas
let b: Fixture;

beforeAll(async () => { [a, b] = await Promise.all([makeRestaurant({ status: 'TRIAL' }), makeRestaurant()]); });
beforeEach(async () => {
  const keys = await redis.keys('rl:signup:*'); // zera o limite de cadastros entre os casos
  if (keys.length) await redis.del(...keys);
});
afterAll(async () => {
  vi.restoreAllMocks();
  const mine = await prisma.restaurant.findMany({ where: { name: NAME }, select: { id: true } });
  await dropRestaurants(a.r.id, b.r.id, ...mine.map((r) => r.id));
});

describe('cadastro do restaurante (POST /auth/signup)', () => {
  it('slugify: sem acento, sem símbolo, nunca vazio', () => {
    expect(slugify('Brasa & Pão')).toBe('brasa-pao');
    expect(slugify('  Açaí do Zé!  ')).toBe('acai-do-ze');
    expect(slugify('🍕🍕')).toBe('restaurante');
    expect(slugify('x'.repeat(49) + ' y')).toBe('x'.repeat(49));
  });

  it('cadastro feliz: entra logado, restaurante TRIAL/Essencial, dono OWNER, e-mail de boas-vindas sem link de senha', async () => {
    const res = await signup(body('1', { email: `DONO-1-${uid}@Teste.dev` }));
    expect(res.status).toBe(201);
    const auth = AuthResponse.parse(res.body);
    expect(auth.user).toMatchObject({ role: 'OWNER', email: mail('1'), name: 'Maria Dona' });
    expect(auth.restaurant).toMatchObject({ name: NAME, slug: slugify(NAME), status: 'TRIAL', plan: 'ESSENTIAL' });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).find((c) => c.startsWith(`${COOKIES.refresh}=`))!;
    expect(cookie).toMatch(/HttpOnly/i);

    // a sessão vale: token de acesso, refresh pelo cookie e login com a senha escolhida
    const settings = await request(app).get('/settings').set(bearer(auth.accessToken));
    expect(settings.body).toMatchObject({ id: auth.restaurant!.id, timezone: 'America/Sao_Paulo', status: 'TRIAL' });
    expect((await request(app).post('/auth/refresh').set('Cookie', cookie.split(';')[0]!)).status).toBe(200);
    expect((await request(app).post('/auth/login').send({ email: mail('1'), password: 'senha-forte-123' })).status).toBe(200);
    expect((await prisma.user.findUniqueOrThrow({ where: { email: mail('1') } })).passwordHash).not.toContain('senha-forte-123');

    const bill = OwnerBilling.parse((await request(app).get('/settings/billing').set(bearer(auth.accessToken))).body);
    expect(bill).toMatchObject({ status: 'TRIAL', billingStatus: 'NONE', subscribed: false, customer: null });
    expect(bill.trialEndsAt!.slice(0, 10)).toBe(iso(30));

    await vi.waitFor(() => expect(outbox.filter((m) => m.to === mail('1'))).toHaveLength(1));
    const welcome = outbox.find((m) => m.to === mail('1'))!;
    expect(welcome.subject).toBe('Bem-vindo ao Garfeed, Maria!');
    expect(welcome.text).toContain('/login');
    expect(welcome.text).not.toContain('token=');
  });

  it('e-mail já cadastrado → 409 claro, sem criar outro restaurante', async () => {
    const before = await prisma.restaurant.count({ where: { name: NAME } });
    const res = await signup(body('1'));
    expect(res.status).toBe(409);
    expect(res.body.error).toMatchObject({ code: 'CONFLICT', message: expect.stringContaining('já tem cadastro') });
    expect(res.headers['set-cookie']).toBeUndefined();
    expect(await prisma.restaurant.count({ where: { name: NAME } })).toBe(before);
  });

  it('termos não aceitos, senha fraca ou campos faltando → 400, nada criado', async () => {
    for (const bad of [{ acceptTerms: false }, { acceptTerms: undefined }, { password: '1234567' }, { restaurantName: ' ' }, { email: 'nao-e-email' }]) {
      const res = await signup(body('2', bad));
      expect(res.status, JSON.stringify(bad)).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION');
    }
    expect(await prisma.user.count({ where: { email: mail('2') } })).toBe(0);
  });

  it('slug em colisão ganha sufixo; papel/plano/status forjados no corpo são ignorados', async () => {
    const two = await signup(body('3', { role: 'SUPERADMIN', status: 'ACTIVE', plan: 'NETWORK', slug: a.r.slug, restaurantId: a.r.id }));
    const three = await signup(body('4'));
    expect([two.status, three.status]).toEqual([201, 201]);
    expect(two.body.restaurant).toMatchObject({ slug: `${slugify(NAME)}-2`, status: 'TRIAL', plan: 'ESSENTIAL' });
    expect(two.body.user).toMatchObject({ role: 'OWNER' });
    expect(two.body.user.restaurantId).not.toBe(a.r.id);
    expect(three.body.restaurant.slug).toBe(`${slugify(NAME)}-3`);
  });

  it('isolamento: o novo dono começa vazio e não lê nem altera dados de quem já existia', async () => {
    const t = (await signup(body('5'))).body.accessToken as string;
    for (const path of ['/menu/categories', '/menu/items', '/tables', '/tags', '/orders', '/calls']) {
      const res = await request(app).get(path).set(bearer(t));
      expect(res.status, path).toBe(200);
      expect(res.body, path).toEqual([]);
    }
    expect((await request(app).get('/users').set(bearer(t))).body).toHaveLength(1); // só ele mesmo
    const seed = await prisma.item.findFirst({ where: { restaurant: { name: 'Brasa & Pão' } }, select: { id: true } });
    for (const id of [a.burger.id, ...(seed ? [seed.id] : [])]) {
      expect((await request(app).get(`/menu/items/${id}`).set(bearer(t))).status).toBe(404);
      expect((await request(app).patch(`/menu/items/${id}`).set(bearer(t)).send({ name: 'invadido' })).status).toBe(404);
    }
    expect((await request(app).post('/tags/link').set(bearer(t)).send({ code: a.codes[0], tableId: a.tables[0]!.id })).status).toBeGreaterThanOrEqual(400);
    expect((await prisma.item.findUniqueOrThrow({ where: { id: a.burger.id } })).name).toBe('Burger');
  });

  it('rate limit: 5 cadastros por IP por hora → 429', async () => {
    for (let i = 0; i < 5; i++) expect((await signup({})).status).toBe(400);
    const blocked = await signup(body('6'));
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
    expect(await prisma.user.count({ where: { email: mail('6') } })).toBe(0);
  });
});

describe('assinatura pelo próprio dono (/settings/billing/subscription)', () => {
  const CUS = `cus_own_${uid}`;
  const SUB = `sub_own_${uid}`;
  const CUSTOMER = { cpfCnpj: '11.222.333/0001-81', email: 'Financeiro@Teste.dev', phone: '(11) 98888-7777' };
  let owner = '';
  let ownerB = '';
  const sub = (method: 'post' | 'patch' | 'delete', token: string, data?: object) => request(app)[method]('/settings/billing/subscription').set(bearer(token)).send(data);
  const billingOf = (id: string) => prisma.billing.findUnique({ where: { restaurantId: id } });

  beforeAll(async () => { [owner, ownerB] = await Promise.all([a.token('OWNER'), b.token('OWNER')]); });

  it('só o OWNER: gerente, garçom e cozinha recebem 403; sem login, 401', async () => {
    for (const role of ['MANAGER', 'WAITER', 'KITCHEN'] as const) {
      const t = await a.token(role);
      expect((await sub('post', t, { ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY' })).status, role).toBe(403);
      expect((await sub('patch', t, { plan: 'PRO', cycle: 'MONTHLY' })).status, role).toBe(403);
      expect((await sub('delete', t)).status, role).toBe(403);
    }
    expect((await request(app).post('/settings/billing/subscription').send({ ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(401);
    expect(await billingOf(a.r.id)).toBeNull();
  });

  it('validação: CPF/CNPJ inválido, plano Rede (sob consulta) e ciclo inexistente → 400', async () => {
    expect((await sub('post', owner, { ...CUSTOMER, cpfCnpj: '123', plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(400);
    expect((await sub('post', owner, { plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(400);
    expect((await sub('post', owner, { ...CUSTOMER, plan: 'NETWORK', cycle: 'MONTHLY', valueCents: 100 })).status).toBe(400);
    expect((await sub('post', owner, { ...CUSTOMER, plan: 'PRO', cycle: 'WEEKLY' })).status).toBe(400);
    expect((await sub('patch', owner, { plan: 'NETWORK', cycle: 'MONTHLY' })).status).toBe(400);
  });

  it('sem ASAAS_API_KEY → 503 BILLING_DISABLED, sem assinatura', async () => {
    const res = await sub('post', owner, { ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_DISABLED');
    expect((await billingOf(a.r.id))?.asaasSubscriptionId ?? null).toBeNull();
  });

  it('trava contra clique duplo: operação em andamento → 409', async () => {
    await redis.set(`billing:lock:${a.r.id}`, '1', 'EX', 60);
    try { expect((await sub('post', owner, { ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(409); }
    finally { await redis.del(`billing:lock:${a.r.id}`); }
  });

  it('dono assina: preço da tabela (valor e restaurante forjados são ignorados), 1º vencimento no fim do teste, fatura na resposta', async () => {
    const createCustomer = vi.spyOn(asaas, 'createCustomer').mockResolvedValue({ id: CUS });
    const createSubscription = vi.spyOn(asaas, 'createSubscription').mockImplementation(async (s) => ({ id: SUB, value: s.valueCents / 100, nextDueDate: s.nextDueDate }));
    vi.spyOn(asaas, 'subscriptionPayments').mockImplementation(async () => ({
      data: [{ id: `pay_own_${uid}`, value: 199, dueDate: createSubscription.mock.calls[0]![0].nextDueDate, status: 'PENDING', invoiceUrl: 'https://sandbox.asaas.com/i/own' }],
    }));

    const res = await sub('post', owner, { ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY', valueCents: 1, value: 0.01, restaurantId: b.r.id, nextDueDate: '2099-01-01', status: 'OK' });
    expect(res.status).toBe(201);
    const bill = OwnerBilling.parse(res.body);
    expect(bill).toMatchObject({
      plan: 'PRO', status: 'TRIAL', billingStatus: 'PENDING', subscribed: true, cycle: 'MONTHLY', valueCents: 19_900,
      openInvoiceUrl: 'https://sandbox.asaas.com/i/own', customer: { cpfCnpj: '11222333000181', email: 'financeiro@teste.dev', phone: '11988887777' },
    });
    expect(createCustomer).toHaveBeenCalledWith(expect.objectContaining({ cpfCnpj: '11222333000181', externalReference: a.r.id }));
    const sent = createSubscription.mock.calls[0]![0];
    expect(sent).toMatchObject({ customer: CUS, valueCents: 19_900, cycle: 'MONTHLY', externalReference: a.r.id });
    // TRIAL recém-criado: a cobrança só vence no fim dos 30 dias (margem de 1 dia pelo fuso)
    expect(sent.nextDueDate >= iso(29) && sent.nextDueDate <= iso(30)).toBe(true);
    expect(await billingOf(a.r.id)).toMatchObject({ asaasCustomerId: CUS, asaasSubscriptionId: SUB, valueCents: 19_900 });
    expect(await billingOf(b.r.id)).toBeNull();

    expect((await sub('post', owner, { ...CUSTOMER, plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(409); // já assinou
    expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it('dono troca de plano/ciclo: anual = 10 mensalidades, valor forjado ignorado', async () => {
    const update = vi.spyOn(asaas, 'updateSubscription').mockImplementation(async (id, s) => ({ id, value: s.valueCents / 100, nextDueDate: iso(30) }));
    const res = await sub('patch', owner, { plan: 'ESSENTIAL', cycle: 'YEARLY', valueCents: 5 });
    expect(res.status).toBe(200);
    expect(OwnerBilling.parse(res.body)).toMatchObject({ plan: 'ESSENTIAL', cycle: 'YEARLY', valueCents: 129_000, subscribed: true });
    expect(update).toHaveBeenLastCalledWith(SUB, expect.objectContaining({ valueCents: 129_000, cycle: 'YEARLY' }));
  });

  it('dono de outro restaurante não troca nem cancela a assinatura alheia', async () => {
    const del = vi.spyOn(asaas, 'deleteSubscription').mockResolvedValue({ id: SUB, deleted: true });
    expect((await sub('patch', ownerB, { plan: 'PRO', cycle: 'MONTHLY', restaurantId: a.r.id })).status).toBe(409); // ele não tem assinatura
    expect((await sub('delete', ownerB, { restaurantId: a.r.id })).status).toBe(409);
    expect(del).not.toHaveBeenCalled();
    expect(await billingOf(a.r.id)).toMatchObject({ asaasSubscriptionId: SUB, cycle: 'YEARLY', valueCents: 129_000 });
    const seen = OwnerBilling.parse((await request(app).get('/settings/billing').set(bearer(ownerB))).body);
    expect(seen).toMatchObject({ subscribed: false, billingStatus: 'NONE', customer: null, payments: [] });
  });

  it('dono cancela: remove no Asaas (falso), situação Cancelada, restaurante segue como estava', async () => {
    const del = vi.spyOn(asaas, 'deleteSubscription').mockResolvedValue({ id: SUB, deleted: true });
    const res = await sub('delete', owner);
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith(SUB);
    expect(OwnerBilling.parse(res.body)).toMatchObject({ status: 'TRIAL', billingStatus: 'CANCELED', subscribed: false, cycle: null, valueCents: null, openInvoiceUrl: null, payments: [] });
    expect((await sub('delete', owner)).status).toBe(409);
  });
});
