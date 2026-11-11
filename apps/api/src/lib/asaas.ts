// Cliente HTTP fino do Asaas (cobrança da assinatura dos restaurantes) — docs/COBRANCA.md.
// Dinheiro: centavos (Int) do nosso lado; vira reais decimais só aqui, na borda.
import type { BillingCycle } from '@garfeed/shared';
import { env, isProd } from './env';
import { AppError } from './errors';
import { logger } from './logger';

const baseUrl = env.ASAAS_API_URL ?? (isProd ? 'https://api.asaas.com/v3' : 'https://api-sandbox.asaas.com/v3');

type AsaasErrors = { errors?: { code?: string; description?: string }[] };

async function request<T>(method: 'POST' | 'PUT' | 'DELETE', path: string, body?: object): Promise<T> {
  if (!env.ASAAS_API_KEY) throw new AppError('BILLING_DISABLED', 'Cobrança desligada: configure ASAAS_API_KEY no servidor.');
  let res: Response;
  try {
    res = await fetch(baseUrl + path, {
      method,
      headers: { access_token: env.ASAAS_API_KEY, 'Content-Type': 'application/json', 'User-Agent': 'garfeed' },
      body: body && JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    logger.error({ err, method, path }, 'asaas: sem resposta');
    throw new AppError('BILLING_PROVIDER', 'O Asaas não respondeu. Tente de novo em instantes.');
  }
  const json = (await res.json().catch(() => null)) as (T & AsaasErrors) | null;
  if (!res.ok || !json) {
    logger.warn({ method, path, status: res.status, errors: json?.errors }, 'asaas: operação recusada');
    const description = json?.errors?.[0]?.description;
    throw new AppError('BILLING_PROVIDER', description ? `Asaas: ${description}` : `O Asaas recusou a operação (HTTP ${res.status}).`);
  }
  return json;
}

export const toCents = (reais: number) => Math.round(reais * 100);

type Customer = { name: string; cpfCnpj: string; email: string | null; phone: string | null };
// 11 dígitos = celular; 10 = fixo
const customerBody = (c: Customer) => ({
  name: c.name, cpfCnpj: c.cpfCnpj, email: c.email ?? undefined,
  ...(c.phone ? (c.phone.length === 11 ? { mobilePhone: c.phone } : { phone: c.phone }) : {}),
});
type Subscription = { id: string; value: number; nextDueDate: string };
type SubscriptionInput = { valueCents: number; cycle: BillingCycle; description: string };

/** Objeto (e não funções soltas) para os testes trocarem os métodos por falsos com vi.spyOn. */
export const asaas = {
  enabled: () => !!env.ASAAS_API_KEY,
  createCustomer: (c: Customer & { externalReference: string }) =>
    request<{ id: string }>('POST', '/customers', { ...customerBody(c), externalReference: c.externalReference }),
  updateCustomer: (id: string, c: Customer) => request<{ id: string }>('PUT', `/customers/${id}`, customerBody(c)),
  /** billingType UNDEFINED: o pagador escolhe Pix, boleto ou cartão na fatura. */
  createSubscription: (s: SubscriptionInput & { customer: string; nextDueDate: string; externalReference: string }) =>
    request<Subscription>('POST', '/subscriptions', {
      customer: s.customer, billingType: 'UNDEFINED', value: s.valueCents / 100, nextDueDate: s.nextDueDate,
      cycle: s.cycle, description: s.description, externalReference: s.externalReference,
    }),
  /** Vale para as próximas cobranças e para as pendentes já geradas (updatePendingPayments). */
  updateSubscription: (id: string, s: SubscriptionInput) =>
    request<Subscription>('PUT', `/subscriptions/${id}`, { value: s.valueCents / 100, cycle: s.cycle, description: s.description, updatePendingPayments: true }),
  /** O Asaas também remove as cobranças pendentes/vencidas da assinatura; as pagas ficam. */
  deleteSubscription: (id: string) => request<{ id: string; deleted: boolean }>('DELETE', `/subscriptions/${id}`),
};
