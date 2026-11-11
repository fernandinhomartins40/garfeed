# Decisões

## 2026-11-10 — "App nativo" no MVP
O PRD deixa app nativo fora do MVP (V3), mas o kit traz assets de Play Store (`docs/assets/loja-e-icones`).
Decisão: o cliente final continua sem app (PWA no navegador). Para a Play Store, empacotamos o **painel** (dono/garçom)
como **TWA** (Trusted Web Activity via Bubblewrap) apontando para `painel.garfeed.com.br`, com `assetlinks.json` servido pelo Nginx.
Sem código nativo próprio; app nativo de verdade continua V3.

## 2026-11-10 — Landing estática
`apps/landing` é HTML/CSS puro (sem framework), servido pelo Nginx em `garfeed.com.br`, seguindo `docs/referencias/landing-*.png`
e as regras de breakpoint de `docs/KIT-README.md`.

## 2026-11-10 — Fundação (semana 1): acréscimos ao modelo de dados do PRD §8
- **Relações e `onDelete`** em todos os modelos; índice em `restaurantId` (ou composto começando por ele) em toda tabela de negócio.
- **`Order.day` + `Order.number` + `OrderCounter`**: número sequencial por restaurante/dia. `day` = `AAAA-MM-DD` no fuso do restaurante; `OrderCounter` é incrementado por upsert dentro da transação do pedido. `@@unique([restaurantId, day, number])`.
- **`Order.idempotencyKey`** (UUID gerado no cliente) com `@@unique([sessionId, idempotencyKey])`: reenvio por rede ruim devolve o mesmo pedido em vez de duplicar.
- **Uma sessão `OPEN` por mesa**: índice único parcial em SQL na migração `init` (`TableSession_one_open_per_table`).
- **`RefreshToken`** (hash sha256, rotação a cada `/auth/refresh`, revogação no logout). O cookie guarda o token cru; o banco só o hash.
- **`guestToken`** é um JWT assinado (`GUEST_TOKEN_SECRET`, 6 h) com `{sessionId, restaurantId, tableId}` — sem tabela. As rotas conferem se a sessão ainda está `OPEN`.
- **`User.sector`** (KITCHEN/BAR) para o papel `KITCHEN` ver só o seu setor (RF-22). `User.lastLoginAt` e `createdAt` (tela P10).
- **`Restaurant.soundEnabled`** (RF-23 "som") e **`Restaurant.timezone`** (padrão `America/Sao_Paulo`, para horário e `Order.day`).
- **`Media.mimeType`, `sizeBytes`, `error`, `createdAt`**; status inicial `UPLOADING`.
- **`Tag.lastReadAt`** (P8 "última leitura") e `createdAt` (data do lote).
- **`Event.categoryId`** para `category_change` (RF-27).

## 2026-11-10 — Código da placa
"6 caracteres" = prefixo `GF` + 4 do alfabeto sem ambíguos (como no exemplo `GF7K2P`), ~923 mil combinações.
O schema `TagCode` aceita `GF` + 4 de `[0-9A-Z]` para as placas demo `GF0001..` do seed; o gerador usa só o alfabeto.

## 2026-11-10 — Contrato da API e tempo real
- Contrato completo em `packages/shared/src/contract.ts` (objeto `api`) + schemas em `schemas.ts`. Rotas além da lista do PRD §9,
  necessárias para as telas: `PUT /menu/categories/order`, `PUT /menu/items/order`, `GET /menu/items/:id`, `GET /media/:id`,
  `GET /tags`, `GET /tags/:code`, `GET /calls`, `GET /admin/stats`, `GET /admin/tag-batches/:batch/csv`.
- Permissões: cardápio/mesas(escrita)/placas = OWNER+MANAGER; operação = +WAITER; pedidos = +KITCHEN (filtrado pelo setor);
  equipe e configurações = só OWNER; admin = SUPERADMIN.
- Socket.io: além de `session:{id}`, o cliente entra em `guests:{restaurantId}` para receber `menu:updated` em broadcast.
  Evento extra `session:closed` (garçom fechou a mesa).
- Importação por planilha: JSON com o CSV em `/menu/import-csv` (`{ csv }`), sem multipart.

## 2026-11-10 — Seed
Além dos 5 itens do protótipo, o seed cria "Smash Clássico" em **Lanches** para a categoria não ficar vazia;
"Smash Duplo Cheddar" fica em **Destaques**. "Brownie com Sorvete" nasce esgotado (tela M4). Adicionais: máx. 3.

## 2026-11-10 — Infra dev
- `minio/minio` e `minio/mc` saíram do Docker Hub/quay (2025). Usamos `pgsty/minio` (fork mantido, compatível, com `mc`).
  Reavaliar a imagem do compose de produção.
- Portas no host do compose dev: Postgres **5434**, Redis **6380** (evitam conflito com instâncias locais); MinIO 9000/9001.
- API/worker em produção: `tsup` empacota `@garfeed/shared` (por isso ele é devDependency nos apps).

## 2026-11-10 — API completa (semanas 2–6)
- **Rate limit** (Redis, janela fixa): `/public` por IP (`PUBLIC_RATE_LIMIT_PER_MIN`, padrão 600 — o Wi-Fi do restaurante
  soma todos os celulares); pedido 30/min, chamado 20/min e eventos 30/min **por sessão da mesa**.
- **Cooldown de chamado**: `SET NX EX 60` no Redis por sessão+tipo (atômico); `retryAfterSec` = TTL restante.
- **Limite de pedidos**: contagem no banco dos pedidos da sessão na última hora; `retryAfterSec` = quando o mais antigo sai da janela.
- **Expiração de sessão (3 h)**: `setInterval` de 5 min no processo da API (`jobs/sessions.ts`) + checagem na entrada/rotas do
  cliente. A fila `QUEUES.sessions` não é usada.
- **Horário**: sem `openingHours` = sempre aberto; faixa que vira a noite (`["18:00","02:00"]`) vale até o dia seguinte.
  Fora do horário ou `SUSPENDED` → `canOrder=false`; pedido e chamado respondem `RESTAURANT_UNAVAILABLE`. Entrar na mesa continua permitido (só visualização).
- **Placa ACTIVE em mesa desativada** é tratada como "não ativada" (`restaurant: null`).
- **Vincular placa já ativa em outra mesa**: 409 `CONFLICT` com `details.table`; reenviar com `confirm: true` move a placa.
  A placa anterior da mesa de destino volta a `UNASSIGNED` (continua do restaurante).
- **KITCHEN**: lista só pedidos com itens do seu setor (e só esses itens); só pode mudar para `PREPARING`/`READY`.
- **Exclusões protegidas**: item já pedido e mesa com pedidos não são excluídos (409: oculte/desative); categoria com itens → 409.
- **Fechar mesa** conclui os chamados abertos da sessão. Pedido `CANCELED` também guarda o motivo em `rejectReason`.
- **Usuários**: o dono não pode desativar a si mesmo nem perder o papel OWNER; mudar senha/papel/desativar revoga os refresh tokens.
- **Cache do cardápio** em `menu:{restaurantId}` (`menuCacheKey` no shared); o worker também invalida quando a mídia fica pronta
  e emite `menu:updated` (via `@socket.io/redis-emitter`, mesmo canal do adapter Redis da API).
- **Admin**: "hoje" (pedidos/dia) no fuso de São Paulo. Lote de placas: `L{AAAAMMDD}-{hex}`; restaurante do lote = dono comum a todas as placas.
- **Mídia**: original em `{restaurantId}/{uuid}/original.ext`; derivados na mesma pasta. HEIC é convertido com FFmpeg antes do sharp
  (o sharp pré-compilado não decodifica HEVC).

## 2026-11-10 — Fase 3 (fechamento do MVP)
- **Status `PREPARING`**: "Aceitar" continua levando a `CONFIRMED` (cliente vê "Confirmado", fluxo B do PRD). Na coluna
  "Em preparo" do Ao vivo, o card `CONFIRMED` mostra **"Iniciar preparo"** (→ `PREPARING`, cliente vê "Em preparo") e
  **"Pronto"**; pular o preparo continua permitido (`CONFIRMED → READY`) para itens de bar/prontos.
- **Miniatura no pedido do painel**: `PanelOrder.items[].thumbUrl` = mídia **atual** do item (`thumbUrl` ou pôster), não um
  snapshot — se a foto do item mudar, pedidos antigos mostram a nova. Aceitável para identificação visual na cozinha.
- **Variáveis `VITE_*`** documentadas no `.env.example` da raiz e passadas como build args no compose de produção. O Vite
  continua lendo `.env` da pasta do app (ler o da raiz traria `NODE_ENV=development` e geraria build de dev do React).

## 2026-11-11 — Revogação imediata do access token
- Desativar usuário ou trocar papel/senha grava `auth:revoked:{userId}` no Redis (timestamp, TTL = vida do access token); `requireAuth`
  e o handshake do Socket.io do painel recusam (401) tokens com `iat` anterior. Custa um GET no Redis por requisição; Redis fora → 500 (falha fechada).

## 2026-11-11 — Apps nativos do painel nas duas lojas (substitui "App nativo no MVP" de 10/11 no que conflitar)
O app das lojas continua sendo só o **painel**; o cliente final segue sem app. Estrutura em `apps/mobile`, compilada pelo
workflow manual `.github/workflows/apps-nativos.yml` (sem Mac). Guia: `docs/apps-nativos/COMPILAR-SEM-MAC.md`.
- **Android = TWA (mantido).** Dentro da TWA quem roda é o Chrome: Web Push (VAPID), Web NFC e câmera funcionam sem
  Firebase e sem código nativo. Um app Capacitor no Android usaria o WebView do sistema, que não tem Web Push nem Web NFC
  — exigiria FCM (Firebase, proibido) ou um serviço próprio em segundo plano. O projeto Gradle foi gerado uma vez pelo
  `@bubblewrap/core` e está **versionado** em `apps/mobile/android` (o CLI interativo do Bubblewrap não roda no CI);
  versão e assinatura entram por variáveis de ambiente. `minSdk` 24 (exigência da androidbrowserhelper 2.7).
- **iOS = Capacitor 8 com Swift Package Manager** (sem CocoaPods), `server.url` no painel de produção: cookies e CORS
  continuam first-party e o painel atualiza sem nova versão na loja. `allowNavigation` só `garfeed.com.br` e subdomínios;
  tela offline local (`www/offline.html`). Não existe TWA no iOS e o WKWebView não tem Web Push nem Web NFC, então:
  - **Push por APNs direto da API** (`lib/apns.ts`: HTTP/2 + JWT ES256 com a chave `.p8`, usando `node:http2` e o
    `jsonwebtoken` que já existia — nenhuma dependência nova, nada de Firebase). Tabela `ApnsDevice`, rota
    `POST /push/apns-device`, envio dentro de `notifyRestaurant` (mesmos gatilhos do Web Push). Sem `APNS_*` = desligado.
  - **NFC nativo** com `@capgo/capacitor-nfc` (mantido, com suporte a SPM e Capacitor 8; licença MPL-2.0, usada sem
    modificação). Alternativa avaliada: `@exxili/capacitor-nfc` (0.0.x, pouco mantida).
  - **Ponte sem dependência no painel:** como a página vem do `server.url`, o Capacitor injeta `window.Capacitor.Plugins`;
    `apps/painel/src/lib/native.ts` usa isso direto. O bundle do painel não ganhou pacote novo.
  - **Câmera (QR):** `getUserMedia` funciona no WKWebView (iOS 14.3+) com `NSCameraUsageDescription`; o Capacitor concede
    o pedido de captura da página, ficando só o diálogo do sistema.
- **`apps/mobile` fica fora do workspace pnpm** (`!apps/mobile` em `pnpm-workspace.yaml`): usa npm e `package-lock.json`
  próprios. Motivo: o `Package.swift` gerado pelo Capacitor aponta para `node_modules` por caminho relativo, que no pnpm
  inclui a versão no caminho; com npm o caminho é estável e o `pnpm-lock.yaml` da raiz não muda.
- **Assinatura iOS:** a configuração Release do alvo `App` é `Manual` e lê `GF_SIGN_IDENTITY`, `GF_TEAM_ID` e `GF_PROFILE`
  passados pelo `xcodebuild` no CI. Passar `CODE_SIGN_IDENTITY`/`PROVISIONING_PROFILE_SPECIFIER` direto na linha de comando
  valeria também para os pacotes SPM, que não aceitam perfil.
- **Limites conhecidos:** o token APNs continua ligado ao último usuário que abriu o app naquele aparelho mesmo depois do
  logout (mesmo comportamento do Web Push atual); tocar na notificação abre o app, sem navegar para o pedido; a opção
  "Aproximar (NFC)" aparece também no iPad, que não tem NFC (mostra erro e oferece digitar o código).

## 2026-11-11 — E-mail transacional pelo Velomail
- **Provedor**: o envio usa o **Velomail**, servidor de e-mail **próprio do dono do projeto** (self-hosted, fora deste compose).
  Não é SaaS de terceiros, então respeita a regra "tudo self-hosted"; e não é obrigatório: sem `VELOMAIL_API_KEY` a aplicação
  funciona e só não envia (em dev o link sai no log). Integração por HTTP (`fetch`), sem SDK nem dependência nova.
- **Domínio**: `garfeed.com.br` autenticado no Velomail — DKIM em `default._domainkey`, DMARC `p=none` (relatórios para o
  Velomail) e return-path em `uz-mail.garfeed.com.br` (MX + SPF). Nada em `@`: o domínio ainda **não tem MX principal**,
  então `contato@garfeed.com.br` (Reply-To) só recebe quando houver caixa de entrada configurada.
- **Remetente** `nao-responda@garfeed.com.br`: a API do Velomail valida `from` como endereço puro (sem nome de exibição).
- **Envio assíncrono simples** (`lib/mailer.ts`): *fire-and-forget* com 3 tentativas e log, em vez de fila BullMQ — a API não
  tem worker próprio e os e-mails são reemitíveis pelo usuário ("esqueci minha senha", "reenviar convite").
- **Convite = usuário sem senha** (`User.passwordHash` passou a ser opcional) + `UserToken` (tipo `INVITE`, 7 dias).
  O mesmo token/tela serve para recuperação (`PASSWORD_RESET`, 1 h) e para as boas-vindas do dono criado pelo superadmin.
  `POST /users` e `POST /admin/restaurants` continuam aceitando `password` (compatibilidade); sem ela, vai convite por e-mail.
  O painel não pede mais senha inicial nessas telas.
- **Cancelar convite** apaga o usuário (nunca entrou, não há histórico). **Convite pendente** não usa "Esqueci minha senha":
  o dono reenvia. Lista completa de e-mails, gatilhos e limites em `docs/EMAILS.md`.

## 2026-11-11 — Cobrança da assinatura pelo Asaas
- **Exceção à regra "sem serviços externos"**, autorizada pelo dono do projeto: o Asaas (plataforma de pagamento dele) cobra a
  **assinatura dos restaurantes**. É opcional em tempo de execução: sem `ASAAS_API_KEY` a cobrança fica desligada e nada mais muda.
  Todo o resto continua self-hosted. Detalhes, variáveis e passo a passo em `docs/COBRANCA.md`.
- **Interpretação de "integrar o Asaas"**: assinatura mensal/anual dos restaurantes (Essencial R$ 129, Pro R$ 199, Rede sob
  consulta com valor manual; anual = pague 10, leve 12, uma cobrança por ano). O pagamento do cliente final na mesa continua
  fora do Garfeed (PRD: Pix na mesa é V3).
- **Modelo**: `Billing` (1:1 com o restaurante: CPF/CNPJ, contato, ids do Asaas, ciclo, valor em centavos, próximo vencimento,
  situação), `BillingPayment` (espelho das cobranças, alimentado pelos webhooks) e `BillingEvent` (idempotência do webhook).
- **Forma de pagamento**: `billingType: UNDEFINED` — o pagador escolhe Pix, boleto ou cartão na fatura do Asaas.
- **Inadimplência**: vencida → situação "Vencido"; após `BILLING_GRACE_DAYS` (padrão 7) → `SUSPENDED`; pagamento reativa.
  Estorno, chargeback e assinatura cancelada **não suspendem**: só registram (o admin decide).
- **Fim do teste de 30 dias**: o restaurante `TRIAL` sem assinatura **continua funcionando**. Nada é suspenso automaticamente:
  a tela Planos marca quem passou de 30 dias (`TRIAL_DAYS`) e o admin decide — ativar a assinatura (o 1º pagamento leva a
  `ACTIVE`) ou suspender manualmente em Restaurantes. Automatizar só quando o dono definir a regra.
- **Conta compartilhada**: a conta do Asaas atende outros negócios. O webhook ignora (200) clientes que não são do Garfeed e
  cobranças avulsas; nunca listamos/alteramos clientes de terceiros.
- **Limites por plano** (15 mesas, nº de usuários) não são aplicados pelo sistema; plano é informação comercial.
- **Rotas além do PRD**: `GET /settings/billing`, `GET|PUT|POST|PATCH|DELETE /admin/billing…`, `POST /webhooks/asaas`
  (`api.billing` no contrato). Erros novos: `BILLING_DISABLED` (503), `BILLING_PROVIDER` (502).
