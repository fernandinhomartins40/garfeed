# Cobrança da assinatura (Asaas)

O Garfeed cobra a **assinatura mensal/anual dos restaurantes** pelo [Asaas](https://www.asaas.com). O pagamento do cliente final
na mesa continua **fora** do Garfeed (PRD: Pix na mesa é V3). Decisões e a exceção à regra "sem serviços externos" estão em
`docs/DECISOES.md` (2026-11-11 — Cobrança pelo Asaas).

Sem `ASAAS_API_KEY` a cobrança fica **desligada**: as rotas de ativar/trocar/cancelar respondem `503 BILLING_DISABLED`, a tela
"Planos" mostra o aviso e todo o resto do sistema funciona igual.

## Planos e valores

| Plano | Mensal | Anual (pague 10, leve 12) |
|---|---|---|
| Essencial | R$ 129,00 | R$ 1.290,00 (uma cobrança por ano) |
| Pro | R$ 199,00 | R$ 1.990,00 (uma cobrança por ano) |
| Rede | sob consulta — o admin informa o valor | idem |

Tabela em `packages/shared/src/enums.ts` (`PLAN_PRICE_CENTS`, `planValueCents`). O admin pode informar um valor diferente por
restaurante (desconto, Rede). No nosso banco o dinheiro é sempre **centavos (Int)**; vira reais decimais só em `apps/api/src/lib/asaas.ts`.

## Fluxo

0. **Autoatendimento (dono)**: em **Configurações → Plano atual → Assinar agora** o próprio dono informa CPF/CNPJ e contato,
   escolhe Essencial ou Pro (mensal/anual, preço da tabela) e assina (`POST /settings/billing/subscription`); depois pode
   **trocar de plano** (`PATCH`) e **cancelar** (`DELETE`). Quem assina durante o teste grátis só paga no fim dos 30 dias.
   Dentro dos apps das lojas esse fluxo não aparece (só a situação). O admin continua podendo fazer tudo abaixo.
1. **Admin → Planos → Gerenciar** (`/admin/planos`): informa CPF/CNPJ, e-mail e telefone de cobrança do restaurante.
2. **Ativar assinatura**: a API cria o cliente (`POST /customers`, `externalReference` = id do restaurante) e a assinatura
   (`POST /subscriptions`, `billingType: UNDEFINED` → o pagador escolhe **Pix, boleto ou cartão** na fatura). O Asaas gera a
   cobrança e avisa o cliente por e-mail/SMS (notificações do próprio Asaas).
3. **Webhook** `POST /webhooks/asaas`: cada evento atualiza o espelho de cobranças (`BillingPayment`) e a situação.
4. **Dono → Configurações → Plano atual**: plano, valor, próximo vencimento, situação (em dia / pendente / vencido), botão
   **Abrir fatura** (`invoiceUrl` do Asaas) e histórico. Só o OWNER vê; o restaurante vem sempre do token.
5. **Trocar plano/ciclo/valor** (`PUT /subscriptions/{id}` com `updatePendingPayments: true`) e **cancelar**
   (`DELETE /subscriptions/{id}` — o Asaas remove também as cobranças em aberto) pela mesma tela do admin.

### Regras de status do restaurante

| Acontecimento | Efeito |
|---|---|
| Pagamento confirmado/recebido (`PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`) | Restaurante → `ACTIVE` (inclusive vindo de `TRIAL` ou `SUSPENDED`); cache do cardápio invalidado |
| Cobrança vencida (`PAYMENT_OVERDUE`) | Situação "Vencido" na hora; o restaurante **continua funcionando** |
| Vencida há `BILLING_GRACE_DAYS` dias (padrão 7) | Restaurante → `SUSPENDED` (cardápio em modo somente visualização). Verificado no webhook e de hora em hora (`jobs/billing.ts`) |
| Pagamento depois da suspensão | Reativa (`ACTIVE`), salvo se restar outra fatura vencida além da tolerância |
| Estorno / chargeback (`PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_*`…) | **Só registra** (status da cobrança + log `warn`). Não suspende |
| Assinatura removida/inativada no Asaas (`SUBSCRIPTION_DELETED`, `SUBSCRIPTION_INACTIVATED`) | Situação "Cancelada". **Não suspende** — o admin decide em Restaurantes |
| Cancelar pela tela do admin | Idem: situação "Cancelada", status do restaurante intacto |
| `TRIAL` sem assinatura | Continua funcionando. O dono vê "Teste grátis: faltam N dias" e, após 30 dias, "Seu teste terminou"; selo "teste > 30 dias" em Planos; nada é suspenso sozinho |

Status do restaurante alterado manualmente pelo admin (Restaurantes) continua valendo; um pagamento posterior reativa.

## Webhook

- `POST https://api.garfeed.com.br/webhooks/asaas` — público, fora do rate limit de `/public`.
- **Autenticação**: header `asaas-access-token` comparado em tempo constante com `ASAAS_WEBHOOK_TOKEN`. Errado, ausente ou
  variável não configurada → `401`.
- **Idempotente** pelo `id` do evento (`evt_…`, tabela `BillingEvent`) e pelo `id` da cobrança (`pay_…`, único). O Asaas entrega
  "pelo menos uma vez"; repetição responde `200 { received: true, duplicate: true }` sem reprocessar.
- **Conta compartilhada**: evento de cliente que não é do Garfeed (`customer` desconhecido), cobrança avulsa (sem `subscription`)
  ou corpo fora do formato → `200 { received: true, ignored: true }`, sem efeito. (Respostas de erro em sequência pausam a
  fila do webhook no Asaas, o que afetaria os outros negócios da conta.)
- Eventos tratados: todos os `PAYMENT_*` (espelham `payment.status`, valor, vencimento, `invoiceUrl`, data de pagamento) e
  `SUBSCRIPTION_UPDATED` / `SUBSCRIPTION_DELETED` / `SUBSCRIPTION_INACTIVATED`. Os demais são aceitos e ignorados.

## Variáveis de ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `ASAAS_API_KEY` | para cobrar | Chave de API. Vazia = cobrança desligada |
| `ASAAS_API_URL` | não | Padrão: `https://api.asaas.com/v3` com `NODE_ENV=production`; fora disso, sandbox `https://api-sandbox.asaas.com/v3` |
| `ASAAS_WEBHOOK_TOKEN` | para o webhook | Mesmo token cadastrado no Asaas (32 a 255 caracteres; a API não sobe com token menor) |
| `BILLING_GRACE_DAYS` | não | Dias de tolerância após o vencimento antes de suspender. Padrão 7 |

**Atenção ao `$`:** a chave do Asaas começa com `$aact_…`. No `.env`, escreva entre **aspas simples**
(`ASAAS_API_KEY='$aact_prod_…'`) — sem elas o Docker Compose e o `set -a; . ./.env` do README tentam interpolar `$aact_prod_…`
como variável e a chave chega vazia/errada. Nunca commite a chave.

### O que a produção precisa

1. Em `/opt/garfeed/.env` (VPS):
   ```
   ASAAS_API_KEY='$aact_prod_…'        # aspas simples!
   ASAAS_WEBHOOK_TOKEN=<openssl rand -hex 32>
   # opcionais:
   # ASAAS_API_URL=https://api.asaas.com/v3
   # BILLING_GRACE_DAYS=7
   ```
2. No bloco `environment` do serviço **api** em `infra/docker-compose.yml`:
   ```yaml
   ASAAS_API_KEY: ${ASAAS_API_KEY:-}
   ASAAS_API_URL: ${ASAAS_API_URL:-}
   ASAAS_WEBHOOK_TOKEN: ${ASAAS_WEBHOOK_TOKEN:-}
   BILLING_GRACE_DAYS: ${BILLING_GRACE_DAYS:-7}
   ```
3. Aplicar a migração `20261111034849_asaas_billing` (`prisma migrate deploy`, já faz parte do deploy).
4. O nginx já encaminha `api.garfeed.com.br/*` para a API; nenhuma rota nova de proxy é necessária.

## Passo a passo — (a) cadastrar o webhook no Asaas

1. Gere o token: `openssl rand -hex 32`. Grave em `ASAAS_WEBHOOK_TOKEN` no `.env` da VPS e reinicie a API.
2. No painel do Asaas: **Integrações → Webhooks → Criar Webhook**.
3. Preencha:
   - **Nome**: `Garfeed`
   - **URL**: `https://api.garfeed.com.br/webhooks/asaas`
   - **E-mail** para avisos de falha: o seu
   - **Versão da API**: `v3`
   - **Token de autenticação**: o mesmo valor de `ASAAS_WEBHOOK_TOKEN`
   - **Fila de sincronização ativada**: Sim · **Tipo de envio**: Sequencial
   - **Webhook ativo**: Sim
4. **Eventos**: marque todos de **Cobranças** (`PAYMENT_*`) e de **Assinaturas** (`SUBSCRIPTION_*`). No mínimo:
   `PAYMENT_CREATED`, `PAYMENT_UPDATED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_OVERDUE`, `PAYMENT_DELETED`,
   `PAYMENT_RESTORED`, `PAYMENT_REFUNDED`, `PAYMENT_CHARGEBACK_REQUESTED`, `SUBSCRIPTION_UPDATED`, `SUBSCRIPTION_DELETED`,
   `SUBSCRIPTION_INACTIVATED`.
5. Salve. A conta já tem outros webhooks (de outros negócios): **não altere os existentes**, crie um novo. Eles também recebem
   os eventos do Garfeed, e o Garfeed recebe os deles (e ignora).
6. Conferência: em **Webhooks → Logs** as entregas devem aparecer com HTTP 200. `401` = token diferente dos dois lados.

## Passo a passo — (b) testar no sandbox

1. Crie uma conta em <https://sandbox.asaas.com> e gere uma chave em **Integrações → Chaves de API** (`$aact_hmlg_…`).
2. No `.env` local (raiz): `ASAAS_API_KEY='$aact_hmlg_…'` e `ASAAS_WEBHOOK_TOKEN=<32+ caracteres>`. Com `NODE_ENV=development`
   a API já aponta para o sandbox. `pnpm dev`.
3. Exponha a API local para o Asaas (ex.: `cloudflared tunnel --url http://localhost:3000`) e cadastre o webhook no **sandbox**
   (passos de (a), com a URL do túnel + `/webhooks/asaas`). As configurações de sandbox e produção são independentes.
4. No painel (`admin@garfeed.com.br`): **Planos → Gerenciar** um restaurante → salve um CPF/CNPJ válido → **Ativar assinatura**.
   Confira no sandbox o cliente e a assinatura criados, e no Garfeed a cobrança em "Histórico de pagamentos".
5. Entre como dono → **Configurações → Plano atual → Abrir fatura**. No sandbox, pague com Pix de teste ou use
   **Cobranças → (cobrança) → Confirmar recebimento em dinheiro**. O restaurante deve virar **Ativo** e a situação "Em dia".
6. Vencimento: crie a assinatura com vencimento hoje e aguarde o Asaas marcar como vencida (ou simule o evento, abaixo). Com
   `BILLING_GRACE_DAYS=0` a suspensão é imediata.
7. Confira ainda no sandbox: **trocar valor** (ver "Não verificado" abaixo) e **cancelar** a assinatura.

Simular um evento sem o Asaas (API local; troque `cus_…`/`sub_…` pelos ids gravados na tabela `Billing`):

```bash
curl -i http://localhost:3000/webhooks/asaas -H "asaas-access-token: $ASAAS_WEBHOOK_TOKEN" -H 'Content-Type: application/json' -d '{
  "id": "evt_teste_1", "event": "PAYMENT_OVERDUE",
  "payment": { "id": "pay_teste_1", "customer": "cus_…", "subscription": "sub_…", "value": 199, "dueDate": "2026-11-01", "status": "OVERDUE", "invoiceUrl": "https://sandbox.asaas.com/i/teste" }
}'
```

## Não verificado contra o Asaas real

A integração foi testada com um cliente Asaas **falso** (`apps/api/test/billing.test.ts`). Antes de cobrar clientes reais, rode o
roteiro (b) no sandbox e confirme:

- **Troca de valor**: a referência do `PUT /subscriptions/{id}` não lista o campo `value` no schema (o texto da página diz que é
  possível alterar o valor). A API envia `value` e **confere a resposta**: se o Asaas não aplicar, responde `502` e nada é
  gravado — nesse caso, cancele e ative de novo com o valor certo.
- Formato real das datas e campos dos eventos (`payment.dueDate`, `subscription.nextDueDate`).
- Quando a primeira cobrança da assinatura é gerada (aparece no histórico ao chegar o `PAYMENT_CREATED`).
- **`GET /subscriptions/{id}/payments`** (usado em melhor esforço logo após criar a assinatura, para mostrar a fatura na hora):
  formato da resposta (`data[].id/value/dueDate/status/invoiceUrl`). Se vier diferente, só se perde o atalho — o webhook cobre.

## Fora do escopo (por enquanto)

- E-mails do Garfeed sobre cobrança (há `TODO(e-mail)` em `jobs/billing.ts` e no webhook); o Asaas já notifica o pagador.
- Suspensão automática ao fim do teste grátis (hoje o painel só avisa — `docs/DECISOES.md`).
- Taxa de ativação, venda de placas e pacotes de vídeo (cobranças avulsas — faça direto no Asaas; o webhook as ignora).
- Limites por plano (mesas/usuários) — o plano é só comercial.
