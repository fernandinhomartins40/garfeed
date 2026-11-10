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
- **Cache do cardápio** em `menu:{restaurantId}` (`menuCacheKey` no shared); o worker também invalida quando a mídia fica pronta,
  mas não emite `menu:updated` (o painel acompanha por `GET /media/:id`).
- **Admin**: "hoje" (pedidos/dia) no fuso de São Paulo. Lote de placas: `L{AAAAMMDD}-{hex}`; restaurante do lote = dono comum a todas as placas.
- **Mídia**: original em `{restaurantId}/{uuid}/original.ext`; derivados na mesma pasta. HEIC é convertido com FFmpeg antes do sharp
  (o sharp pré-compilado não decodifica HEVC).
