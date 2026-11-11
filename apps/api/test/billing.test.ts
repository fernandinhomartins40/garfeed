// Cobrança (Asaas): admin, dono e webhook. O cliente do Asaas é trocado por um falso — nenhum teste chama a API real.
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { AdminBillingDetail, AdminBillingList, menuCacheKey, OwnerBilling } from '@garfeed/shared';

const TOKEN = vi.hoisted(() => {
  const token = 'token-de-teste-do-webhook-asaas-com-mais-de-32';
  process.env.ASAAS_WEBHOOK_TOKEN = token;
  // garantia extra: mesmo que o .env local tenha chave, os testes nunca falam com o Asaas
  process.env.ASAAS_API_KEY = '';
  process.env.ASAAS_API_URL = 'http://127.0.0.1:9';
  return token;
});

import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { asaas } from '../src/lib/asaas';
import { suspendOverdue } from '../src/jobs/billing';
import { app, bearer, dropRestaurants, login, makeRestaurant, password, type Fixture } from './helpers';

let a: Fixture;
let b: Fixture;
let admin = '';
let adminId = '';
const uid = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
const CUS = `cus_${uid}`;
const SUB = `sub_${uid}`;
const iso = (plusDays: number) => new Date(Date.now() + plusDays * 86_400_000).toISOString().slice(0, 10);
let evtSeq = 0;

const hook = (body: object, token: string | null = TOKEN) => {
  const req = request(app).post('/webhooks/asaas');
  return (token === null ? req : req.set('asaas-access-token', token)).send(body);
};
const payment = (event: string, id: string, status: string, dueDate: string, extra: object = {}) => ({
  id: `evt_${uid}_${++evtSeq}`, event,
  payment: { id: `pay_${uid}_${id}`, customer: CUS, subscription: SUB, value: 199, dueDate, status, invoiceUrl: `https://sandbox.asaas.com/i/${id}`, ...extra },
});
const restStatus = async (id = a.r.id) => (await prisma.restaurant.findUniqueOrThrow({ where: { id } })).status;
const billing = async () => prisma.billing.findUniqueOrThrow({ where: { restaurantId: a.r.id } });

beforeAll(async () => {
  a = await makeRestaurant({ status: 'TRIAL' });
  b = await makeRestaurant();
  const email = `admin-${uid}@teste.dev`;
  adminId = (await prisma.user.create({ data: { name: 'Admin', email, role: 'SUPERADMIN', passwordHash: await argon2.hash(password) } })).id;
  admin = await login(email);
});
afterAll(async () => {
  vi.restoreAllMocks();
  await prisma.billingEvent.deleteMany({ where: { id: { startsWith: `evt_${uid}` } } });
  await prisma.user.delete({ where: { id: adminId } });
  await dropRestaurants(a.r.id, b.r.id);
});

describe('cobrança: RBAC e isolamento', () => {
  it('só SUPERADMIN acessa /admin/billing; só OWNER acessa /settings/billing', async () => {
    for (const role of ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'] as const) {
      const t = await a.token(role);
      expect((await request(app).get('/admin/billing').set(bearer(t))).status, role).toBe(403);
      expect((await request(app).post(`/admin/billing/${a.r.id}/subscription`).set(bearer(t)).send({ plan: 'PRO', cycle: 'MONTHLY' })).status, role).toBe(403);
      expect((await request(app).get('/settings/billing').set(bearer(t))).status, role).toBe(role === 'OWNER' ? 200 : 403);
    }
    expect((await request(app).get('/settings/billing')).status).toBe(401);
    expect((await request(app).get('/admin/billing')).status).toBe(401);
    expect((await request(app).get('/settings/billing').set(bearer(admin))).status).toBe(403);
  });
});

describe('cobrança: admin', () => {
  it('valida CPF/CNPJ e grava o contato de cobrança', async () => {
    const put = (body: object) => request(app).put(`/admin/billing/${a.r.id}/customer`).set(bearer(admin)).send(body);
    expect((await put({ cpfCnpj: '123' })).status).toBe(400);
    expect((await put({ cpfCnpj: '11.222.333/0001-81', phone: '11 9999' })).status).toBe(400);
    const ok = await put({ cpfCnpj: '11.222.333/0001-81', email: 'Financeiro@Teste.dev', phone: '(11) 98888-7777' });
    expect(ok.status).toBe(200);
    expect(AdminBillingDetail.parse(ok.body).billing).toMatchObject({ cpfCnpj: '11222333000181', email: 'financeiro@teste.dev', phone: '11988887777', subscribed: false, status: 'NONE' });
    expect((await request(app).put('/admin/billing/nao-existe/customer').set(bearer(admin)).send({ cpfCnpj: '11222333000181' })).status).toBe(404);
  });

  it('sem ASAAS_API_KEY a cobrança fica desligada: erro claro e nada muda', async () => {
    const list = AdminBillingList.parse((await request(app).get('/admin/billing').set(bearer(admin))).body);
    expect(list.enabled).toBe(false);
    const res = await request(app).post(`/admin/billing/${a.r.id}/subscription`).set(bearer(admin)).send({ plan: 'PRO', cycle: 'MONTHLY' });
    expect(res.status).toBe(503);
    expect(res.body.error.code).toBe('BILLING_DISABLED');
    expect((await billing()).asaasSubscriptionId).toBeNull();
  });

  it('ativar assinatura: cria cliente + assinatura no Asaas (falso) com o preço da tabela', async () => {
    const createCustomer = vi.spyOn(asaas, 'createCustomer').mockResolvedValue({ id: CUS });
    const createSubscription = vi.spyOn(asaas, 'createSubscription').mockImplementation(async (s) => ({ id: SUB, value: s.valueCents / 100, nextDueDate: s.nextDueDate }));
    const post = (body: object, id = a.r.id) => request(app).post(`/admin/billing/${id}/subscription`).set(bearer(admin)).send(body);

    expect((await post({ plan: 'PRO', cycle: 'MONTHLY' }, b.r.id)).status).toBe(400); // sem CPF/CNPJ
    expect((await post({ plan: 'NETWORK', cycle: 'MONTHLY' })).status).toBe(400); // Rede exige valor
    expect((await post({ plan: 'PRO', cycle: 'MONTHLY', valueCents: 100 })).status).toBe(400);
    expect((await post({ plan: 'PRO', cycle: 'MONTHLY', nextDueDate: iso(-2) })).status).toBe(400);
    expect(createSubscription).not.toHaveBeenCalled();

    const res = await post({ plan: 'PRO', cycle: 'MONTHLY', nextDueDate: iso(5) });
    expect(res.status).toBe(201);
    const d = AdminBillingDetail.parse(res.body);
    expect(d).toMatchObject({ plan: 'PRO', status: 'TRIAL', billing: { subscribed: true, cycle: 'MONTHLY', valueCents: 19_900, nextDueDate: iso(5), status: 'PENDING' } });
    expect(createCustomer).toHaveBeenCalledWith({ name: a.r.name, cpfCnpj: '11222333000181', email: 'financeiro@teste.dev', phone: '11988887777', externalReference: a.r.id });
    expect(createSubscription).toHaveBeenCalledWith(expect.objectContaining({ customer: CUS, valueCents: 19_900, cycle: 'MONTHLY', nextDueDate: iso(5), externalReference: a.r.id }));
    expect(await billing()).toMatchObject({ asaasCustomerId: CUS, asaasSubscriptionId: SUB });

    expect((await post({ plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(409); // já tem assinatura
    expect(createSubscription).toHaveBeenCalledTimes(1);
  });

  it('trocar plano/ciclo/valor: anual = 10 mensalidades; valor manual', async () => {
    const update = vi.spyOn(asaas, 'updateSubscription').mockImplementation(async (id, s) => ({ id, value: s.valueCents / 100, nextDueDate: iso(5) }));
    const patch = (body: object) => request(app).patch(`/admin/billing/${a.r.id}/subscription`).set(bearer(admin)).send(body);
    const yearly = AdminBillingDetail.parse((await patch({ plan: 'ESSENTIAL', cycle: 'YEARLY' })).body);
    expect(yearly).toMatchObject({ plan: 'ESSENTIAL', billing: { cycle: 'YEARLY', valueCents: 129_000 } });
    expect(update).toHaveBeenLastCalledWith(SUB, expect.objectContaining({ valueCents: 129_000, cycle: 'YEARLY' }));
    const custom = AdminBillingDetail.parse((await patch({ plan: 'NETWORK', cycle: 'MONTHLY', valueCents: 45_050 })).body);
    expect(custom).toMatchObject({ plan: 'NETWORK', billing: { cycle: 'MONTHLY', valueCents: 45_050 } });
    // o Asaas devolveu outro valor → erro, nada gravado
    update.mockResolvedValueOnce({ id: SUB, value: 1, nextDueDate: iso(5) });
    expect((await patch({ plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(502);
    expect((await billing()).valueCents).toBe(45_050);
    expect((await patch({ plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(200);
    expect((await request(app).patch(`/admin/billing/${b.r.id}/subscription`).set(bearer(admin)).send({ plan: 'PRO', cycle: 'MONTHLY' })).status).toBe(409);
  });
});

describe('webhook do Asaas', () => {
  it('token errado ou ausente → 401, sem efeito', async () => {
    const evt = payment('PAYMENT_RECEIVED', 'x', 'RECEIVED', iso(5));
    expect((await hook(evt, 'token-errado')).status).toBe(401);
    expect((await hook(evt, null)).status).toBe(401);
    expect((await hook(evt, `${TOKEN}x`)).status).toBe(401);
    expect(await prisma.billingPayment.count({ where: { restaurantId: a.r.id } })).toBe(0);
    expect(await restStatus()).toBe('TRIAL');
  });

  it('evento de cliente que não é do Garfeed (ou cobrança avulsa) → 200 sem efeito', async () => {
    const other = payment('PAYMENT_RECEIVED', 'outro', 'RECEIVED', iso(5), { customer: 'cus_de_outro_negocio' });
    const res = await hook(other);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ received: true, ignored: true });
    expect((await hook(payment('PAYMENT_RECEIVED', 'avulsa', 'RECEIVED', iso(5), { subscription: null }))).body.ignored).toBe(true);
    expect((await hook({ id: `evt_${uid}_ruim`, event: 'PAYMENT_RECEIVED', payment: { id: 1 } })).body.ignored).toBe(true); // formato inesperado
    expect(await prisma.billingPayment.count({ where: { asaasId: { startsWith: `pay_${uid}` } } })).toBe(0);
    expect(await prisma.billingEvent.count({ where: { id: { startsWith: `evt_${uid}` } } })).toBe(0);
    expect(await restStatus()).toBe('TRIAL');
  });

  it('cobrança criada → espelho + fatura em aberto para o dono', async () => {
    expect((await hook(payment('PAYMENT_CREATED', '1', 'PENDING', iso(5)))).body).toEqual({ received: true });
    const mine = OwnerBilling.parse((await request(app).get('/settings/billing').set(bearer(await a.token('OWNER')))).body);
    expect(mine).toMatchObject({ plan: 'PRO', status: 'TRIAL', billingStatus: 'PENDING', cycle: 'MONTHLY', valueCents: 19_900, nextDueDate: iso(5), openInvoiceUrl: 'https://sandbox.asaas.com/i/1' });
    expect(mine.payments).toMatchObject([{ valueCents: 19_900, dueDate: iso(5), status: 'PENDING', paidAt: null }]);
    expect(await restStatus()).toBe('TRIAL'); // trial segue funcionando
  });

  it('isolamento: o dono de outro restaurante não vê nada disso', async () => {
    const other = OwnerBilling.parse((await request(app).get('/settings/billing').set(bearer(await b.token('OWNER')))).body);
    expect(other).toMatchObject({ billingStatus: 'NONE', cycle: null, valueCents: null, nextDueDate: null, openInvoiceUrl: null, payments: [] });
  });

  it('pagamento confirmado → restaurante ACTIVE, cache do cardápio invalidado; evento repetido é idempotente', async () => {
    await redis.set(menuCacheKey(a.r.id), '{}');
    const evt = payment('PAYMENT_CONFIRMED', '1', 'CONFIRMED', iso(5), { confirmedDate: iso(0) });
    expect((await hook(evt)).body).toEqual({ received: true });
    expect(await restStatus()).toBe('ACTIVE');
    expect((await billing()).status).toBe('OK');
    expect(await redis.get(menuCacheKey(a.r.id))).toBeNull();
    expect(await prisma.billingPayment.findMany({ where: { restaurantId: a.r.id } })).toMatchObject([{ status: 'CONFIRMED', paidAt: new Date(`${iso(0)}T00:00:00Z`) }]);

    // mesma entrega de novo (at least once): 200, sem reprocessar
    await prisma.restaurant.update({ where: { id: a.r.id }, data: { status: 'SUSPENDED' } });
    const again = await hook(evt);
    expect(again.status).toBe(200);
    expect(again.body).toEqual({ received: true, duplicate: true });
    expect(await restStatus()).toBe('SUSPENDED');
    expect(await prisma.billingPayment.count({ where: { restaurantId: a.r.id } })).toBe(1);
    await prisma.restaurant.update({ where: { id: a.r.id }, data: { status: 'ACTIVE' } });
  });

  it('vencido: pendência na hora; SUSPENDED só depois da tolerância; pagamento posterior reativa', async () => {
    expect((await hook(payment('PAYMENT_CREATED', '2', 'PENDING', iso(-1)))).status).toBe(200);
    expect((await hook(payment('PAYMENT_OVERDUE', '2', 'OVERDUE', iso(-1)))).status).toBe(200);
    expect((await billing()).status).toBe('OVERDUE');
    expect(await restStatus()).toBe('ACTIVE'); // dentro dos 7 dias
    expect(await suspendOverdue(new Date(Date.now() + 3 * 86_400_000), a.r.id)).toBe(0);

    await redis.set(menuCacheKey(a.r.id), '{}');
    expect(await suspendOverdue(new Date(Date.now() + 8 * 86_400_000), a.r.id)).toBe(1);
    expect(await restStatus()).toBe('SUSPENDED');
    expect(await redis.get(menuCacheKey(a.r.id))).toBeNull();
    expect(await restStatus(b.r.id)).toBe('ACTIVE');

    expect((await hook(payment('PAYMENT_RECEIVED', '2', 'RECEIVED', iso(-1), { paymentDate: iso(0) }))).status).toBe(200);
    expect(await restStatus()).toBe('ACTIVE');
    expect((await billing()).status).toBe('OK');
  });

  it('vencido já além da tolerância → SUSPENDED no próprio webhook', async () => {
    expect((await hook(payment('PAYMENT_OVERDUE', '3', 'OVERDUE', iso(-10)))).status).toBe(200);
    expect(await restStatus()).toBe('SUSPENDED');
    expect((await hook(payment('PAYMENT_RECEIVED', '3', 'RECEIVED', iso(-10)))).status).toBe(200);
    expect(await restStatus()).toBe('ACTIVE');
  });

  it('estorno não suspende: só registra', async () => {
    expect((await hook(payment('PAYMENT_REFUNDED', '3', 'REFUNDED', iso(-10)))).status).toBe(200);
    expect(await restStatus()).toBe('ACTIVE');
    expect((await prisma.billingPayment.findUniqueOrThrow({ where: { asaasId: `pay_${uid}_3` } })).status).toBe('REFUNDED');
  });

  it('cancelar assinatura: remove no Asaas (falso), marca CANCELED e mantém o restaurante como está', async () => {
    await hook(payment('PAYMENT_CREATED', '4', 'PENDING', iso(20)));
    const del = vi.spyOn(asaas, 'deleteSubscription').mockResolvedValue({ id: SUB, deleted: true });
    const res = await request(app).delete(`/admin/billing/${a.r.id}/subscription`).set(bearer(admin));
    expect(res.status).toBe(200);
    expect(del).toHaveBeenCalledWith(SUB);
    const d = AdminBillingDetail.parse(res.body);
    expect(d).toMatchObject({ status: 'ACTIVE', billing: { subscribed: false, status: 'CANCELED', nextDueDate: null } });
    expect(d.payments.find((p) => p.dueDate === iso(20))?.status).toBe('DELETED');
    expect((await request(app).delete(`/admin/billing/${a.r.id}/subscription`).set(bearer(admin))).status).toBe(409);
  });
});
