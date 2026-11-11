// Tabela única de rotas da API: método, caminho, quem acessa e schemas de entrada/saída.
// `response: null` = 204 sem corpo. Erros seguem sempre ErrorResponse.
import { z } from 'zod';
import type { Role } from './enums';
import * as s from './schemas';

type Auth = 'none' | 'guest' | 'jwt';
type Route = {
  method: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  path: string;
  /** none = livre · guest = cookie guestToken · jwt = Authorization: Bearer */
  auth: Auth;
  roles?: readonly Role[];
  params?: z.ZodType;
  query?: z.ZodType;
  body?: z.ZodType;
  response: z.ZodType | null;
};
const r = <T extends Route>(route: T) => route;

export const ROLES = {
  ADMIN: ['SUPERADMIN'],
  OWNER: ['OWNER'],
  /** cardápio, mesas, placas */
  MANAGE: ['OWNER', 'MANAGER'],
  /** operação: pedidos, chamados, fechar mesa */
  OPERATE: ['OWNER', 'MANAGER', 'WAITER'],
  /** KITCHEN só vê/avança pedidos do seu setor */
  STAFF: ['OWNER', 'MANAGER', 'WAITER', 'KITCHEN'],
} as const satisfies Record<string, readonly Role[]>;

export const api = {
  public: {
    resolveTag: r({ method: 'GET', path: '/public/tags/:code', auth: 'none', params: s.CodeParams, response: s.TagResolveResponse }),
    joinSession: r({ method: 'POST', path: '/public/tags/:code/session', auth: 'none', params: s.CodeParams, response: s.SessionJoinResponse }),
    menu: r({ method: 'GET', path: '/public/restaurants/:slug/menu', auth: 'none', params: s.SlugParams, response: s.PublicMenuResponse }),
    createOrder: r({ method: 'POST', path: '/public/orders', auth: 'guest', body: s.CreateOrderBody, response: s.CreateOrderResponse }),
    sessionMe: r({ method: 'GET', path: '/public/sessions/me', auth: 'guest', response: s.SessionMeResponse }),
    createCall: r({ method: 'POST', path: '/public/calls', auth: 'guest', body: s.CreateCallBody, response: s.CreateCallResponse }),
    events: r({ method: 'POST', path: '/public/events', auth: 'guest', body: s.EventsBody, response: null }),
  },
  auth: {
    login: r({ method: 'POST', path: '/auth/login', auth: 'none', body: s.LoginBody, response: s.AuthResponse }),
    /** Usa o cookie httpOnly de refresh (rotacionado a cada chamada). */
    refresh: r({ method: 'POST', path: '/auth/refresh', auth: 'none', response: s.AuthResponse }),
    logout: r({ method: 'POST', path: '/auth/logout', auth: 'none', response: null }),
    /** Sempre 204 (não revela se o e-mail existe). Envia o link de redefinição (1 h, uso único). */
    forgotPassword: r({ method: 'POST', path: '/auth/forgot-password', auth: 'none', body: s.ForgotPasswordBody, response: null }),
    /** Valida o token do link (POST para o token não ir para logs de URL). */
    checkPasswordToken: r({ method: 'POST', path: '/auth/password-token', auth: 'none', body: s.PasswordTokenBody, response: s.PasswordTokenInfo }),
    /** Define a senha com o token de recuperação ou de convite e derruba as sessões abertas. */
    resetPassword: r({ method: 'POST', path: '/auth/reset-password', auth: 'none', body: s.ResetPasswordBody, response: null }),
  },
  menu: {
    listCategories: r({ method: 'GET', path: '/menu/categories', auth: 'jwt', roles: ROLES.MANAGE, response: z.array(s.Category) }),
    createCategory: r({ method: 'POST', path: '/menu/categories', auth: 'jwt', roles: ROLES.MANAGE, body: s.CreateCategoryBody, response: s.Category }),
    updateCategory: r({ method: 'PATCH', path: '/menu/categories/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, body: s.UpdateCategoryBody, response: s.Category }),
    deleteCategory: r({ method: 'DELETE', path: '/menu/categories/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: null }),
    reorderCategories: r({ method: 'PUT', path: '/menu/categories/order', auth: 'jwt', roles: ROLES.MANAGE, body: s.ReorderBody, response: z.array(s.Category) }),
    listItems: r({ method: 'GET', path: '/menu/items', auth: 'jwt', roles: ROLES.MANAGE, query: s.ListItemsQuery, response: z.array(s.Item) }),
    getItem: r({ method: 'GET', path: '/menu/items/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: s.Item }),
    createItem: r({ method: 'POST', path: '/menu/items', auth: 'jwt', roles: ROLES.MANAGE, body: s.CreateItemBody, response: s.Item }),
    updateItem: r({ method: 'PATCH', path: '/menu/items/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, body: s.UpdateItemBody, response: s.Item }),
    deleteItem: r({ method: 'DELETE', path: '/menu/items/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: null }),
    /** ids dos itens de UMA categoria, na nova ordem. */
    reorderItems: r({ method: 'PUT', path: '/menu/items/order', auth: 'jwt', roles: ROLES.MANAGE, body: s.ReorderBody, response: z.array(s.Item) }),
    setSoldOut: r({ method: 'PATCH', path: '/menu/items/:id/sold-out', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, body: s.SoldOutBody, response: s.Item }),
    listOptionGroups: r({ method: 'GET', path: '/menu/option-groups', auth: 'jwt', roles: ROLES.MANAGE, response: z.array(s.OptionGroupWithUsage) }),
    createOptionGroup: r({ method: 'POST', path: '/menu/option-groups', auth: 'jwt', roles: ROLES.MANAGE, body: s.UpsertOptionGroupBody, response: s.OptionGroupWithUsage }),
    updateOptionGroup: r({ method: 'PUT', path: '/menu/option-groups/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, body: s.UpsertOptionGroupBody, response: s.OptionGroupWithUsage }),
    deleteOptionGroup: r({ method: 'DELETE', path: '/menu/option-groups/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: null }),
    importCsv: r({ method: 'POST', path: '/menu/import-csv', auth: 'jwt', roles: ROLES.MANAGE, body: s.ImportCsvBody, response: s.ImportCsvResponse }),
  },
  media: {
    uploadUrl: r({ method: 'POST', path: '/media/upload-url', auth: 'jwt', roles: ROLES.MANAGE, body: s.UploadUrlBody, response: s.UploadUrlResponse }),
    complete: r({ method: 'POST', path: '/media/:id/complete', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: s.Media }),
    get: r({ method: 'GET', path: '/media/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: s.Media }),
  },
  tables: {
    list: r({ method: 'GET', path: '/tables', auth: 'jwt', roles: ROLES.OPERATE, response: z.array(s.Table) }),
    create: r({ method: 'POST', path: '/tables', auth: 'jwt', roles: ROLES.MANAGE, body: s.CreateTableBody, response: s.Table }),
    bulk: r({ method: 'POST', path: '/tables/bulk', auth: 'jwt', roles: ROLES.MANAGE, body: s.BulkTablesBody, response: s.BulkTablesResponse }),
    update: r({ method: 'PATCH', path: '/tables/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, body: s.UpdateTableBody, response: s.Table }),
    delete: r({ method: 'DELETE', path: '/tables/:id', auth: 'jwt', roles: ROLES.MANAGE, params: s.IdParams, response: null }),
  },
  tags: {
    list: r({ method: 'GET', path: '/tags', auth: 'jwt', roles: ROLES.MANAGE, response: z.array(s.Tag) }),
    /** Consulta antes de vincular ("Placa GF7K2P encontrada"). 404 se for de outro restaurante. */
    get: r({ method: 'GET', path: '/tags/:code', auth: 'jwt', roles: ROLES.MANAGE, params: s.CodeParams, response: s.Tag }),
    link: r({ method: 'POST', path: '/tags/link', auth: 'jwt', roles: ROLES.MANAGE, body: s.LinkTagBody, response: s.Tag }),
    unlink: r({ method: 'POST', path: '/tags/:code/unlink', auth: 'jwt', roles: ROLES.MANAGE, params: s.CodeParams, response: s.Tag }),
    block: r({ method: 'POST', path: '/tags/:code/block', auth: 'jwt', roles: ROLES.MANAGE, params: s.CodeParams, response: s.Tag }),
  },
  sessions: {
    close: r({ method: 'POST', path: '/sessions/:id/close', auth: 'jwt', roles: ROLES.OPERATE, params: s.IdParams, response: s.CloseSessionResponse }),
  },
  orders: {
    list: r({ method: 'GET', path: '/orders', auth: 'jwt', roles: ROLES.STAFF, query: s.ListOrdersQuery, response: z.array(s.PanelOrder) }),
    updateStatus: r({ method: 'PATCH', path: '/orders/:id/status', auth: 'jwt', roles: ROLES.STAFF, params: s.IdParams, body: s.UpdateOrderStatusBody, response: s.PanelOrder }),
  },
  calls: {
    list: r({ method: 'GET', path: '/calls', auth: 'jwt', roles: ROLES.OPERATE, query: s.ListCallsQuery, response: z.array(s.PanelCall) }),
    done: r({ method: 'POST', path: '/calls/:id/done', auth: 'jwt', roles: ROLES.OPERATE, params: s.IdParams, response: s.PanelCall }),
  },
  users: {
    list: r({ method: 'GET', path: '/users', auth: 'jwt', roles: ROLES.OWNER, response: z.array(s.StaffUser) }),
    create: r({ method: 'POST', path: '/users', auth: 'jwt', roles: ROLES.OWNER, body: s.CreateUserBody, response: s.StaffUser }),
    update: r({ method: 'PATCH', path: '/users/:id', auth: 'jwt', roles: ROLES.OWNER, params: s.IdParams, body: s.UpdateUserBody, response: s.StaffUser }),
    /** Reenvia o convite (novo link de 7 dias; o anterior deixa de valer). Só para quem ainda não definiu senha. */
    resendInvite: r({ method: 'POST', path: '/users/:id/invite', auth: 'jwt', roles: ROLES.OWNER, params: s.IdParams, response: s.StaffUser }),
    /** Cancela o convite: remove o usuário que ainda não definiu senha. */
    cancelInvite: r({ method: 'DELETE', path: '/users/:id/invite', auth: 'jwt', roles: ROLES.OWNER, params: s.IdParams, response: null }),
  },
  settings: {
    get: r({ method: 'GET', path: '/settings', auth: 'jwt', roles: ROLES.OWNER, response: s.Settings }),
    update: r({ method: 'PATCH', path: '/settings', auth: 'jwt', roles: ROLES.OWNER, body: s.UpdateSettingsBody, response: s.Settings }),
  },
  push: {
    subscribe: r({ method: 'POST', path: '/push/subscribe', auth: 'jwt', roles: ROLES.STAFF, body: s.PushSubscribeBody, response: null }),
    vapidPublicKey: r({ method: 'GET', path: '/push/vapid-public-key', auth: 'jwt', roles: ROLES.STAFF, response: s.VapidPublicKeyResponse }),
  },
  admin: {
    stats: r({ method: 'GET', path: '/admin/stats', auth: 'jwt', roles: ROLES.ADMIN, response: s.AdminStats }),
    listRestaurants: r({ method: 'GET', path: '/admin/restaurants', auth: 'jwt', roles: ROLES.ADMIN, response: z.array(s.AdminRestaurant) }),
    createRestaurant: r({ method: 'POST', path: '/admin/restaurants', auth: 'jwt', roles: ROLES.ADMIN, body: s.CreateRestaurantBody, response: s.AdminRestaurant }),
    updateRestaurant: r({ method: 'PATCH', path: '/admin/restaurants/:id', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, body: s.UpdateRestaurantBody, response: s.AdminRestaurant }),
    listTagBatches: r({ method: 'GET', path: '/admin/tag-batches', auth: 'jwt', roles: ROLES.ADMIN, response: z.array(s.TagBatch) }),
    createTagBatch: r({ method: 'POST', path: '/admin/tag-batches', auth: 'jwt', roles: ROLES.ADMIN, body: s.CreateTagBatchBody, response: s.CreateTagBatchResponse }),
    /** text/csv com colunas codigo,url (para a gráfica). */
    /** Envia o e-mail de teste para o próprio superadmin logado. */
    testEmail: r({ method: 'POST', path: '/admin/test-email', auth: 'jwt', roles: ROLES.ADMIN, response: null }),
    tagBatchCsv: r({ method: 'GET', path: '/admin/tag-batches/:batch/csv', auth: 'jwt', roles: ROLES.ADMIN, params: s.BatchParams, response: z.string() }),
  },
  /** Cobrança da assinatura do restaurante pelo Asaas (docs/COBRANCA.md). */
  billing: {
    /** Card "Plano atual" do dono: restaurantId sempre do token. */
    mine: r({ method: 'GET', path: '/settings/billing', auth: 'jwt', roles: ROLES.OWNER, response: s.OwnerBilling }),
    adminList: r({ method: 'GET', path: '/admin/billing', auth: 'jwt', roles: ROLES.ADMIN, response: s.AdminBillingList }),
    adminGet: r({ method: 'GET', path: '/admin/billing/:id', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, response: s.AdminBillingDetail }),
    /** CPF/CNPJ e contato de cobrança (também atualiza o cliente no Asaas, se já existir). */
    setCustomer: r({ method: 'PUT', path: '/admin/billing/:id/customer', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, body: s.BillingCustomerBody, response: s.AdminBillingDetail }),
    /** Cria cliente + assinatura no Asaas (o pagador escolhe Pix, boleto ou cartão). */
    activate: r({ method: 'POST', path: '/admin/billing/:id/subscription', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, body: s.ActivateSubscriptionBody, response: s.AdminBillingDetail }),
    change: r({ method: 'PATCH', path: '/admin/billing/:id/subscription', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, body: s.BillingSubscriptionBody, response: s.AdminBillingDetail }),
    cancel: r({ method: 'DELETE', path: '/admin/billing/:id/subscription', auth: 'jwt', roles: ROLES.ADMIN, params: s.IdParams, response: s.AdminBillingDetail }),
    /** Chamado pelo Asaas. Autenticado pelo header asaas-access-token (ASAAS_WEBHOOK_TOKEN). */
    webhook: r({ method: 'POST', path: '/webhooks/asaas', auth: 'none', body: s.AsaasWebhookBody, response: s.AsaasWebhookResponse }),
  },
} as const;

/** "/menu/items/:id" + { id: "x" } → "/menu/items/x" */
export const buildPath = (path: string, params: Record<string, string> = {}) =>
  path.replace(/:(\w+)/g, (_, k: string) => encodeURIComponent(params[k] ?? ''));

/** Nomes dos cookies httpOnly emitidos pela API. */
export const COOKIES = { guest: 'gf_guest', refresh: 'gf_refresh' } as const;

/** Limites de negócio (PRD RF-02, RF-09, anti-trote). */
export const LIMITS = {
  guestTokenHours: 6,
  sessionIdleHours: 3,
  callCooldownSec: 60,
  ordersPerSessionPerHour: 10,
  accessTokenMinutes: 15,
  passwordResetMinutes: 60,
  inviteDays: 7,
  menuCacheSec: 60,
} as const;
