# Garfeed — PRD (Documento de Requisitos do Produto)

> Versão 1.0 · Novembro/2026 · Escopo principal: **MVP (V1)**
> Leia junto com `01-MODELO-DE-NEGOCIO.md`. As telas estão em `03-PROMPTS-TELAS-CODEX.md`.

---

## 1. Visão do produto

Cardápio digital em formato de **feed vertical de vídeos/fotos em tela cheia**, acessado por **placa NFC + QR Code** na mesa, com **pedido identificado pela mesa** e um **painel web** onde o restaurante recebe pedidos e chamados em tempo real.

**Restrições de produto:**
- O cliente **não baixa app** e **não faz cadastro**. Tudo roda no navegador do celular (PWA).
- O sistema **não substitui** o PDV/caixa do restaurante; ele se soma à operação.
- Infraestrutura **100% própria** em Docker numa VPS. Nada de Vercel, Supabase, Firebase, S3 da AWS ou serviços terceiros obrigatórios.

## 2. Personas

| Persona | Quem é | O que precisa |
|---|---|---|
| **Cliente** (Ana, 27) | Está na mesa com o celular na mão | Ver os pratos de forma bonita, pedir e chamar o garçom sem esperar |
| **Dono/Gerente** (Carlos, 41) | Toca o restaurante, pouco tempo | Ativar rápido, editar preço/esgotado na hora, ver o que vende |
| **Garçom/Cozinha** (Júlia, 23) | Atende 8 mesas no pico | Ver pedidos e chamados por mesa, com som, e confirmar com 1 toque |
| **Admin Garfeed** (você) | Dono da plataforma | Criar restaurantes, gerar placas, acompanhar planos |

## 3. Glossário

- **Restaurante (tenant):** cada cliente do Garfeed. Dados sempre isolados por `restaurantId`.
- **Placa (tag):** objeto físico com NFC + QR, com um **código único** (ex.: `GF7K2P`). URL gravada: `https://g.garfeed.com.br/GF7K2P`.
- **Mesa:** local do restaurante (ex.: "Mesa 7", "Balcão 2", "Varanda 3"). Uma placa é vinculada a uma mesa.
- **Sessão de mesa:** período em que a mesa está ocupada. Agrupa pedidos e chamados. Clientes anônimos entram nela por um cookie.
- **Item:** produto do cardápio, com mídia (vídeo/foto), preço, categoria e opcionais.
- **Chamado:** "Chamar garçom" ou "Pedir a conta".

---

## 4. Escopo do MVP (V1)

### 4.1 Dentro
- Feed do cardápio (cliente)
- Carrinho e pedido pela mesa (cliente)
- Chamar garçom / pedir a conta (cliente)
- Painel: pedidos e chamados em tempo real com som
- Painel: cadastro de cardápio (categorias, itens, mídia, opcionais, esgotado)
- Painel: mesas e **vínculo de placas** (QR pela câmera, NFC no Android ou digitando o código)
- Painel: usuários da equipe (dono, gerente, garçom, cozinha)
- Painel: configurações do restaurante (logo, cores, horário, Wi-Fi, link do Google)
- Admin Garfeed: restaurantes, planos, geração de lotes de placas
- Rastreamento básico de eventos (visualização de item, tempo, pedidos)

### 4.2 Fora (V2/V3)
Avaliações + redirecionamento Google, relatórios avançados, multi-idioma, sugestões "combina com", pagamento online (Pix), integração com PDV, multi-unidades, app nativo.

---

## 5. Requisitos funcionais

### 5.1 Cliente — acesso pela placa

**RF-01 Abrir pela placa.** `GET g.garfeed.com.br/:codigo`
- Placa **não vinculada** → tela "Esta mesa ainda não foi ativada" + link do Instagram do Garfeed.
- Placa vinculada a mesa **ativa** → abre o feed do restaurante já com `mesa` no contexto.
- Restaurante **suspenso/fora do horário** → mostra o cardápio em modo **somente visualização** (sem pedir) com aviso.

**RF-02 Sessão anônima.** Ao abrir, o front chama `POST /public/tags/:codigo/session`.
- Se a mesa não tem sessão aberta → cria `TableSession` (status `OPEN`).
- Gera um `guestToken` (cookie httpOnly, 6h) ligado à sessão.
- Vários celulares na mesma mesa entram **na mesma sessão** (pedidos aparecem juntos no painel).
- Sessão fecha quando: o garçom "fecha a mesa" no painel **ou** 3h sem atividade.

### 5.2 Cliente — feed

**RF-03 Feed vertical em tela cheia.**
- Um item por tela, rolagem com *snap* vertical (`scroll-snap-type: y mandatory`).
- Vídeo: autoplay **mudo**, em loop, `playsinline`; botão de som opcional. Foto: tela cheia com leve zoom (Ken Burns).
- Pré-carregar os **2 próximos** itens; descarregar os que ficaram 3+ telas para trás.
- Sobreposição inferior: nome, preço (`R$ 32,90`), descrição curta (2 linhas, "ver mais"), selos (`Mais pedido`, `Novo`, `Vegano`, `Picante`).
- Lateral direita (estilo rede social): ❤ favoritar, ➕ adicionar, ↗ compartilhar.
- Item **esgotado**: selo "Esgotado hoje", botão desabilitado (continua no feed).

**RF-04 Categorias.** Barra de abas no topo (chips roláveis): `Destaques`, `Lanches`, `Bebidas`… Tocar pula para o 1º item da categoria. A aba ativa acompanha a rolagem.

**RF-05 Visão em grade.** Botão para alternar feed ↔ grade (miniaturas 9:16 em 3 colunas) para quem quer achar rápido.

**RF-06 Detalhe/opcionais.** Ao tocar "Quero": *bottom sheet* com opcionais (ex.: ponto da carne — escolha única obrigatória; adicionais — múltipla com preço), observação (140 caracteres), quantidade e total atualizado.

### 5.3 Cliente — pedido e chamados

**RF-07 Carrinho.** Botão flutuante com contador e total. Tela de revisão: itens, opcionais, observações, editar quantidade, remover.

**RF-08 Enviar pedido.** `POST /public/orders` com `guestToken`.
- Campo opcional "Seu nome" (para o garçom chamar) — salvo no localStorage para os próximos pedidos.
- Pedido nasce como `PENDING` (aguardando confirmação do restaurante).
- Tela de acompanhamento: `Enviado → Confirmado → Em preparo → Pronto → Entregue` (atualiza em tempo real).

**RF-09 Botões rápidos** (sempre visíveis no menu da mesa):
- **Chamar garçom** → cria `ServiceCall{type: WAITER}`.
- **Pedir a conta** → `ServiceCall{type: BILL}`; mostra o resumo do consumo da sessão (valor **informativo**, "confira com o garçom").
- **Mais uma igual** → nos pedidos já entregues, repete o item com 1 toque.
- Anti-spam: mesmo tipo de chamado só pode ser repetido após 60 s.

**RF-10 Hub da mesa.** Ícone no topo abre: nome do restaurante, Wi-Fi (copiar senha), Instagram, horário, "Meus pedidos".

### 5.4 Painel — operação

**RF-11 Tela "Ao vivo"** (tela principal, pensada para tablet no balcão):
- Colunas: **Novos** · **Em preparo** · **Prontos**; e uma faixa de **Chamados** no topo.
- Cada card: mesa (grande), horário/tempo decorrido, nome do cliente, itens + opcionais + observações.
- Ações: **Aceitar** / **Recusar (motivo)** → **Pronto** → **Entregue**.
- **Som alto** e repetido a cada 15 s enquanto houver pedido `PENDING` ou chamado aberto; vibração/notificação do navegador (Web Push).
- Card fica vermelho após 5 min sem resposta.
- Filtro por setor (cozinha / bar) via categoria do item.

**RF-12 Mapa de mesas.** Grade de mesas com status: livre, ocupada, com pedido pendente, chamando garçom, pediu conta. Ao abrir a mesa: pedidos da sessão, total, botão **Fechar mesa**.

**RF-13 Configuração de "confirmação obrigatória"** (padrão: ligada). Se desligada, os pedidos já entram como `CONFIRMED`.

### 5.5 Painel — cardápio

**RF-14 Categorias:** criar, renomear, reordenar (arrastar), ocultar, setor (cozinha/bar).

**RF-15 Itens:** nome, descrição, preço, preço promocional, categoria, selos, ordem, ativo/oculto, **esgotado hoje** (*toggle* de 1 toque na listagem), opcionais.

**RF-16 Mídia:** upload de vídeo (mp4/mov até 100 MB, até 30 s) ou foto (jpg/png/webp/heic até 15 MB).
- O vídeo é processado em fila (worker FFmpeg): 720×1280, H.264, ~1,5 Mbps, sem áudio por padrão, `faststart` + pôster JPG + miniatura WebP.
- Status visível: `Processando… → Pronto`. Prévia no formato celular dentro do painel.

**RF-17 Grupos de opcionais:** nome, min/max de escolhas, opções com preço adicional. Reutilizáveis entre itens.

**RF-18 Importar por planilha** (CSV: categoria, nome, descrição, preço) para acelerar a ativação.

### 5.6 Painel — mesas e placas

**RF-19 Mesas:** criar em lote ("criar mesas 1 a 20"), nome, área (Salão, Varanda), ativa/inativa.

**RF-20 Vincular placa** (fluxo-chave):
1. Painel → Mesas → "Vincular placa" (ou dentro da mesa).
2. Três jeitos de ler a placa:
   - **Câmera/QR** (qualquer celular) — leitor no navegador.
   - **NFC** (Android/Chrome via Web NFC; mostrar o botão só se `'NDEFReader' in window`).
   - **Digitar o código** impresso na placa.
3. Escolher a mesa → confirmar. Placa passa a `ACTIVE`.
4. Desvincular/trocar placa a qualquer momento. Placa perdida → "Bloquear placa".

**RF-21 Imprimir QR de emergência:** gerar PDF com QR da mesa (para quando a placa quebrar).

### 5.7 Painel — equipe e configurações

**RF-22 Usuários e papéis:**
| Papel | Pode |
|---|---|
| `OWNER` | tudo, inclusive plano e usuários |
| `MANAGER` | cardápio, mesas, operação |
| `WAITER` | operação (pedidos, chamados, fechar mesa) |
| `KITCHEN` | ver/avançar pedidos do seu setor |

**RF-23 Configurações:** nome, logo, cor de destaque do restaurante (aplicada em detalhes do feed), horário de funcionamento, Wi-Fi, Instagram, link de avaliação do Google, confirmação obrigatória, som.

### 5.8 Admin Garfeed (super admin)

**RF-24** CRUD de restaurantes, plano, status (trial, ativo, suspenso).
**RF-25** Gerar **lote de placas**: N códigos únicos (6 caracteres, alfabeto sem ambíguos `23456789ABCDEFGHJKMNPQRSTUVWXYZ`), exportar CSV (código + URL) para a gráfica gravar NFC e imprimir QR. Placas nascem `UNASSIGNED` e podem ser pré-atribuídas a um restaurante.
**RF-26** Painel simples: restaurantes ativos, pedidos/dia, placas ativas.

### 5.9 Eventos (base para relatórios V2)

**RF-27** O feed envia eventos em lote (a cada 10 s ou ao sair): `session_start`, `item_view` (com `ms` visível), `category_change`, `add_to_cart`, `order_sent`, `call_waiter`, `call_bill`, `favorite`. Sem dados pessoais.

---

## 6. Requisitos não funcionais

| Tema | Requisito |
|---|---|
| **Desempenho** | Feed interativo em < 2,5 s no 4G; primeiro vídeo começa em < 1,5 s; bundle do cardápio < 200 KB gz |
| **Tempo real** | Pedido aparece no painel em < 2 s (Socket.io) |
| **Disponibilidade** | Reinício automático dos containers; backup diário do Postgres e do MinIO (retenção 14 dias) |
| **Segurança** | HTTPS em tudo; JWT de acesso (15 min) + refresh em cookie httpOnly; senhas com argon2; validação Zod em todas as entradas; rate limit (Redis) em rotas públicas; isolamento por `restaurantId` em **toda** query |
| **Anti-trote** | Confirmação obrigatória por padrão; máx. 10 pedidos/sessão/hora; sessão expira; mesa pode ser fechada; bloqueio de placa |
| **LGPD** | Cliente anônimo; nome opcional; eventos sem dados pessoais; política de privacidade no rodapé do hub |
| **Acessibilidade** | Contraste AA, botões ≥ 44 px, textos alternativos, respeitar `prefers-reduced-motion` (sem autoplay) |
| **Compatibilidade** | iOS Safari 15+, Android Chrome 100+; painel em Chrome/Edge/Safari desktop e tablet |
| **Idioma** | pt-BR (estrutura i18n preparada para en/es na V2) |
| **Moeda** | Valores em **centavos (inteiro)** no banco; exibição `Intl.NumberFormat('pt-BR', {style:'currency', currency:'BRL'})` |

---

## 7. Stack técnica (100% self-hosted)

| Camada | Tecnologia |
|---|---|
| Linguagem | **TypeScript** em todo o projeto |
| Monorepo | **pnpm workspaces** |
| API | **Node.js 20 + Express** · **Zod** (validação) · **Prisma** (ORM) · **Socket.io** (tempo real) · **pino** (logs) |
| Fila/jobs | **BullMQ** sobre Redis (processamento de vídeo, expiração de sessões) |
| Worker de mídia | Node + **FFmpeg** (container próprio) · **sharp** para imagens |
| Banco | **PostgreSQL 16** |
| Cache / rate limit / pub-sub | **Redis 7** (também adapter do Socket.io) |
| Arquivos (vídeos/fotos) | **MinIO** (S3 compatível, self-hosted) servido via Nginx com cache |
| Painel web | **React 18 + Vite + TypeScript + Tailwind + shadcn/ui** · TanStack Query · Zustand · React Hook Form · dnd-kit · lucide-react |
| Cardápio do cliente | **React + Vite (PWA)** separado do painel, para ficar leve · Tailwind · `vite-plugin-pwa` |
| Leitura de QR no painel | `BarcodeDetector` nativo com fallback `@zxing/browser` |
| NFC no painel | **Web NFC** (`NDEFReader`) — só Android/Chrome |
| Notificações | **Web Push com VAPID** (biblioteca `web-push`, sem serviço externo) + som via Socket.io |
| Proxy / SSL | **Nginx** + **Certbot** (Let's Encrypt) — ou Traefik |
| Deploy | **Docker Compose** na VPS · build via GitHub Actions → registry próprio ou build na VPS |
| Testes | Vitest (unit) · Supertest (API) · Playwright (fluxos críticos) |

### 7.1 Domínios

| Domínio | Serve |
|---|---|
| `garfeed.com.br` | Landing page (pode ser página estática no mesmo Nginx) |
| `g.garfeed.com.br/:codigo` | Cardápio do cliente (URL curta gravada na placa) |
| `painel.garfeed.com.br` | Painel do restaurante + admin |
| `api.garfeed.com.br` | API REST + WebSocket |
| `midia.garfeed.com.br` | Vídeos e imagens (MinIO por trás do Nginx com cache) |

### 7.2 Estrutura do repositório

```
garfeed/
├── apps/
│   ├── api/              # Express + Prisma + Socket.io
│   │   ├── prisma/schema.prisma
│   │   └── src/
│   │       ├── modules/  # auth, restaurants, menu, tables, tags, sessions, orders, calls, media, events, admin
│   │       ├── realtime/ # socket.io (rooms por restaurante)
│   │       ├── jobs/     # filas BullMQ
│   │       └── lib/      # prisma, redis, minio, auth, errors
│   ├── worker/           # consumidor de fila: FFmpeg/sharp
│   ├── painel/           # React (dono, equipe, admin)
│   ├── cardapio/         # React PWA (cliente)
│   └── landing/          # landing estática
├── packages/
│   ├── shared/           # tipos, schemas Zod, enums, formatadores (BRL)
│   └── ui/               # tokens de design + componentes comuns
├── infra/
│   ├── docker-compose.yml
│   ├── docker-compose.dev.yml
│   ├── nginx/conf.d/*.conf
│   └── backup/           # scripts pg_dump + mc mirror
├── docs/                 # estes documentos
└── CLAUDE.md
```

### 7.3 Docker Compose (serviços)

| Serviço | Imagem | Observação |
|---|---|---|
| `nginx` | nginx:alpine | proxy, SSL, estáticos do painel/cardápio, cache de mídia |
| `certbot` | certbot/certbot | renovação automática |
| `api` | build `apps/api` | porta interna 3000 |
| `worker` | build `apps/worker` (com ffmpeg) | escala separada da API |
| `postgres` | postgres:16-alpine | volume `pgdata` |
| `redis` | redis:7-alpine | AOF ligado |
| `minio` | minio/minio | volume `miniodata`, bucket `garfeed-media` |
| `backup` | alpine + cron | pg_dump diário + espelho do MinIO para armazenamento externo |

Rede interna `garfeed_net`; só o Nginx expõe portas 80/443. Se a VPS já tem um proxy compartilhado entre vários apps, conecte `api`/estáticos à rede desse proxy e remova `nginx`/`certbot` deste compose.

---

## 8. Modelo de dados (Prisma — resumo)

```prisma
enum Plan        { ESSENTIAL PRO NETWORK }
enum RestStatus  { TRIAL ACTIVE SUSPENDED }
enum Role        { SUPERADMIN OWNER MANAGER WAITER KITCHEN }
enum TagStatus   { UNASSIGNED ACTIVE BLOCKED }
enum SessionStatus { OPEN CLOSED EXPIRED }
enum OrderStatus { PENDING CONFIRMED PREPARING READY DELIVERED REJECTED CANCELED }
enum CallType    { WAITER BILL }
enum CallStatus  { OPEN DONE }
enum MediaType   { VIDEO IMAGE }
enum MediaStatus { UPLOADING PROCESSING READY FAILED }
enum Sector      { KITCHEN BAR }

model Restaurant {
  id String @id @default(cuid())
  slug String @unique
  name String
  logoUrl String?
  accentColor String?          // cor do restaurante (detalhes no feed)
  plan Plan @default(ESSENTIAL)
  status RestStatus @default(TRIAL)
  requireConfirmation Boolean @default(true)
  wifiName String?  wifiPassword String?
  instagram String? googleReviewUrl String?
  openingHours Json?           // { mon: [["11:00","15:00"],["18:00","23:00"]], ... }
  createdAt DateTime @default(now())
}

model User {
  id String @id @default(cuid())
  restaurantId String?         // null para SUPERADMIN
  name String  email String @unique  passwordHash String
  role Role  active Boolean @default(true)
}

model Category { id String @id @default(cuid()) restaurantId String name String position Int sector Sector @default(KITCHEN) visible Boolean @default(true) }

model Item {
  id String @id @default(cuid())
  restaurantId String  categoryId String
  name String  description String?
  priceCents Int  promoPriceCents Int?
  badges String[]              // MOST_ORDERED, NEW, VEGAN, SPICY...
  position Int  visible Boolean @default(true)
  soldOut Boolean @default(false)
  mediaId String?
}

model Media {
  id String @id @default(cuid())
  restaurantId String  type MediaType  status MediaStatus
  originalKey String  url String?  posterUrl String?  thumbUrl String?
  durationMs Int?  width Int?  height Int?
}

model OptionGroup { id String @id @default(cuid()) restaurantId String name String min Int @default(0) max Int @default(1) }
model Option      { id String @id @default(cuid()) groupId String name String priceCents Int @default(0) position Int }
model ItemOptionGroup { itemId String groupId String position Int @@id([itemId, groupId]) }

model Table { id String @id @default(cuid()) restaurantId String name String area String? active Boolean @default(true) @@unique([restaurantId, name]) }

model Tag {
  id String @id @default(cuid())
  code String @unique          // GF7K2P
  status TagStatus @default(UNASSIGNED)
  restaurantId String?  tableId String? @unique
  batch String?  activatedAt DateTime?
}

model TableSession {
  id String @id @default(cuid())
  restaurantId String  tableId String
  status SessionStatus @default(OPEN)
  openedAt DateTime @default(now())  closedAt DateTime?  lastActivityAt DateTime @default(now())
}

model Order {
  id String @id @default(cuid())
  restaurantId String  sessionId String  tableId String
  number Int                    // sequencial por restaurante/dia
  customerName String?
  status OrderStatus @default(PENDING)
  totalCents Int  rejectReason String?
  createdAt DateTime @default(now())  updatedAt DateTime @updatedAt
}

model OrderItem {
  id String @id @default(cuid())
  orderId String  itemId String
  nameSnapshot String  unitPriceCents Int  quantity Int
  options Json                  // [{group, option, priceCents}]
  note String?  sector Sector
}

model ServiceCall { id String @id @default(cuid()) restaurantId String sessionId String tableId String type CallType status CallStatus @default(OPEN) createdAt DateTime @default(now()) doneAt DateTime? doneById String? }

model Event { id BigInt @id @default(autoincrement()) restaurantId String sessionId String? itemId String? type String value Int? createdAt DateTime @default(now()) @@index([restaurantId, createdAt]) }

model PushSubscription { id String @id @default(cuid()) userId String endpoint String @unique keys Json }
```

> Toda tabela de negócio tem índice em `restaurantId`. Preços sempre em centavos; `OrderItem` guarda *snapshot* de nome e preço.

---

## 9. API (resumo)

**Pública (cliente — `guestToken` em cookie):**
| Método | Rota | Descrição |
|---|---|---|
| GET | `/public/tags/:code` | resolve placa → restaurante, mesa, status |
| POST | `/public/tags/:code/session` | entra/cria sessão da mesa, devolve `guestToken` |
| GET | `/public/restaurants/:slug/menu` | categorias + itens + mídia + opcionais (cache Redis 60 s, invalidado na edição) |
| POST | `/public/orders` | cria pedido na sessão |
| GET | `/public/sessions/me` | pedidos e chamados da sessão + total |
| POST | `/public/calls` | `{type: WAITER|BILL}` |
| POST | `/public/events` | lote de eventos |

**Autenticada (painel — JWT):**
`/auth/login · /auth/refresh · /auth/logout`
`/menu/categories` · `/menu/items` · `/menu/items/:id/sold-out` · `/menu/option-groups` · `/menu/import-csv`
`/media/upload-url` (URL pré-assinada do MinIO) · `/media/:id/complete`
`/tables` · `/tables/bulk` · `/tags/link` `{code, tableId}` · `/tags/:code/unlink` · `/tags/:code/block`
`/sessions/:id/close` · `/orders?status=` · `/orders/:id/status` · `/calls/:id/done`
`/users` · `/settings` · `/push/subscribe`
`/admin/restaurants` · `/admin/tag-batches`

**Tempo real (Socket.io):**
- Sala `restaurant:{id}` (painel): `order:new`, `order:updated`, `call:new`, `call:done`, `table:updated`, `menu:updated`.
- Sala `session:{id}` (cliente): `order:updated`, `menu:updated` (ex.: item esgotou).

---

## 10. Fluxos principais

**A. Ativação de um restaurante (meta: < 1 dia)**
Admin cria restaurante → envia kit de placas → dono loga no painel → importa/cadastra cardápio (ou equipe Garfeed faz) → sobe vídeos → cria mesas em lote → vincula cada placa escaneando → teste: pedido de teste em uma mesa → pronto.

**B. Cliente pedindo**
Encosta/escaneia → feed abre na mesa 7 → rola → "Quero" → opcionais → carrinho → "Enviar pedido" → painel toca → garçom aceita → cliente vê "Confirmado" → cozinha marca "Pronto" → garçom entrega → "Entregue".

**C. Fechar a conta**
Cliente toca "Pedir a conta" → painel toca + faixa de chamados → garçom leva a maquininha (pagamento fora do Garfeed no MVP) → "Fechar mesa" no painel → sessão `CLOSED`; novos acessos abrem sessão nova.

---

## 11. Critérios de aceite do MVP

- [ ] Placa nova mostra "não ativada"; após vínculo, abre o feed da mesa certa em iPhone e Android. — *comprovado em Chromium (E2E + testes da API); falta iPhone/Android reais.*
- [ ] Vincular placa por QR, por NFC (Android) e por código leva < 15 s. — *implementado; falta testar câmera/NFC em aparelho real com placa física.*
- [ ] Feed rola com *snap*, vídeo toca mudo automaticamente, próximos 2 pré-carregados. — *implementado; seed sem vídeo, falta validar com mídia real.*
- [x] Item marcado "esgotado" some do pedido em < 3 s para quem está com o feed aberto. — *E2E: 91–298 ms.*
- [ ] Pedido aparece no painel em < 2 s com som; repete o som até ser aceito. — *E2E: pedido chega em 185–279 ms; o som (repetição a cada 15 s) não tem teste automatizado.*
- [x] Dois celulares na mesma mesa veem os pedidos um do outro em "Meus pedidos da mesa". — *teste da API.*
- [x] Chamar garçom tem bloqueio de 60 s; pedidos limitados a 10/hora por sessão. — *testes da API + E2E.*
- [x] Usuário `WAITER` não acessa cardápio nem configurações; nenhum endpoint vaza dados de outro restaurante (teste automatizado). — *testes da API (todos os módulos) + E2E.*
- [ ] Upload de vídeo de 50 MB vira mp4 720p < 6 MB com pôster, status "Pronto". — *conversão testada com vídeo curto (FFmpeg real); falta medir o caso de 50 MB.*
- [ ] `docker compose up -d` sobe tudo do zero numa VPS limpa com o `.env.example` preenchido. — *verificado localmente (stack de produção sem SSL); falta VPS real com DNS e certbot.*
- [x] Backup diário gerado e restauração testada. — *backup, restauração em banco vazio e retenção de 14 dias verificados localmente; envio remoto não testado.*

## 12. Plano de entrega (6–8 semanas)

| Semana | Entrega |
|---|---|
| 1 | Monorepo, Docker Compose dev, Prisma schema, auth, multi-tenant, seed |
| 2 | Cardápio no painel (categorias, itens, opcionais) + upload/worker de mídia |
| 3 | Feed do cliente (snap, vídeo, pré-carregamento, categorias, grade) |
| 4 | Mesas, placas, vínculo QR/NFC/código, sessões |
| 5 | Carrinho, pedido, chamados, tempo real, tela "Ao vivo" com som, Web Push |
| 6 | Admin Garfeed, lotes de placas, eventos, rate limit/anti-trote |
| 7 | Testes E2E, performance, deploy de produção, backup |
| 8 | Piloto em 1 restaurante real + ajustes |

## 13. Métricas do MVP

Taxa de abertura por mesa ocupada · % de pedidos via Garfeed · tempo abrir→pedir · tempo de resposta a pedidos/chamados · itens mais vistos vs. mais pedidos.

## 14. V2 / V3 (resumo)

- **V2:** avaliação pós-pedido (nota alta → Google; baixa → privado ao dono), ranking "mais pedidos/mais bem avaliados" no feed, relatórios, multi-idioma (en/es), "combina com", promoções por horário (happy hour).
- **V3:** Pix pelo celular, integração com PDVs, multi-unidades, API pública, app nativo do garçom (se necessário).
