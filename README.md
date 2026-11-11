# Garfeed

Cardápio digital em feed vertical, acessado por placa NFC/QR na mesa, com pedido pela mesa e painel em tempo real.
Requisitos em [`docs/02-PRD.md`](docs/02-PRD.md); regras do repositório em [`CLAUDE.md`](CLAUDE.md); decisões em [`docs/DECISOES.md`](docs/DECISOES.md).

## Estrutura

```
apps/api        Express + Prisma + Socket.io (porta 3000)
apps/worker     consumidor BullMQ (mídia: FFmpeg/sharp)
apps/painel     React (restaurante + admin)
apps/cardapio   PWA do cliente
apps/landing    landing estática
packages/shared contrato da API (schemas Zod, tipos, rotas, eventos Socket.io), enums, formatBRL, código de placa
packages/ui     tokens de design (tokens.css + preset Tailwind)
infra/          docker-compose.dev.yml (dev) · docker-compose.yml + Dockerfile (produção) · nginx/ · backup/ · twa/
e2e/            Playwright (fluxos críticos)
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
| `pnpm test` | vitest (shared) + vitest/supertest (api) + worker (FFmpeg real) — precisa do docker dev + migrate + seed e `ffmpeg`/`ffprobe` no PATH |
| `pnpm typecheck` | `tsc --noEmit` em todos os pacotes |
| `pnpm lint` | ESLint |
| `pnpm build` | build de api, worker, painel e cardápio (`dist/`) |
| `pnpm e2e` | Playwright (Chromium) — sobe API :3100, painel :5183 e cardápio :5184 próprios; precisa do docker dev + migrate + seed. Abre o restaurante (horário) durante o teste e restaura no fim |

## Contrato da API

Tudo que painel e cardápio consomem vem de `@garfeed/shared`:

- `api` (`contract.ts`): cada rota com método, caminho, autenticação, papéis e schemas de `params`/`query`/`body`/`response`.
- `schemas.ts`: schemas Zod e tipos (`z.infer`). Erros sempre no formato `ErrorResponse` (`{ error: { code, message } }`, mensagem pt-BR).
- `socket.ts`: salas, eventos e payloads do Socket.io (`PanelServerEvents`, `GuestServerEvents`).

Worker de mídia: `apps/worker` lê a fila `media` (BullMQ), baixa o original do MinIO, gera com FFmpeg
`video.mp4` (720×1280, H.264 ~1,5 Mbps, sem áudio, faststart) + `poster.jpg` + `thumb.webp` (imagens: sharp → WebP)
na mesma pasta do original e marca a `Media` como `READY`/`FAILED`. Usa o Prisma Client gerado a partir de
`apps/api/prisma/schema.prisma` (postinstall). Requer `ffmpeg` e `ffprobe` no PATH (no Docker, instalados na imagem).

Padrão multi-tenant na API: `restaurantId` sempre de `tenantId(req)` (token) — ver `apps/api/src/modules/menu/router.ts`
e o teste-modelo `apps/api/test/tenant-isolation.test.ts`.

## Deploy em produção (VPS limpa)

Tudo roda no `infra/docker-compose.yml`: nginx (único com portas 80/443), certbot, api (aplica `prisma migrate deploy`
ao subir), worker (FFmpeg), postgres 16, redis 7 (AOF), minio (+ bucket) e backup. Testado com Docker Engine 27+ / Compose v2.24+.

1. **VPS**: Ubuntu 24.04, 2 vCPU / 4 GB RAM / 40 GB+ (vídeos). Instale o Docker: `curl -fsSL https://get.docker.com | sh`.
   Libere só 22, 80 e 443 no firewall (`ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable`).
2. **DNS** (registro A para o IP da VPS): `garfeed.com.br`, `www`, `g`, `painel`, `api`, `midia`.
3. **Código e .env**:
   ```bash
   git clone <repo> garfeed && cd garfeed
   cp .env.example .env && nano .env   # troque tudo marcado [prod] no .env.example
   ```
   Mínimo: `JWT_ACCESS_SECRET`, `GUEST_TOKEN_SECRET` (`openssl rand -hex 32`), `POSTGRES_PASSWORD`, `MINIO_ROOT_PASSWORD`,
   `CORS_ORIGINS=https://painel.garfeed.com.br,https://g.garfeed.com.br`, `COOKIE_DOMAIN=.garfeed.com.br`,
   `MEDIA_PUBLIC_URL=https://midia.garfeed.com.br/garfeed-media`, `VITE_API_URL=https://api.garfeed.com.br`,
   chaves VAPID (`VAPID_*` e `VITE_VAPID_PUBLIC_KEY`) e `LETSENCRYPT_EMAIL`.
4. **Certificado** (uma vez, antes de subir o nginx — a porta 80 precisa estar livre):
   ```bash
   C="docker compose --env-file .env -f infra/docker-compose.yml"
   set -a; . ./.env; set +a
   $C run --rm -p 80:80 --entrypoint certbot certbot certonly --standalone --non-interactive --agree-tos \
     -m "$LETSENCRYPT_EMAIL" -d $DOMAIN -d www.$DOMAIN -d g.$DOMAIN -d painel.$DOMAIN -d api.$DOMAIN -d midia.$DOMAIN
   ```
   A renovação é automática (serviço `certbot` + reload do nginx a cada 6 h).
5. **Subir**: `$C up -d --build` → `$C ps` (tudo `healthy`) → `curl https://api.garfeed.com.br/health`.
6. **Primeiro acesso**: o seed cria o superadmin `admin@garfeed.com.br` (e o restaurante demo) — em produção exige
   `SEED_PASSWORD` forte: `$C exec -e SEED_PASSWORD='<senha forte>' api node dist/seed.js`. Troque/desative o que não usar no painel.
7. **Atualizar**: `git pull && $C up -d --build` (as migrações rodam na subida da API).
8. **App Android (TWA)**: com o painel no ar em HTTPS, siga [`infra/twa/README.md`](infra/twa/README.md) (Bubblewrap, SHA-256 no
   `assetlinks.json`, Play Store).

Mudar config do nginx (`infra/nginx/`) ou o `infra/twa/assetlinks.json`: `$C restart nginx` (sem rebuild).
Mudar `VITE_*`: precisa de `$C build nginx` (entram no bundle).

### Teste local do compose de produção (sem SSL)
```bash
docker compose --env-file infra/local.env -f infra/docker-compose.yml -f infra/docker-compose.local.yml up -d --build
```
Sites em `http://garfeed.localhost:8080`, `http://painel.garfeed.localhost:8080`, `http://g.garfeed.localhost:8080/GF0007`,
`http://api.garfeed.localhost:8080/health` (o Chrome resolve `*.localhost` sozinho; no curl use `-H "Host: ..."` em 127.0.0.1:8080).
Popular com o seed: `docker compose --env-file infra/local.env -f infra/docker-compose.yml -f infra/docker-compose.local.yml exec -e SEED_PASSWORD=garfeed123 api node dist/seed.js`.

### Backup e restauração
O serviço `backup` roda `infra/backup/backup.sh` todo dia (`BACKUP_CRON`, padrão 03:00 de Brasília):
`pg_dump` em `infra/backups/pg/garfeed-AAAAMMDD-HHMMSS.dump` (apaga os com mais de 14 dias) e espelho do bucket em
`infra/backups/minio/`. Com `BACKUP_REMOTE_*` preenchido, a pasta inteira vai também para um S3 externo — **recomendado**,
senão o backup mora no mesmo disco da VPS.

```bash
$C exec backup backup.sh                       # backup agora
ls infra/backups/pg                            # dumps disponíveis
# restaurar (substitui o banco atual!)
$C stop api worker
$C exec backup restore.sh /backups/pg/garfeed-AAAAMMDD-HHMMSS.dump   # sem argumento = o mais recente
$C exec redis redis-cli FLUSHALL               # cache do cardápio/filas da base antiga
$C start api worker
```
Testado no compose local: backup → restauração num banco vazio → mesmas contagens de linhas e mídia de volta no bucket.
Os dumps e a mídia contêm dados dos restaurantes: proteja a pasta `infra/backups` e o destino remoto.
