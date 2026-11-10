# Garfeed

Cardápio digital em feed vertical, acessado por placa NFC/QR na mesa, com pedido pela mesa e painel em tempo real.
Requisitos em [`docs/02-PRD.md`](docs/02-PRD.md); regras do repositório em [`CLAUDE.md`](CLAUDE.md); decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## Estrutura

```
apps/api        Express + Prisma + Socket.io (porta 3000)
apps/worker     consumidor BullMQ (mídia: FFmpeg/sharp)
apps/landing    landing estática
packages/shared contrato da API (schemas Zod, tipos, rotas, eventos Socket.io), enums, formatBRL, código de placa
packages/ui     tokens de design (tokens.css + preset Tailwind)
infra/          docker-compose.dev.yml (postgres, redis, minio)
```

## Rodando localmente

Requisitos: Node 20+ (`.nvmrc`), pnpm 10, Docker.

```bash
cp .env.example .env
pnpm i
docker compose -f infra/docker-compose.dev.yml up -d   # postgres :5434, redis :6380, minio :9000 (console :9001)
pnpm --filter api prisma migrate dev                   # aplica as migrações
pnpm --filter api seed                                 # restaurante demo "Brasa & Pão"
pnpm dev                                               # api + worker em modo watch
```

API em http://localhost:3000 (`GET /health`). Console do MinIO em http://localhost:9001 (`garfeed` / `garfeed-minio-dev`).

## Usuários do seed

Senha de todos: `garfeed123` (variável `SEED_PASSWORD`).

| E-mail | Papel |
|---|---|
| admin@garfeed.com.br | SUPERADMIN |
| carlos@brasaepao.com.br | OWNER |
| gerente@brasaepao.com.br | MANAGER |
| julia@brasaepao.com.br | WAITER |
| cozinha@brasaepao.com.br | KITCHEN (cozinha) |
| bar@brasaepao.com.br | KITCHEN (bar) |

Restaurante `brasa-e-pao`: 5 categorias, 6 itens (Brownie esgotado), grupos "Ponto da carne" e "Adicionais",
Mesas 1–20 com placas `GF0001`–`GF0020` ativas; `GF0021`–`GF0023` soltas pré-atribuídas e `GF0024`–`GF0025` sem dono.

## Scripts (raiz)

| Comando | O que faz |
|---|---|
| `pnpm dev` | todos os apps em modo dev |
| `pnpm test` | vitest (shared) + vitest/supertest (api — precisa do docker dev + migrate + seed) |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm build` | build de api e worker (`dist/`) |

## Contrato da API

Tudo que painel e cardápio consomem vem de `@garfeed/shared`:

- `api` (`contract.ts`): cada rota com método, caminho, autenticação, papéis e schemas de `params`/`query`/`body`/`response`.
- `schemas.ts`: schemas Zod e tipos (`z.infer`). Erros sempre no formato `ErrorResponse` (`{ error: { code, message } }`, mensagem pt-BR).
- `socket.ts`: salas, eventos e payloads do Socket.io (`PanelServerEvents`, `GuestServerEvents`).

Padrão multi-tenant na API: `restaurantId` sempre de `tenantId(req)` (token) — ver `apps/api/src/modules/menu/router.ts`
e o teste-modelo `apps/api/test/tenant-isolation.test.ts`.
