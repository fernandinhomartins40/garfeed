# CLAUDE.md — Garfeed

Instruções para o Claude Code neste repositório. Leia antes de qualquer tarefa.

## O que é
Garfeed: cardápio digital em formato de feed vertical (vídeo/foto em tela cheia), acessado por placa NFC + QR na mesa, com pedido identificado pela mesa e painel web em tempo real para o restaurante.
Documentos de referência (fonte da verdade):
- `docs/01-MODELO-DE-NEGOCIO.md`
- `docs/02-PRD.md` ← requisitos, modelo de dados, API, critérios de aceite
- `docs/03-PROMPTS-TELAS-CODEX.md` e imagens em `docs/telas/` ← referência visual (códigos M1–M12, P0–P13)
- `docs/Notas-das-Telas.md` ← notas de interação por tela
- `docs/referencias/` ← landing aprovada (desktop/mobile) · `docs/manual/` ← manual visual
- `docs/assets/` ← marca (SVG/PNG), assets da landing (WebP responsivo), ícones, favicon, Play Store
- `docs/KIT-README.md` ← regras de uso dos assets (breakpoints da landing, hero orgânico, Play Store)

## Regras inegociáveis
1. **Tudo self-hosted em Docker.** Proibido usar Vercel, Supabase, Firebase, AWS S3, Clerk, Auth0, Pusher, OneSignal ou qualquer serviço externo obrigatório. Arquivos → MinIO. Push → Web Push com VAPID. Tempo real → Socket.io + Redis.
2. **TypeScript estrito** em todo o monorepo (`strict: true`, sem `any` sem justificativa).
3. **Multi-tenant:** toda query de negócio filtra por `restaurantId` vindo do token — nunca do corpo da requisição. Escreva teste para garantir isolamento.
4. **Dinheiro em centavos (Int).** Formatação só na borda (`formatBRL` em `packages/shared`).
5. **Validação com Zod** em toda entrada da API; schemas compartilhados em `packages/shared`.
6. **Cliente é anônimo.** Nada de cadastro do cliente final; sessão por `guestToken` em cookie httpOnly.
7. Interface e mensagens em **pt-BR**.

## Stack
- pnpm workspaces · Node 20
- `apps/api`: Express, Prisma (PostgreSQL 16), Zod, Socket.io (+ redis adapter), BullMQ, pino, argon2, JWT
- `apps/worker`: BullMQ consumer, FFmpeg, sharp
- `apps/painel`: React 18 + Vite + Tailwind + shadcn/ui + TanStack Query + Zustand + React Hook Form + dnd-kit
- `apps/cardapio`: React + Vite PWA (leve: evitar libs pesadas; bundle < 200 KB gz)
- `apps/landing`: landing estática (HTML/CSS) servida pelo Nginx
- `packages/shared`: tipos, enums, schemas Zod, utils
- `packages/ui`: tokens de design (cores/fontes abaixo)
- Infra: Docker Compose (nginx, certbot, api, worker, postgres, redis, minio, backup)

## Identidade visual (tokens)
```
--gf-orange: #FE581D   --gf-orange-hover: #E54A12   --gf-orange-soft: #FFF1EA
--gf-navy:   #142433   --gf-navy-80: #3A4756        --gf-muted: #6B7480
--gf-border: #E6E8EC   --gf-bg: #F6F7F9
--gf-cream:  #FFF8F2   --gf-peach: #FFE9DC          (landing)
--success: #16A34A  --warning: #F59E0B  --danger: #DC2626  --info: #2563EB
Fontes: Nunito (títulos, preços, número da mesa — 800/900) · Inter (UI — 400/500/600)
Raio: cards 12px · chips/botões 999px · sheets 20px · mídia na landing 24px
```
Logo: use os SVGs de `docs/assets/marca/` (lettering é desenho, nunca substituir por fonte digitada).

## Comandos (manter atualizados)
```
pnpm i
pnpm dev                    # sobe api, worker, painel e cardapio em modo dev
docker compose -f infra/docker-compose.dev.yml up -d   # postgres, redis, minio locais
pnpm --filter api prisma migrate dev
pnpm --filter api seed      # restaurante demo "Brasa & Pão", 20 mesas, placas GF0001..
pnpm test                   # vitest + supertest
pnpm e2e                    # playwright
```

## Como trabalhar
- Siga a ordem de entrega do PRD (seção 12). Uma fase por vez; ao terminar, rode testes e marque os critérios de aceite atendidos.
- Antes de criar uma tela, confira a imagem correspondente em `docs/telas/`.
- Commits pequenos e descritivos em pt-BR (`feat(pedidos): ...`).
- Não invente requisitos: em caso de dúvida, pergunte ou registre em `docs/DECISOES.md`.
- Nunca commitar `.env`; manter `.env.example` completo e comentado.
