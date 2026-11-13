// Cobrança da assinatura do restaurante pelo Asaas — fluxo e regras em docs/COBRANCA.md. Contrato: api.billing.
import { createHash, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler } from 'express';
import type { Billing, BillingPayment as PaymentRow, Restaurant } from '@prisma/client';
import {
  ActivateSubscriptionBody, AsaasWebhookBody, BILLING_CYCLE_LABEL, BillingCustomerBody, BillingSubscriptionBody, IdParams, OwnerPlanBody,
  OwnerSubscribeBody, PLAN_LABEL, planValueCents, TRIAL_DAYS,
  type AdminBilling, type AdminBillingDetail, type AdminBillingList, type AsaasWebhookResponse, type BillingCycle, type BillingPayment, type OwnerBilling, type Plan,
} from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { redis } from '../../lib/redis';
import { logger } from '../../lib/logger';
import { asaas, toCents } from '../../lib/asaas';
import { tenantId } from '../../lib/auth';
import { AppError, notFound } from '../../lib/errors';
import { menuChanged } from '../../lib/menuCache';
import { billingDay, graceLimit, suspendOverdue } from '../../jobs/billing';
import { validate } from '../../middleware/validate';

const OPEN = ['PENDING', 'OVERDUE'];
const day = (d: Date) => d.toISOString().slice(0, 10);
const date = (s: string) => new Date(`${s}T00:00:00Z`);

const toPayment = (p: PaymentRow): BillingPayment => ({
  id: p.id, valueCents: p.valueCents, dueDate: day(p.dueDate), status: p.status, invoiceUrl: p.invoiceUrl, paidAt: p.paidAt && day(p.paidAt),
});
/** Fatura em aberto mais antiga (a vencida vem antes da que ainda vai vencer). */
const firstOpen = (rows: PaymentRow[]) => rows.filter((p) => OPEN.includes(p.status)).sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0];
const nextDue = (b: Billing | null, rows: PaymentRow[]) => {
  const d = firstOpen(rows)?.dueDate ?? b?.nextDueDate;
  return d ? day(d) : null;
};

const trialEnd = (r: { createdAt: Date }) => new Date(r.createdAt.getTime() + TRIAL_DAYS * 86_400_000);
type Row = Restaurant & { billing: Billing | null; invoices: PaymentRow[] };
const toAdmin = (r: Row): AdminBilling => ({
  restaurantId: r.id, name: r.name, slug: r.slug, plan: r.plan, status: r.status, createdAt: r.createdAt.toISOString(),
  trialExpired: r.status === 'TRIAL' && trialEnd(r).getTime() < Date.now(),
  billing: r.billing && {
    cpfCnpj: r.billing.cpfCnpj, email: r.billing.email, phone: r.billing.phone, subscribed: !!r.billing.asaasSubscriptionId,
    cycle: r.billing.cycle, valueCents: r.billing.valueCents, nextDueDate: nextDue(r.billing, r.invoices), status: r.billing.status,
  },
});
const HISTORY = { orderBy: { dueDate: 'desc' as const }, take: 36 };

async function detail(id: string): Promise<AdminBillingDetail> {
  const r = await prisma.restaurant.findUnique({ where: { id }, include: { billing: true, invoices: HISTORY } });
  if (!r) throw notFound('Restaurante');
  return { ...toAdmin(r), payments: r.invoices.map(toPayment) };
}

const valueOf = (b: BillingSubscriptionBody) => {
  const v = b.valueCents ?? planValueCents(b.plan, b.cycle);
  if (v == null) throw new AppError('VALIDATION', 'Informe o valor da cobrança (plano Rede é sob consulta)');
  return v;
};
type PlanChoice = { plan: Plan; cycle: BillingCycle; valueCents: number };
const describe = (b: PlanChoice) => `Garfeed — plano ${PLAN_LABEL[b.plan]} (${BILLING_CYCLE_LABEL[b.cycle].toLowerCase()})`;

/** Uma operação de cobrança por restaurante de cada vez: clique duplo não cria duas assinaturas no Asaas. */
async function locked<T>(restaurantId: string, fn: () => Promise<T>): Promise<T> {
  const key = `billing:lock:${restaurantId}`;
  if (!(await redis.set(key, '1', 'EX', 60, 'NX'))) throw new AppError('CONFLICT', 'Outra operação de cobrança está em andamento para este restaurante');
  try { return await fn(); } finally { await redis.del(key); }
}
const withBilling = async (id: string) => {
  const r = await prisma.restaurant.findUnique({ where: { id }, include: { billing: true } });
  if (!r) throw notFound('Restaurante');
  return r;
};

// ---------- Operações compartilhadas por admin e dono. Chamar SEMPRE dentro de locked(). ----------
async function saveCustomer(id: string, b: BillingCustomerBody) {
  const data = { cpfCnpj: b.cpfCnpj, email: b.email ?? null, phone: b.phone ?? null };
  const r = await withBilling(id);
  if (r.billing?.asaasCustomerId) await asaas.updateCustomer(r.billing.asaasCustomerId, { name: r.name, ...data });
  await prisma.billing.upsert({ where: { restaurantId: id }, create: { restaurantId: id, ...data }, update: data });
}

async function activate(id: string, b: PlanChoice & { nextDueDate: string }) {
  const r = await withBilling(id);
  if (!r.billing) throw new AppError('VALIDATION', 'Informe o CPF/CNPJ de cobrança antes de ativar a assinatura');
  if (r.billing.asaasSubscriptionId) throw new AppError('CONFLICT', 'Este restaurante já tem assinatura. Troque o plano ou cancele antes.');
  let customer = r.billing.asaasCustomerId;
  if (!customer) {
    customer = (await asaas.createCustomer({ name: r.name, cpfCnpj: r.billing.cpfCnpj, email: r.billing.email, phone: r.billing.phone, externalReference: id })).id;
    // gravado antes da assinatura: se ela falhar, a nova tentativa não duplica o cliente no Asaas
    await prisma.billing.update({ where: { restaurantId: id }, data: { asaasCustomerId: customer } });
  }
  const sub = await asaas.createSubscription({ customer, valueCents: b.valueCents, cycle: b.cycle, nextDueDate: b.nextDueDate, description: describe(b), externalReference: id });
  await prisma.$transaction([
    prisma.billing.update({ where: { restaurantId: id }, data: { asaasSubscriptionId: sub.id, cycle: b.cycle, valueCents: b.valueCents, nextDueDate: date(b.nextDueDate), status: 'PENDING' } }),
    prisma.restaurant.update({ where: { id }, data: { plan: b.plan } }),
  ]);
  await menuChanged(id); // o plano liga/desliga a marca própria no cardápio
  // Melhor esforço: espelha já a 1ª cobrança para a fatura abrir na hora, sem esperar o webhook PAYMENT_CREATED
  // (que faz o mesmo upsert pelo id da cobrança). Falha aqui não desfaz a assinatura.
  try {
    for (const p of (await asaas.subscriptionPayments(sub.id)).data) {
      const data = { valueCents: toCents(p.value), dueDate: date(p.dueDate), invoiceUrl: p.invoiceUrl ?? null, status: p.status };
      await prisma.billingPayment.upsert({ where: { asaasId: p.id }, create: { restaurantId: id, asaasId: p.id, ...data }, update: data });
    }
  } catch (err) {
    logger.warn({ err, restaurantId: id }, 'cobrança: 1ª fatura ainda não espelhada (chega pelo webhook)');
  }
}

async function change(id: string, b: PlanChoice) {
  const subId = (await withBilling(id)).billing?.asaasSubscriptionId;
  if (!subId) throw new AppError('CONFLICT', 'Este restaurante não tem assinatura ativa');
  const sub = await asaas.updateSubscription(subId, { valueCents: b.valueCents, cycle: b.cycle, description: describe(b) });
  if (toCents(sub.value) !== b.valueCents) throw new AppError('BILLING_PROVIDER', 'O Asaas não aplicou o novo valor. Confira a assinatura no painel do Asaas.');
  await prisma.$transaction([
    prisma.billing.update({ where: { restaurantId: id }, data: { cycle: b.cycle, valueCents: b.valueCents } }),
    prisma.restaurant.update({ where: { id }, data: { plan: b.plan } }),
  ]);
  await menuChanged(id); // o plano liga/desliga a marca própria no cardápio
}

// Cancelar não muda o status do restaurante: quem decide suspender é o admin (PATCH /admin/restaurants/:id).
async function cancel(id: string) {
  const subId = (await withBilling(id)).billing?.asaasSubscriptionId;
  if (!subId) throw new AppError('CONFLICT', 'Este restaurante não tem assinatura ativa');
  await asaas.deleteSubscription(subId);
  await prisma.$transaction([
    prisma.billing.update({ where: { restaurantId: id }, data: { asaasSubscriptionId: null, nextDueDate: null, status: 'CANCELED' } }),
    // o Asaas remove as cobranças em aberto junto com a assinatura
    prisma.billingPayment.updateMany({ where: { restaurantId: id, status: { in: OPEN } }, data: { status: 'DELETED' } }),
  ]);
}

// ---------- /admin/billing (SUPERADMIN) ----------
export const adminRouter = Router();

adminRouter.get('/', async (_req, res) => {
  const rows = await prisma.restaurant.findMany({
    orderBy: { createdAt: 'desc' },
    include: { billing: true, invoices: { where: { status: { in: OPEN } }, orderBy: { dueDate: 'asc' }, take: 1 } },
  });
  const body: AdminBillingList = { enabled: asaas.enabled(), restaurants: rows.map(toAdmin) };
  res.json(body);
});

adminRouter.get('/:id', validate({ params: IdParams }), async (req, res) => {
  res.json(await detail((req.params as IdParams).id));
});

adminRouter.put('/:id/customer', validate({ params: IdParams, body: BillingCustomerBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  await locked(id, () => saveCustomer(id, req.body as BillingCustomerBody));
  res.json(await detail(id));
});

adminRouter.post('/:id/subscription', validate({ params: IdParams, body: ActivateSubscriptionBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  const b = req.body as ActivateSubscriptionBody;
  const valueCents = valueOf(b);
  const nextDueDate = b.nextDueDate ?? day(billingDay(new Date(), 3));
  if (nextDueDate < day(billingDay())) throw new AppError('VALIDATION', 'O primeiro vencimento não pode estar no passado');
  await locked(id, () => activate(id, { plan: b.plan, cycle: b.cycle, valueCents, nextDueDate }));
  res.status(201).json(await detail(id));
});

adminRouter.patch('/:id/subscription', validate({ params: IdParams, body: BillingSubscriptionBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  const b = req.body as BillingSubscriptionBody;
  const valueCents = valueOf(b);
  await locked(id, () => change(id, { plan: b.plan, cycle: b.cycle, valueCents }));
  res.json(await detail(id));
});

adminRouter.delete('/:id/subscription', validate({ params: IdParams }), async (req, res) => {
  const { id } = req.params as IdParams;
  await locked(id, () => cancel(id));
  res.json(await detail(id));
});

// ---------- /settings/billing (OWNER; restaurantId sempre do token) ----------
export const ownerRouter = Router();

async function mine(rid: string): Promise<OwnerBilling> {
  const r = await prisma.restaurant.findUniqueOrThrow({
    where: { id: rid },
    include: { billing: true, invoices: { ...HISTORY, where: { status: { not: 'DELETED' } } } },
  });
  const subscribed = !!r.billing?.asaasSubscriptionId;
  return {
    plan: r.plan, status: r.status, billingStatus: r.billing?.status ?? 'NONE',
    cycle: subscribed ? r.billing!.cycle : null, valueCents: subscribed ? r.billing!.valueCents : null,
    nextDueDate: nextDue(r.billing, r.invoices), openInvoiceUrl: firstOpen(r.invoices)?.invoiceUrl ?? null,
    payments: r.invoices.map(toPayment),
    trialEndsAt: r.status === 'TRIAL' ? trialEnd(r).toISOString() : null,
    subscribed,
    customer: r.billing && { cpfCnpj: r.billing.cpfCnpj, email: r.billing.email, phone: r.billing.phone },
  };
}
/** O dono só assina pelo preço da tabela: o valor nunca vem do corpo (OwnerPlanBody nem tem o campo). */
const tableChoice = (b: OwnerPlanBody): PlanChoice => {
  const valueCents = planValueCents(b.plan, b.cycle);
  if (valueCents == null) throw new AppError('VALIDATION', 'Este plano é sob consulta: fale com a gente');
  return { plan: b.plan, cycle: b.cycle, valueCents };
};

ownerRouter.get('/', async (req, res) => {
  res.json(await mine(tenantId(req)));
});

ownerRouter.post('/subscription', validate({ body: OwnerSubscribeBody }), async (req, res) => {
  const rid = tenantId(req);
  const { plan, cycle, ...customer } = req.body as OwnerSubscribeBody;
  const choice = tableChoice({ plan, cycle });
  await locked(rid, async () => {
    const r = await withBilling(rid);
    if (r.billing?.asaasSubscriptionId) throw new AppError('CONFLICT', 'Você já tem uma assinatura. Troque de plano ou cancele antes.');
    await saveCustomer(rid, customer);
    // Teste grátis respeitado: quem assina durante o TRIAL só paga no fim dos 30 dias (nunca antes de hoje + 3).
    const soonest = billingDay(new Date(), 3);
    const afterTrial = r.status === 'TRIAL' ? billingDay(trialEnd(r)) : soonest;
    await activate(rid, { ...choice, nextDueDate: day(afterTrial > soonest ? afterTrial : soonest) });
  });
  res.status(201).json(await mine(rid));
});

ownerRouter.patch('/subscription', validate({ body: OwnerPlanBody }), async (req, res) => {
  const rid = tenantId(req);
  const choice = tableChoice(req.body as OwnerPlanBody);
  await locked(rid, () => change(rid, choice));
  res.json(await mine(rid));
});

ownerRouter.delete('/subscription', async (req, res) => {
  const rid = tenantId(req);
  await locked(rid, () => cancel(rid));
  res.json(await mine(rid));
});

// ---------- POST /webhooks/asaas (público; autenticado pelo token do Asaas) ----------
export const webhookRouter = Router();

const sha = (s: string) => createHash('sha256').update(s).digest();
const webhookAuth: RequestHandler = (req, _res, next) => {
  const got = req.headers['asaas-access-token'];
  // hash dos dois lados: timingSafeEqual exige tamanhos iguais e assim não vaza o comprimento do token
  if (!env.ASAAS_WEBHOOK_TOKEN || typeof got !== 'string' || !timingSafeEqual(sha(got), sha(env.ASAAS_WEBHOOK_TOKEN))) {
    throw new AppError('UNAUTHORIZED', 'Token do webhook inválido');
  }
  next();
};
const PAID_EVENTS = ['PAYMENT_CONFIRMED', 'PAYMENT_RECEIVED'];

webhookRouter.post('/', webhookAuth, async (req, res) => {
  const reply = (extra: Partial<AsaasWebhookResponse> = {}) => { const body: AsaasWebhookResponse = { received: true, ...extra }; res.json(body); };
  // Corpo fora do formato esperado (ex.: evento de outro negócio da conta) → 200 + log: reenviar não corrigiria,
  // e respostas de erro em sequência pausam a fila do webhook no Asaas.
  const parsed = AsaasWebhookBody.safeParse(req.body);
  if (!parsed.success) {
    logger.warn({ event: (req.body as { event?: unknown } | undefined)?.event, issue: parsed.error.issues[0] }, 'cobrança: webhook ignorado (formato inesperado)');
    return reply({ ignored: true });
  }
  const evt = parsed.data;
  const customer = evt.payment?.customer ?? evt.subscription?.customer;
  const billing = customer ? await prisma.billing.findUnique({ where: { asaasCustomerId: customer } }) : null;
  // A conta do Asaas é compartilhada com outros negócios: cliente que não é do Garfeed, ou cobrança avulsa
  // (fora da assinatura), é ignorado com 200 — erro aqui pausaria a fila do webhook no Asaas.
  if (!billing || (evt.payment && !evt.payment.subscription)) return reply({ ignored: true });
  if (await prisma.billingEvent.count({ where: { id: evt.id } })) return reply({ duplicate: true });

  const rid = billing.restaurantId;
  const reactivated = await prisma.$transaction(async (tx) => {
    // reentrega simultânea do mesmo evento: a PK falha, a transação desfaz tudo e o Asaas tenta de novo (→ duplicate)
    await tx.billingEvent.create({ data: { id: evt.id, event: evt.event } });
    const p = evt.payment;
    if (p) {
      const paid = p.clientPaymentDate ?? p.paymentDate ?? p.confirmedDate;
      const data = {
        valueCents: toCents(p.value), dueDate: date(p.dueDate), invoiceUrl: p.invoiceUrl ?? null, paidAt: paid ? date(paid) : null,
        status: p.deleted || evt.event === 'PAYMENT_DELETED' ? 'DELETED' : p.status,
      };
      await tx.billingPayment.upsert({ where: { asaasId: p.id }, create: { restaurantId: rid, asaasId: p.id, ...data }, update: data });
      if (billing.asaasSubscriptionId && billing.status !== 'CANCELED') {
        const open = await tx.billingPayment.findMany({ where: { restaurantId: rid, status: { in: OPEN } }, select: { status: true } });
        const status = open.some((o) => o.status === 'OVERDUE') ? 'OVERDUE' : open.length ? 'PENDING' : 'OK';
        await tx.billing.update({ where: { restaurantId: rid }, data: { status } });
      }
    }
    const s = evt.subscription;
    if (s && s.id === billing.asaasSubscriptionId) {
      // Conservador: assinatura cancelada/inativada no Asaas só é registrada; suspender é decisão do admin.
      if (evt.event === 'SUBSCRIPTION_DELETED') await tx.billing.update({ where: { restaurantId: rid }, data: { status: 'CANCELED', asaasSubscriptionId: null, nextDueDate: null } });
      else if (evt.event === 'SUBSCRIPTION_INACTIVATED') await tx.billing.update({ where: { restaurantId: rid }, data: { status: 'CANCELED' } });
      else if (s.nextDueDate) await tx.billing.update({ where: { restaurantId: rid }, data: { nextDueDate: date(s.nextDueDate) } });
    }
    if (!PAID_EVENTS.includes(evt.event)) return false;
    // Pagamento reativa (TRIAL/SUSPENDED → ACTIVE), a menos que reste OUTRA fatura vencida além da tolerância.
    const stillLate = await tx.billingPayment.count({ where: { restaurantId: rid, status: 'OVERDUE', dueDate: { lte: graceLimit() } } });
    return !stillLate && (await tx.restaurant.updateMany({ where: { id: rid, status: { not: 'ACTIVE' } }, data: { status: 'ACTIVE' } })).count > 0;
  });

  if (reactivated) await menuChanged(rid); // canOrder volta no cardápio público
  if (evt.event === 'PAYMENT_OVERDUE') {
    // TODO(e-mail): avisar o dono da fatura vencida (link da fatura + data em que o cardápio será suspenso)
    await suspendOverdue(new Date(), rid);
  }
  // Estorno, chargeback e cancelamento: só registrado (espelho + log). Nada de suspensão na hora.
  if (/REFUND|CHARGEBACK|UNDONE|SUBSCRIPTION_(DELETED|INACTIVATED)/.test(evt.event)) logger.warn({ event: evt.event, restaurantId: rid }, 'cobrança: evento que pede atenção do admin');
  reply();
});
