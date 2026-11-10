import { randomBytes } from 'node:crypto';
import { Router } from 'express';
import argon2 from 'argon2';
import {
  BatchParams, CreateRestaurantBody, CreateTagBatchBody, generateTagCodes, IdParams, tagUrl, UpdateRestaurantBody,
  type AdminRestaurant, type AdminStats, type TagBatch,
} from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { env } from '../../lib/env';
import { AppError, notFound } from '../../lib/errors';
import { localDay } from '../../lib/restaurant';
import { menuChanged } from '../../lib/menuCache';
import { validate } from '../../middleware/validate';

/** /admin/* (SUPERADMIN). Sem tenantId: o super admin enxerga todos os restaurantes. */
export const router = Router();

// shortcut: "hoje" no fuso de São Paulo para todos; separar por timezone do restaurante quando houver clientes fora do BRT
const today = () => localDay('America/Sao_Paulo');

const restaurantSelect = () => ({
  _count: { select: { tables: true, tags: { where: { status: 'ACTIVE' as const } }, orders: { where: { day: today() } } } },
});
const toAdminRestaurant = (r: { id: string; slug: string; name: string; plan: AdminRestaurant['plan']; status: AdminRestaurant['status']; createdAt: Date; _count: { tables: number; tags: number; orders: number } }): AdminRestaurant => ({
  id: r.id, slug: r.slug, name: r.name, plan: r.plan, status: r.status, createdAt: r.createdAt.toISOString(),
  tableCount: r._count.tables, activeTagCount: r._count.tags, ordersToday: r._count.orders,
});

router.get('/stats', async (_req, res) => {
  const [activeRestaurants, ordersToday, activeTags] = await Promise.all([
    prisma.restaurant.count({ where: { status: { not: 'SUSPENDED' } } }),
    prisma.order.count({ where: { day: today() } }),
    prisma.tag.count({ where: { status: 'ACTIVE' } }),
  ]);
  const body: AdminStats = { activeRestaurants, ordersToday, activeTags };
  res.json(body);
});

router.get('/restaurants', async (_req, res) => {
  const rows = await prisma.restaurant.findMany({ orderBy: { createdAt: 'desc' }, include: restaurantSelect() });
  res.json(rows.map(toAdminRestaurant));
});

router.post('/restaurants', validate({ body: CreateRestaurantBody }), async (req, res) => {
  const { owner, ...b } = req.body as CreateRestaurantBody;
  if (await prisma.restaurant.count({ where: { slug: b.slug } })) throw new AppError('CONFLICT', 'Este endereço (slug) já está em uso');
  if (await prisma.user.count({ where: { email: owner.email } })) throw new AppError('CONFLICT', 'Este e-mail já está cadastrado');
  const r = await prisma.restaurant.create({
    data: { ...b, users: { create: { name: owner.name, email: owner.email, role: 'OWNER', passwordHash: await argon2.hash(owner.password) } } },
    include: restaurantSelect(),
  });
  res.status(201).json(toAdminRestaurant(r));
});

router.patch('/restaurants/:id', validate({ params: IdParams, body: UpdateRestaurantBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  if (!(await prisma.restaurant.count({ where: { id } }))) throw notFound('Restaurante');
  const r = await prisma.restaurant.update({ where: { id }, data: req.body as UpdateRestaurantBody, include: restaurantSelect() });
  await menuChanged(id); // status SUSPENDED muda canOrder no cardápio público
  res.json(toAdminRestaurant(r));
});

// ---------- Lotes de placas ----------
router.get('/tag-batches', async (_req, res) => {
  const groups = await prisma.tag.groupBy({ by: ['batch', 'status', 'restaurantId'], where: { batch: { not: null } }, _count: true, _min: { createdAt: true } });
  const batches = new Map<string, Omit<TagBatch, 'restaurant'> & { restaurantIds: Set<string | null> }>();
  for (const g of groups) {
    const b = batches.get(g.batch!) ?? { batch: g.batch!, createdAt: g._min.createdAt!.toISOString(), total: 0, unassigned: 0, active: 0, blocked: 0, restaurantIds: new Set() };
    b.total += g._count;
    b[g.status === 'UNASSIGNED' ? 'unassigned' : g.status === 'ACTIVE' ? 'active' : 'blocked'] += g._count;
    if (g._min.createdAt!.toISOString() < b.createdAt) b.createdAt = g._min.createdAt!.toISOString();
    b.restaurantIds.add(g.restaurantId);
    batches.set(g.batch!, b);
  }
  // restaurante do lote = o único dono comum a todas as placas (pré-atribuição); misto → null
  const ids = [...batches.values()].flatMap((b) => (b.restaurantIds.size === 1 ? [...b.restaurantIds].filter((x): x is string => !!x) : []));
  const names = new Map((await prisma.restaurant.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((r) => [r.id, r]));
  const out: TagBatch[] = [...batches.values()].map(({ restaurantIds, ...b }) => {
    const only = restaurantIds.size === 1 ? [...restaurantIds][0] : null;
    return { ...b, restaurant: (only && names.get(only)) || null };
  });
  res.json(out.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
});

router.post('/tag-batches', validate({ body: CreateTagBatchBody }), async (req, res) => {
  const { quantity, restaurantId } = req.body as CreateTagBatchBody;
  if (restaurantId && !(await prisma.restaurant.count({ where: { id: restaurantId } }))) throw notFound('Restaurante');
  const batch = `L${today().replace(/-/g, '')}-${randomBytes(2).toString('hex').toUpperCase()}`;
  // códigos já usados (raro) são ignorados pelo skipDuplicates e repostos na volta seguinte
  for (let tries = 0; tries < 20; tries++) {
    const have = await prisma.tag.count({ where: { batch } });
    if (have >= quantity) break;
    const codes = generateTagCodes(quantity - have);
    await prisma.tag.createMany({ data: codes.map((code) => ({ code, batch, restaurantId: restaurantId ?? null })), skipDuplicates: true });
  }
  const tags = await prisma.tag.findMany({ where: { batch }, select: { code: true }, orderBy: { code: 'asc' } });
  if (tags.length < quantity) throw new AppError('INTERNAL', 'Não foi possível gerar códigos únicos suficientes');
  res.status(201).json({ batch, codes: tags.map((t) => t.code) });
});

router.get('/tag-batches/:batch/csv', validate({ params: BatchParams }), async (req, res) => {
  const { batch } = req.params as BatchParams;
  const tags = await prisma.tag.findMany({ where: { batch }, select: { code: true }, orderBy: { code: 'asc' } });
  if (!tags.length) throw notFound('Lote');
  const csv = ['codigo,url', ...tags.map((t) => `${t.code},${tagUrl(env.TAG_BASE_URL, t.code)}`)].join('\n') + '\n';
  res.type('text/csv; charset=utf-8').attachment(`placas-${batch}.csv`).send(csv);
});
