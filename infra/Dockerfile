# Imagens de produção do Garfeed (contexto = raiz do repositório). Alvos:
#   api     — Express + Prisma; aplica `prisma migrate deploy` ao subir
#   worker  — consumidor BullMQ com FFmpeg
#   web     — Nginx com landing + build estático do painel e do cardápio
# Uso: docker compose -f infra/docker-compose.yml build

FROM node:20-bookworm-slim AS base
# openssl: engine do Prisma
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/* \
  && corepack enable
WORKDIR /app

# ---------- build: monorepo inteiro (dev deps) ----------
FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
# VITE_* entram no bundle do navegador no build
ARG VITE_API_URL=https://api.garfeed.com.br
ARG VITE_TAG_BASE_URL=https://g.garfeed.com.br
ARG VITE_VAPID_PUBLIC_KEY=
ENV VITE_API_URL=$VITE_API_URL VITE_TAG_BASE_URL=$VITE_TAG_BASE_URL VITE_VAPID_PUBLIC_KEY=$VITE_VAPID_PUBLIC_KEY
RUN pnpm --filter api --filter worker --filter painel --filter cardapio build

# ---------- dependências de produção de api + worker (gera o Prisma Client no postinstall) ----------
FROM base AS prod-deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json apps/api/
COPY apps/api/prisma apps/api/prisma
COPY apps/worker/package.json apps/worker/
COPY apps/painel/package.json apps/painel/
COPY apps/cardapio/package.json apps/cardapio/
COPY packages/shared/package.json packages/shared/
COPY packages/ui/package.json packages/ui/
RUN pnpm install --prod --frozen-lockfile --filter api --filter worker

# ---------- api ----------
FROM base AS api
ENV NODE_ENV=production
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/api/dist /app/apps/api/dist
WORKDIR /app/apps/api
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["sh", "-c", "node_modules/.bin/prisma migrate deploy && exec node dist/index.js"]

# ---------- worker ----------
FROM base AS worker
RUN apt-get update && apt-get install -y --no-install-recommends ffmpeg && rm -rf /var/lib/apt/lists/*
ENV NODE_ENV=production
COPY --from=prod-deps /app /app
COPY --from=build /app/apps/worker/dist /app/apps/worker/dist
WORKDIR /app/apps/worker
USER node
CMD ["node", "dist/index.js"]

# ---------- web (Nginx) ----------
FROM nginx:1.28-alpine AS web
COPY apps/landing /srv/landing
COPY --from=build /app/apps/painel/dist /srv/painel
COPY --from=build /app/apps/cardapio/dist /srv/cardapio
# a config vem de infra/nginx (montada em /etc/nginx/templates e /etc/nginx/snippets)
RUN rm /etc/nginx/conf.d/default.conf
