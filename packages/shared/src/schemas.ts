// Contrato da API (PRD seção 9): corpo das requisições e formato das respostas.
// Datas trafegam como string ISO 8601. Dinheiro sempre em centavos (Int).
import { z } from 'zod';
import {
  Badge, CallStatus, CallType, EventType, MediaStatus, MediaType, OrderStatus, Plan,
  RestStatus, Role, SessionStatus, Sector, StaffRole, TagStatus,
} from './enums';
import { TagCode } from './tag-code';

// ---------- Primitivos ----------
export const Id = z.string().min(1).max(64);
export const IsoDate = z.string();
export const Cents = z.number().int().min(0).max(10_000_000);
export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Cor inválida (use #RRGGBB)');
const Hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Horário inválido (HH:MM)');
/** { mon: [["11:00","15:00"],["18:00","23:00"]], ... } — dia ausente = fechado. */
export const OpeningHours = z.partialRecord(
  z.enum(['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']),
  z.array(z.tuple([Hhmm, Hhmm])).max(4),
);
export type OpeningHours = z.infer<typeof OpeningHours>;
const optionalText = (max: number) => z.string().trim().max(max).nullish();

export const IdParams = z.object({ id: Id });
export const CodeParams = z.object({ code: TagCode });
export const SlugParams = z.object({ slug: z.string().min(1).max(64) });
export type IdParams = z.infer<typeof IdParams>;
export type CodeParams = z.infer<typeof CodeParams>;
export type SlugParams = z.infer<typeof SlugParams>;

// ---------- Erros ----------
export const ErrorCode = z.enum([
  'VALIDATION', 'UNAUTHORIZED', 'FORBIDDEN', 'NOT_FOUND', 'CONFLICT', 'RATE_LIMITED', 'INTERNAL',
  // domínio
  'TAG_NOT_ACTIVE', 'TAG_BLOCKED', 'SESSION_CLOSED', 'RESTAURANT_UNAVAILABLE', 'ITEM_SOLD_OUT',
  'ITEM_UNAVAILABLE', 'INVALID_OPTIONS', 'ORDER_LIMIT', 'CALL_COOLDOWN', 'INVALID_TRANSITION',
  // cobrança (Asaas): desligada (sem chave) · erro devolvido pelo Asaas
  'BILLING_DISABLED', 'BILLING_PROVIDER',
]);
export type ErrorCode = z.infer<typeof ErrorCode>;
/** Toda resposta de erro (4xx/5xx). `message` em pt-BR, pronta para exibir. */
export const ErrorResponse = z.object({
  error: z.object({
    code: ErrorCode,
    message: z.string(),
    details: z.unknown().optional(),
    /** Segundos até poder tentar de novo (RATE_LIMITED, CALL_COOLDOWN, ORDER_LIMIT). */
    retryAfterSec: z.number().int().optional(),
  }),
});
export type ErrorResponse = z.infer<typeof ErrorResponse>;

// ---------- Blocos reutilizados ----------
export const TableRef = z.object({ id: Id, name: z.string(), area: z.string().nullable() });
export type TableRef = z.infer<typeof TableRef>;

export const MediaPublic = z.object({
  id: Id,
  type: MediaType,
  url: z.string().nullable(),
  posterUrl: z.string().nullable(),
  thumbUrl: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  durationMs: z.number().int().nullable(),
});
export type MediaPublic = z.infer<typeof MediaPublic>;

export const Media = MediaPublic.extend({ status: MediaStatus, error: z.string().nullable(), createdAt: IsoDate });
export type Media = z.infer<typeof Media>;

export const Option = z.object({ id: Id, name: z.string(), priceCents: Cents, position: z.number().int() });
export type Option = z.infer<typeof Option>;
export const OptionGroup = z.object({
  id: Id,
  name: z.string(),
  /** min ≥ 1 = obrigatório. min = max = 1 → escolha única. */
  min: z.number().int(),
  max: z.number().int(),
  options: z.array(Option),
});
export type OptionGroup = z.infer<typeof OptionGroup>;

/** Opção escolhida, gravada como snapshot em OrderItem.options. */
export const OrderItemOption = z.object({ group: z.string(), option: z.string(), priceCents: Cents });
export type OrderItemOption = z.infer<typeof OrderItemOption>;

export const OrderItem = z.object({
  id: Id,
  itemId: Id,
  name: z.string(),
  /** Preço unitário já com opcionais. */
  unitPriceCents: Cents,
  quantity: z.number().int(),
  options: z.array(OrderItemOption),
  note: z.string().nullable(),
  sector: Sector,
});
export type OrderItem = z.infer<typeof OrderItem>;

/** Pedido como o cliente vê (sessão da mesa). */
export const PublicOrder = z.object({
  id: Id,
  /** Sequencial por restaurante/dia (ex.: 42 → exibir "042"). */
  number: z.number().int(),
  status: OrderStatus,
  customerName: z.string().nullable(),
  totalCents: Cents,
  rejectReason: z.string().nullable(),
  items: z.array(OrderItem),
  createdAt: IsoDate,
  updatedAt: IsoDate,
});
export type PublicOrder = z.infer<typeof PublicOrder>;

/** Pedido no painel. */
export const PanelOrder = PublicOrder.extend({
  sessionId: Id,
  table: TableRef,
  /** Itens com miniatura da mídia atual do item (null se não houver mídia pronta). */
  items: z.array(OrderItem.extend({ thumbUrl: z.string().nullable() })),
});
export type PanelOrder = z.infer<typeof PanelOrder>;

export const PublicCall = z.object({ id: Id, type: CallType, status: CallStatus, createdAt: IsoDate });
export type PublicCall = z.infer<typeof PublicCall>;
export const PanelCall = PublicCall.extend({ sessionId: Id, table: TableRef, doneAt: IsoDate.nullable() });
export type PanelCall = z.infer<typeof PanelCall>;

/** Restaurante como o cliente vê (feed/hub). */
export const PublicRestaurant = z.object({
  id: Id,
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  wifiName: z.string().nullable(),
  wifiPassword: z.string().nullable(),
  instagram: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
  openingHours: OpeningHours.nullable(),
  /** Dentro do horário agora (fuso do restaurante). */
  isOpen: z.boolean(),
  /** false → cardápio só para ver (suspenso / fora do horário) — RF-01. */
  canOrder: z.boolean(),
  /** Fuso IANA do restaurante (ex.: America/Sao_Paulo) para interpretar openingHours. */
  timezone: z.string(),
});
export type PublicRestaurant = z.infer<typeof PublicRestaurant>;

// =====================================================================
// PÚBLICA (cliente — guestToken em cookie httpOnly)
// =====================================================================

/** GET /public/tags/:code */
export const TagResolveResponse = z.object({
  code: z.string(),
  status: TagStatus,
  /** null quando a placa não está vinculada (tela M1 "não ativada"). */
  restaurant: PublicRestaurant.pick({ id: true, slug: true, name: true, logoUrl: true, accentColor: true, isOpen: true, canOrder: true }).nullable(),
  table: TableRef.nullable(),
});
export type TagResolveResponse = z.infer<typeof TagResolveResponse>;

/** POST /public/tags/:code/session — sem corpo; seta cookie guestToken (6 h). */
export const SessionJoinResponse = z.object({
  session: z.object({ id: Id, openedAt: IsoDate }),
  restaurant: PublicRestaurant,
  table: TableRef,
});
export type SessionJoinResponse = z.infer<typeof SessionJoinResponse>;

export const PublicItem = z.object({
  id: Id,
  categoryId: Id,
  name: z.string(),
  description: z.string().nullable(),
  priceCents: Cents,
  promoPriceCents: Cents.nullable(),
  badges: z.array(Badge),
  soldOut: z.boolean(),
  position: z.number().int(),
  media: MediaPublic.nullable(),
  optionGroups: z.array(OptionGroup),
});
export type PublicItem = z.infer<typeof PublicItem>;

/** GET /public/restaurants/:slug/menu — só categorias e itens visíveis; categorias vazias omitidas. */
export const PublicMenuResponse = z.object({
  restaurant: PublicRestaurant,
  categories: z.array(z.object({
    id: Id, name: z.string(), position: z.number().int(), sector: Sector, items: z.array(PublicItem),
  })),
});
export type PublicMenuResponse = z.infer<typeof PublicMenuResponse>;

/** POST /public/orders */
export const CreateOrderBody = z.object({
  /** UUID gerado no cliente por tentativa de envio: reenvio com a mesma chave devolve o mesmo pedido. */
  idempotencyKey: z.uuid(),
  customerName: z.string().trim().max(40).optional(),
  items: z.array(z.object({
    itemId: Id,
    quantity: z.number().int().min(1).max(20),
    optionIds: z.array(Id).max(30).default([]),
    note: z.string().trim().max(140).optional(),
  })).min(1, 'O pedido está vazio').max(50),
});
export type CreateOrderBody = z.infer<typeof CreateOrderBody>;
export const CreateOrderResponse = PublicOrder;

/** GET /public/sessions/me — pedidos de todos os celulares da mesa. */
export const SessionMeResponse = z.object({
  session: z.object({ id: Id, status: SessionStatus, openedAt: IsoDate }),
  table: TableRef,
  orders: z.array(PublicOrder),
  calls: z.array(PublicCall),
  /** Soma dos pedidos não recusados/cancelados — valor informativo (M11). */
  totalCents: Cents,
});
export type SessionMeResponse = z.infer<typeof SessionMeResponse>;

/** POST /public/calls — 429 CALL_COOLDOWN se repetir o mesmo tipo em < 60 s. */
export const CreateCallBody = z.object({ type: CallType });
export type CreateCallBody = z.infer<typeof CreateCallBody>;
/** retryAfterSec = segundos até poder repetir este tipo de chamado (cooldown). */
export const CreateCallResponse = PublicCall.extend({ retryAfterSec: z.number().int() });
export type CreateCallResponse = z.infer<typeof CreateCallResponse>;

/**
 * POST /public/events — lote (a cada 10 s ou ao sair). Resposta 204. Sem dados pessoais.
 * Aceita application/json ou text/plain com o mesmo JSON (navigator.sendBeacon no pagehide, sem preflight).
 */
export const EventsBody = z.object({
  events: z.array(z.object({
    type: EventType,
    itemId: Id.optional(),
    categoryId: Id.optional(),
    /** ms visível em item_view; quantidade em add_to_cart. */
    value: z.number().int().min(0).max(86_400_000).optional(),
    at: IsoDate.optional(),
  })).min(1).max(200),
});
export type EventsBody = z.infer<typeof EventsBody>;

// =====================================================================
// AUTH (painel)
// =====================================================================
export const LoginBody = z.object({
  email: z.email('E-mail inválido').trim().toLowerCase(),
  password: z.string().min(1, 'Informe a senha').max(200),
});
export type LoginBody = z.infer<typeof LoginBody>;

export const AuthUser = z.object({
  id: Id, name: z.string(), email: z.string(), role: Role,
  restaurantId: Id.nullable(), sector: Sector.nullable(),
});
export type AuthUser = z.infer<typeof AuthUser>;

/** POST /auth/login e POST /auth/refresh. Refresh token vai só no cookie httpOnly. */
export const AuthResponse = z.object({
  /** JWT de acesso (15 min): enviar como `Authorization: Bearer` e no handshake do Socket.io. */
  accessToken: z.string(),
  expiresInSec: z.number().int(),
  user: AuthUser,
  restaurant: z.object({ id: Id, slug: z.string(), name: z.string(), logoUrl: z.string().nullable(), plan: Plan, status: RestStatus }).nullable(),
});
export type AuthResponse = z.infer<typeof AuthResponse>;

const NewPassword = z.string().min(8, 'Mínimo de 8 caracteres').max(200);
/** POST /auth/signup — o restaurante se cadastra sozinho: nasce em TRIAL (30 dias grátis) e já devolve a sessão (AuthResponse). */
export const SignupBody = z.object({
  restaurantName: z.string().trim().min(2, 'Informe o nome do restaurante').max(80),
  name: z.string().trim().min(2, 'Informe o seu nome').max(80),
  email: LoginBody.shape.email.max(254),
  password: NewPassword,
  acceptTerms: z.literal(true, 'Aceite os Termos de Uso e a Política de Privacidade para continuar'),
});
export type SignupBody = z.infer<typeof SignupBody>;
/** POST /auth/forgot-password — a resposta é sempre 204, exista o e-mail ou não. */
export const ForgotPasswordBody = LoginBody.pick({ email: true });
export type ForgotPasswordBody = z.infer<typeof ForgotPasswordBody>;
/** Token do link do e-mail (recuperação de senha ou convite). */
export const PasswordTokenBody = z.object({ token: z.string().min(20).max(200) });
export type PasswordTokenBody = z.infer<typeof PasswordTokenBody>;
export const ResetPasswordBody = PasswordTokenBody.extend({ password: NewPassword });
export type ResetPasswordBody = z.infer<typeof ResetPasswordBody>;
/** O que a tela "Definir senha" mostra antes de enviar (RESET = recuperação · INVITE = convite/boas-vindas). */
export const PasswordTokenInfo = z.object({
  purpose: z.enum(['RESET', 'INVITE']), name: z.string(), email: z.string(), restaurantName: z.string().nullable(),
});
export type PasswordTokenInfo = z.infer<typeof PasswordTokenInfo>;

/** Payload do JWT de acesso. */
export const AccessTokenPayload = z.object({
  sub: Id, role: Role, restaurantId: Id.nullable(), sector: Sector.nullable(),
});
export type AccessTokenPayload = z.infer<typeof AccessTokenPayload>;

// =====================================================================
// CARDÁPIO (painel)
// =====================================================================
export const Category = z.object({
  id: Id, name: z.string(), position: z.number().int(), sector: Sector, visible: z.boolean(),
  itemCount: z.number().int(),
});
export type Category = z.infer<typeof Category>;
export const CreateCategoryBody = z.object({
  name: z.string().trim().min(1).max(40),
  sector: Sector.default('KITCHEN'),
  visible: z.boolean().default(true),
});
export type CreateCategoryBody = z.infer<typeof CreateCategoryBody>;
export const UpdateCategoryBody = CreateCategoryBody.partial();
export type UpdateCategoryBody = z.infer<typeof UpdateCategoryBody>;
/** PUT /menu/categories/order e PUT /menu/items/order — ids na nova ordem (arrastar). */
export const ReorderBody = z.object({ ids: z.array(Id).min(1).max(500) });
export type ReorderBody = z.infer<typeof ReorderBody>;

export const Item = z.object({
  id: Id,
  categoryId: Id,
  name: z.string(),
  description: z.string().nullable(),
  priceCents: Cents,
  promoPriceCents: Cents.nullable(),
  badges: z.array(Badge),
  position: z.number().int(),
  visible: z.boolean(),
  soldOut: z.boolean(),
  media: Media.nullable(),
  /** Na ordem de exibição. */
  optionGroupIds: z.array(Id),
});
export type Item = z.infer<typeof Item>;
export const CreateItemBody = z.object({
  categoryId: Id,
  name: z.string().trim().min(1).max(80),
  description: optionalText(300),
  priceCents: Cents,
  promoPriceCents: Cents.nullish(),
  badges: z.array(Badge).max(4).default([]),
  visible: z.boolean().default(true),
  soldOut: z.boolean().default(false),
  mediaId: Id.nullish(),
  optionGroupIds: z.array(Id).max(20).default([]),
});
export type CreateItemBody = z.infer<typeof CreateItemBody>;
export const UpdateItemBody = CreateItemBody.partial();
export type UpdateItemBody = z.infer<typeof UpdateItemBody>;
export const ListItemsQuery = z.object({ categoryId: Id.optional() });
export type ListItemsQuery = z.infer<typeof ListItemsQuery>;
/** PATCH /menu/items/:id/sold-out — dispara menu:updated. */
export const SoldOutBody = z.object({ soldOut: z.boolean() });
export type SoldOutBody = z.infer<typeof SoldOutBody>;

export const UpsertOptionGroupBody = z.object({
  name: z.string().trim().min(1).max(60),
  min: z.number().int().min(0).max(20).default(0),
  max: z.number().int().min(1).max(20).default(1),
  /** Lista completa (substitui as opções existentes; ordem = position). */
  options: z.array(z.object({ name: z.string().trim().min(1).max(60), priceCents: Cents.default(0) })).min(1).max(30),
}).refine((g) => g.min <= g.max, { message: 'Mínimo maior que o máximo', path: ['min'] });
export type UpsertOptionGroupBody = z.infer<typeof UpsertOptionGroupBody>;
export const OptionGroupWithUsage = OptionGroup.extend({ itemCount: z.number().int() });
export type OptionGroupWithUsage = z.infer<typeof OptionGroupWithUsage>;

/** POST /menu/import-csv — colunas: categoria,nome,descricao,preco (preço "32,90" ou "32.90"). */
export const ImportCsvBody = z.object({ csv: z.string().min(1).max(1_000_000) });
export type ImportCsvBody = z.infer<typeof ImportCsvBody>;
export const ImportCsvResponse = z.object({
  categoriesCreated: z.number().int(),
  itemsCreated: z.number().int(),
  errors: z.array(z.object({ line: z.number().int(), message: z.string() })),
});
export type ImportCsvResponse = z.infer<typeof ImportCsvResponse>;

// =====================================================================
// MÍDIA (painel) — upload direto para o MinIO por URL pré-assinada
// =====================================================================
export const MEDIA_LIMITS = {
  VIDEO: { maxBytes: 100 * 1024 * 1024, maxDurationMs: 30_000, mimeTypes: ['video/mp4', 'video/quicktime'] },
  IMAGE: { maxBytes: 15 * 1024 * 1024, mimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'] },
} as const;

export const UploadUrlBody = z.object({
  type: MediaType,
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  fileName: z.string().max(200),
}).superRefine((b, ctx) => {
  const lim = MEDIA_LIMITS[b.type];
  if (!(lim.mimeTypes as readonly string[]).includes(b.mimeType)) ctx.addIssue({ code: 'custom', path: ['mimeType'], message: 'Formato de arquivo não suportado' });
  if (b.sizeBytes > lim.maxBytes) ctx.addIssue({ code: 'custom', path: ['sizeBytes'], message: `Arquivo maior que ${lim.maxBytes / 1024 / 1024} MB` });
});
export type UploadUrlBody = z.infer<typeof UploadUrlBody>;
export const UploadUrlResponse = z.object({
  mediaId: Id,
  /** Fazer PUT do arquivo cru nesta URL com header Content-Type = mimeType. */
  uploadUrl: z.string(),
  expiresInSec: z.number().int(),
});
export type UploadUrlResponse = z.infer<typeof UploadUrlResponse>;
/** POST /media/:id/complete → Media (status PROCESSING; enfileira o worker). GET /media/:id → Media. */

// =====================================================================
// MESAS E PLACAS (painel)
// =====================================================================
export const TableStatus = z.enum(['FREE', 'OCCUPIED', 'PENDING_ORDER', 'CALLING', 'BILL']);
export type TableStatus = z.infer<typeof TableStatus>;
export const Table = TableRef.extend({
  active: z.boolean(),
  tag: z.object({ code: z.string(), status: TagStatus }).nullable(),
  /** Estado para o mapa de mesas (RF-12). */
  status: TableStatus,
  session: z.object({ id: Id, openedAt: IsoDate, totalCents: Cents }).nullable(),
});
export type Table = z.infer<typeof Table>;
export const CreateTableBody = z.object({ name: z.string().trim().min(1).max(40), area: optionalText(40) });
export type CreateTableBody = z.infer<typeof CreateTableBody>;
export const UpdateTableBody = CreateTableBody.partial().extend({ active: z.boolean().optional() });
export type UpdateTableBody = z.infer<typeof UpdateTableBody>;
/** POST /tables/bulk — "Mesa 1".."Mesa 20". Nomes que já existem são pulados. */
export const BulkTablesBody = z.object({
  prefix: z.string().trim().min(1).max(30).default('Mesa'),
  from: z.number().int().min(0).max(999),
  to: z.number().int().min(0).max(999),
  area: optionalText(40),
}).refine((b) => b.to >= b.from && b.to - b.from < 200, { message: 'Intervalo inválido (máx. 200 mesas)', path: ['to'] });
export type BulkTablesBody = z.infer<typeof BulkTablesBody>;
export const BulkTablesResponse = z.object({ created: z.array(Table), skipped: z.array(z.string()) });
export type BulkTablesResponse = z.infer<typeof BulkTablesResponse>;

export const Tag = z.object({
  code: z.string(),
  status: TagStatus,
  table: TableRef.nullable(),
  activatedAt: IsoDate.nullable(),
  lastReadAt: IsoDate.nullable(),
});
export type Tag = z.infer<typeof Tag>;
/**
 * POST /tags/link — placa do próprio restaurante (ou sem dono) → ACTIVE na mesa. Troca a placa anterior da mesa.
 * Se a placa já está ativa em OUTRA mesa: 409 CONFLICT com `details.table` (TableRef); reenvie com `confirm: true` para mover.
 */
export const LinkTagBody = z.object({ code: TagCode, tableId: Id, confirm: z.boolean().optional() });
export type LinkTagBody = z.infer<typeof LinkTagBody>;

/** POST /sessions/:id/close → { id, status: CLOSED } */
export const CloseSessionResponse = z.object({ id: Id, status: SessionStatus });
export type CloseSessionResponse = z.infer<typeof CloseSessionResponse>;

// =====================================================================
// OPERAÇÃO (painel)
// =====================================================================
/** GET /orders?status=PENDING,CONFIRMED&sessionId=... */
export const ListOrdersQuery = z.object({
  status: z.string().optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(z.array(OrderStatus).optional()),
  sessionId: Id.optional(),
  tableId: Id.optional(),
  sector: Sector.optional(),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuery>;
/** PATCH /orders/:id/status — respeita ORDER_TRANSITIONS; REJECTED exige motivo. */
export const UpdateOrderStatusBody = z.object({
  status: OrderStatus.exclude(['PENDING']),
  reason: z.string().trim().min(1).max(140).optional(),
}).refine((b) => b.status !== 'REJECTED' || !!b.reason, { message: 'Informe o motivo da recusa', path: ['reason'] });
export type UpdateOrderStatusBody = z.infer<typeof UpdateOrderStatusBody>;

/** GET /calls?status=OPEN */
export const ListCallsQuery = z.object({ status: CallStatus.optional() });
export type ListCallsQuery = z.infer<typeof ListCallsQuery>;

// =====================================================================
// EQUIPE E CONFIGURAÇÕES (painel)
// =====================================================================
export const StaffUser = z.object({
  id: Id, name: z.string(), email: z.string(), role: Role, sector: Sector.nullable(),
  active: z.boolean(), lastLoginAt: IsoDate.nullable(),
  /** Convite ainda não aceito (usuário sem senha): pendente ou expirado. null = já tem senha. */
  invite: z.enum(['PENDING', 'EXPIRED']).nullable(),
});
export type StaffUser = z.infer<typeof StaffUser>;
export const CreateUserBody = z.object({
  name: z.string().trim().min(1).max(80),
  email: z.email('E-mail inválido').trim().toLowerCase(),
  role: StaffRole,
  /** Setor da cozinha/bar (só KITCHEN). */
  sector: Sector.nullish(),
  /** Sem senha = convite por e-mail (a pessoa define a senha pelo link, válido por 7 dias). */
  password: NewPassword.optional(),
});
export type CreateUserBody = z.infer<typeof CreateUserBody>;
export const UpdateUserBody = CreateUserBody.omit({ email: true }).partial().extend({ active: z.boolean().optional() });
export type UpdateUserBody = z.infer<typeof UpdateUserBody>;

export const Settings = z.object({
  id: Id,
  slug: z.string(),
  name: z.string(),
  logoUrl: z.string().nullable(),
  accentColor: z.string().nullable(),
  plan: Plan,
  status: RestStatus,
  requireConfirmation: z.boolean(),
  soundEnabled: z.boolean(),
  timezone: z.string(),
  openingHours: OpeningHours.nullable(),
  wifiName: z.string().nullable(),
  wifiPassword: z.string().nullable(),
  instagram: z.string().nullable(),
  googleReviewUrl: z.string().nullable(),
});
export type Settings = z.infer<typeof Settings>;
export const UpdateSettingsBody = z.object({
  name: z.string().trim().min(1).max(80),
  logoUrl: z.url().nullable(),
  accentColor: HexColor.nullable(),
  requireConfirmation: z.boolean(),
  soundEnabled: z.boolean(),
  openingHours: OpeningHours.nullable(),
  wifiName: optionalText(64),
  wifiPassword: optionalText(64),
  instagram: optionalText(60),
  googleReviewUrl: z.url().nullable(),
}).partial();
export type UpdateSettingsBody = z.infer<typeof UpdateSettingsBody>;

/** POST /push/subscribe — PushSubscription.toJSON() do navegador. Resposta 204. */
export const PushSubscribeBody = z.object({
  endpoint: z.url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});
export type PushSubscribeBody = z.infer<typeof PushSubscribeBody>;
/** GET /push/vapid-public-key — applicationServerKey para pushManager.subscribe (null = push desligado no servidor). */
export const VapidPublicKeyResponse = z.object({ publicKey: z.string().nullable() });
export type VapidPublicKeyResponse = z.infer<typeof VapidPublicKeyResponse>;
/** POST /push/apns-device — token APNs (hex) do app iOS, para push nativo. Resposta 204. */
export const ApnsDeviceBody = z.object({ token: z.string().regex(/^[0-9a-fA-F]{64,200}$/) });
export type ApnsDeviceBody = z.infer<typeof ApnsDeviceBody>;

// =====================================================================
// ADMIN GARFEED (SUPERADMIN)
// =====================================================================
export const AdminRestaurant = z.object({
  id: Id, slug: z.string(), name: z.string(), plan: Plan, status: RestStatus, createdAt: IsoDate,
  tableCount: z.number().int(), activeTagCount: z.number().int(), ordersToday: z.number().int(),
});
export type AdminRestaurant = z.infer<typeof AdminRestaurant>;
export const CreateRestaurantBody = z.object({
  name: z.string().trim().min(1).max(80),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/, 'Use letras minúsculas, números e hífen').max(60),
  plan: Plan.default('ESSENTIAL'),
  status: RestStatus.default('TRIAL'),
  /** Primeiro usuário (OWNER). */
  owner: CreateUserBody.pick({ name: true, email: true, password: true }),
});
export type CreateRestaurantBody = z.infer<typeof CreateRestaurantBody>;
export const UpdateRestaurantBody = z.object({ name: z.string().trim().min(1).max(80), plan: Plan, status: RestStatus }).partial();
export type UpdateRestaurantBody = z.infer<typeof UpdateRestaurantBody>;

export const TagBatch = z.object({
  batch: z.string(),
  createdAt: IsoDate,
  restaurant: z.object({ id: Id, name: z.string() }).nullable(),
  total: z.number().int(),
  unassigned: z.number().int(),
  active: z.number().int(),
  blocked: z.number().int(),
});
export type TagBatch = z.infer<typeof TagBatch>;
export const CreateTagBatchBody = z.object({
  quantity: z.number().int().min(1).max(1000),
  /** Pré-atribui as placas a um restaurante (continuam UNASSIGNED até o vínculo). */
  restaurantId: Id.optional(),
});
export type CreateTagBatchBody = z.infer<typeof CreateTagBatchBody>;
export const CreateTagBatchResponse = z.object({ batch: z.string(), codes: z.array(z.string()) });
export type CreateTagBatchResponse = z.infer<typeof CreateTagBatchResponse>;
export const BatchParams = z.object({ batch: z.string().min(1).max(64) });
export type BatchParams = z.infer<typeof BatchParams>;

export const AdminStats = z.object({ activeRestaurants: z.number().int(), ordersToday: z.number().int(), activeTags: z.number().int() });
export type AdminStats = z.infer<typeof AdminStats>;

// =====================================================================
// COBRANÇA DA ASSINATURA DO RESTAURANTE (Asaas) — docs/COBRANCA.md
// =====================================================================
import { BillingCycle, BillingStatus } from './enums'; // import no bloco: mantém a seção contígua
/** Data sem hora, AAAA-MM-DD. */
export const DateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Data inválida (AAAA-MM-DD)');
/** CPF (11 dígitos) ou CNPJ (14; alfanumérico desde 2026), sem pontuação. */
export const CpfCnpj = z.string().transform((v) => v.replace(/[\s./-]/g, '').toUpperCase())
  .pipe(z.string().regex(/^(\d{11}|[0-9A-Z]{12}\d{2})$/, 'CPF ou CNPJ inválido'));
export const BillingCustomerBody = z.object({
  cpfCnpj: CpfCnpj,
  email: z.email('E-mail inválido').trim().toLowerCase().max(254).nullish(),
  /** DDD + número, só dígitos. */
  phone: z.string().transform((v) => v.replace(/\D/g, '')).pipe(z.string().regex(/^\d{10,11}$/, 'Telefone inválido (DDD + número)')).nullish(),
});
export type BillingCustomerBody = z.infer<typeof BillingCustomerBody>;
/** Trocar plano/ciclo/valor. `valueCents` = valor de CADA cobrança do ciclo; omitido = tabela (planValueCents); obrigatório no plano Rede. */
export const BillingSubscriptionBody = z.object({
  plan: Plan,
  cycle: BillingCycle,
  valueCents: z.number().int().min(500, 'Valor mínimo: R$ 5,00').max(10_000_000).optional(),
});
export type BillingSubscriptionBody = z.infer<typeof BillingSubscriptionBody>;
/** Ativar assinatura. `nextDueDate` = 1º vencimento (padrão: hoje + 3 dias). */
export const ActivateSubscriptionBody = BillingSubscriptionBody.extend({ nextDueDate: DateOnly.optional() });
export type ActivateSubscriptionBody = z.infer<typeof ActivateSubscriptionBody>;

/** Planos que o próprio dono assina/troca (valor sempre da tabela; Rede é sob consulta → só o admin). */
export const OwnerPlanBody = z.object({ plan: Plan.exclude(['NETWORK'], 'O plano Rede é sob consulta: fale com a gente'), cycle: BillingCycle });
export type OwnerPlanBody = z.infer<typeof OwnerPlanBody>;
/** POST /settings/billing/subscription — dados de cobrança + plano. Qualquer outro campo (ex.: valor) é descartado. */
export const OwnerSubscribeBody = BillingCustomerBody.extend(OwnerPlanBody.shape);
export type OwnerSubscribeBody = z.infer<typeof OwnerSubscribeBody>;

export const BillingInfo = z.object({
  cpfCnpj: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  /** Tem assinatura ativa no Asaas. */
  subscribed: z.boolean(),
  cycle: BillingCycle,
  valueCents: z.number().int().nullable(),
  /** Vencimento da fatura em aberto mais antiga; sem fatura em aberto = próxima cobrança da assinatura. */
  nextDueDate: DateOnly.nullable(),
  status: BillingStatus,
});
export type BillingInfo = z.infer<typeof BillingInfo>;
export const BillingPayment = z.object({
  id: Id,
  valueCents: z.number().int(),
  dueDate: DateOnly,
  /** Status da cobrança no Asaas (PENDING, CONFIRMED, RECEIVED, OVERDUE, REFUNDED...) ou DELETED. */
  status: z.string(),
  invoiceUrl: z.string().nullable(),
  paidAt: DateOnly.nullable(),
});
export type BillingPayment = z.infer<typeof BillingPayment>;
export const AdminBilling = z.object({
  restaurantId: Id, name: z.string(), slug: z.string(), plan: Plan, status: RestStatus, createdAt: IsoDate,
  /** TRIAL há mais de TRIAL_DAYS dias (só sinaliza; quem decide suspender é o admin). */
  trialExpired: z.boolean(),
  billing: BillingInfo.nullable(),
});
export type AdminBilling = z.infer<typeof AdminBilling>;
export const AdminBillingDetail = AdminBilling.extend({ payments: z.array(BillingPayment) });
export type AdminBillingDetail = z.infer<typeof AdminBillingDetail>;
/** `enabled: false` = ASAAS_API_KEY não configurada (cobrança desligada). */
export const AdminBillingList = z.object({ enabled: z.boolean(), restaurants: z.array(AdminBilling) });
export type AdminBillingList = z.infer<typeof AdminBillingList>;
/** GET /settings/billing — card "Plano atual" do dono. */
export const OwnerBilling = z.object({
  plan: Plan,
  status: RestStatus,
  billingStatus: BillingStatus,
  cycle: BillingCycle.nullable(),
  valueCents: z.number().int().nullable(),
  nextDueDate: DateOnly.nullable(),
  /** Fatura em aberto mais antiga (página de pagamento do Asaas: Pix, boleto ou cartão). */
  openInvoiceUrl: z.string().nullable(),
  payments: z.array(BillingPayment),
  /** Fim do teste grátis (criação + TRIAL_DAYS) enquanto o restaurante está em TRIAL; senão null. */
  trialEndsAt: IsoDate.nullable(),
  /** Tem assinatura ativa no Asaas. */
  subscribed: z.boolean(),
  /** Dados de cobrança já informados (para preencher o formulário). */
  customer: BillingCustomerBody.nullable(),
});
export type OwnerBilling = z.infer<typeof OwnerBilling>;

/** Datas do Asaas chegam como AAAA-MM-DD (cobrança) ou DD/MM/AAAA (assinatura). */
const AsaasDate = z.string().transform((v) => v.replace(/^(\d{2})\/(\d{2})\/(\d{4})$/, '$3-$2-$1').slice(0, 10)).pipe(DateOnly);
/** POST /webhooks/asaas — só os campos usados; o Asaas pode acrescentar outros. Valores em reais (decimal). */
export const AsaasWebhookBody = z.object({
  id: z.string().min(1).max(200),
  event: z.string().min(1).max(100),
  payment: z.object({
    id: z.string().min(1).max(100),
    customer: z.string().min(1).max(100),
    subscription: z.string().max(100).nullish(),
    value: z.number().min(0).max(100_000),
    dueDate: AsaasDate,
    status: z.string().min(1).max(50),
    invoiceUrl: z.string().max(500).nullish(),
    confirmedDate: AsaasDate.nullish(),
    paymentDate: AsaasDate.nullish(),
    clientPaymentDate: AsaasDate.nullish(),
    deleted: z.boolean().nullish(),
  }).optional(),
  subscription: z.object({
    id: z.string().min(1).max(100),
    customer: z.string().min(1).max(100),
    nextDueDate: AsaasDate.nullish(),
  }).optional(),
});
export type AsaasWebhookBody = z.infer<typeof AsaasWebhookBody>;
export const AsaasWebhookResponse = z.object({ received: z.literal(true), ignored: z.boolean().optional(), duplicate: z.boolean().optional() });
export type AsaasWebhookResponse = z.infer<typeof AsaasWebhookResponse>;
