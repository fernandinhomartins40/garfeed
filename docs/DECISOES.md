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
