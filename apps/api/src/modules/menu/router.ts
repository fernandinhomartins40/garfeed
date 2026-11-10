import { Router, type Request } from 'express';
import type { Prisma } from '@prisma/client';
import {
  CreateCategoryBody, CreateItemBody, IdParams, ImportCsvBody, LIMITS, ListItemsQuery, menuCacheKey, ReorderBody,
  SlugParams, SoldOutBody, UpdateCategoryBody, UpdateItemBody, UpsertOptionGroupBody,
  type Badge, type Category, type ImportCsvResponse, type Item, type OptionGroupWithUsage, type PublicMenuResponse,
} from '@garfeed/shared';
import { prisma } from '../../lib/prisma';
import { redis } from '../../lib/redis';
import { AppError, notFound } from '../../lib/errors';
import { tenantId } from '../../lib/auth';
import { menuChanged } from '../../lib/menuCache';
import { toPublicRestaurant } from '../../lib/restaurant';
import { toMedia } from '../../lib/views';
import { validate } from '../../middleware/validate';

/** /menu/* (OWNER, MANAGER). Contrato: api.menu em @garfeed/shared. */
export const router = Router();
/** /public/restaurants/:slug/menu — cache Redis 60 s, invalidado em toda edição (menuChanged). */
export const publicRouter = Router();

const toCategory = (c: { id: string; name: string; position: number; sector: Category['sector']; visible: boolean; _count: { items: number } }): Category => ({
  id: c.id, name: c.name, position: c.position, sector: c.sector, visible: c.visible, itemCount: c._count.items,
});
const withCount = { _count: { select: { items: true } } } as const;

const itemInclude = { media: true, optionGroups: { orderBy: { position: 'asc' } } } satisfies Prisma.ItemInclude;
type ItemRow = Prisma.ItemGetPayload<{ include: typeof itemInclude }>;
const toItem = (i: ItemRow): Item => ({
  id: i.id, categoryId: i.categoryId, name: i.name, description: i.description, priceCents: i.priceCents,
  promoPriceCents: i.promoPriceCents, badges: i.badges as Badge[], position: i.position, visible: i.visible,
  soldOut: i.soldOut, media: i.media && toMedia(i.media), optionGroupIds: i.optionGroups.map((g) => g.groupId),
});

const groupInclude = { options: { orderBy: { position: 'asc' } }, _count: { select: { items: true } } } satisfies Prisma.OptionGroupInclude;
type GroupRow = Prisma.OptionGroupGetPayload<{ include: typeof groupInclude }>;
const toGroup = (g: GroupRow): OptionGroupWithUsage => ({
  id: g.id, name: g.name, min: g.min, max: g.max, itemCount: g._count.items,
  options: g.options.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, position: o.position })),
});

// ---------- Público ----------
publicRouter.get('/restaurants/:slug/menu', validate({ params: SlugParams }), async (req, res) => {
  const restaurant = await prisma.restaurant.findUnique({ where: { slug: (req.params as SlugParams).slug } });
  if (!restaurant) throw notFound('Restaurante');
  const key = menuCacheKey(restaurant.id);
  const cached = await redis.get(key);
  // shortcut: isOpen/canOrder no cache podem ficar até 60 s defasados na virada do horário; o pedido revalida no servidor
  if (cached) return res.type('application/json').send(cached);

  const categories = await prisma.category.findMany({
    where: { restaurantId: restaurant.id, visible: true },
    orderBy: { position: 'asc' },
    include: {
      items: {
        where: { visible: true },
        orderBy: { position: 'asc' },
        include: { media: true, optionGroups: { orderBy: { position: 'asc' }, include: { group: { include: { options: { orderBy: { position: 'asc' } } } } } } },
      },
    },
  });
  const body: PublicMenuResponse = {
    restaurant: toPublicRestaurant(restaurant),
    categories: categories.filter((c) => c.items.length).map((c) => ({
      id: c.id, name: c.name, position: c.position, sector: c.sector,
      items: c.items.map((i) => ({
        id: i.id, categoryId: i.categoryId, name: i.name, description: i.description, priceCents: i.priceCents,
        promoPriceCents: i.promoPriceCents, badges: i.badges as Badge[], soldOut: i.soldOut, position: i.position,
        media: i.media?.status === 'READY'
          ? { id: i.media.id, type: i.media.type, url: i.media.url, posterUrl: i.media.posterUrl, thumbUrl: i.media.thumbUrl, width: i.media.width, height: i.media.height, durationMs: i.media.durationMs }
          : null,
        optionGroups: i.optionGroups.map(({ group: g }) => ({
          id: g.id, name: g.name, min: g.min, max: g.max,
          options: g.options.map((o) => ({ id: o.id, name: o.name, priceCents: o.priceCents, position: o.position })),
        })),
      })),
    })),
  };
  const json = JSON.stringify(body);
  await redis.set(key, json, 'EX', LIMITS.menuCacheSec);
  res.type('application/json').send(json);
});

// ---------- Categorias ----------
// Padrão multi-tenant: restaurantId sempre de tenantId(req).
const listCategories = (restaurantId: string) =>
  prisma.category.findMany({ where: { restaurantId }, orderBy: { position: 'asc' }, include: withCount });

router.get('/categories', async (req, res) => {
  res.json((await listCategories(tenantId(req))).map(toCategory));
});

router.post('/categories', validate({ body: CreateCategoryBody }), async (req, res) => {
  const rid = tenantId(req);
  const last = await prisma.category.aggregate({ where: { restaurantId: rid }, _max: { position: true } });
  const row = await prisma.category.create({
    data: { ...(req.body as CreateCategoryBody), restaurantId: rid, position: (last._max.position ?? -1) + 1 },
    include: withCount,
  });
  await menuChanged(rid);
  res.status(201).json(toCategory(row));
});

router.put('/categories/order', validate({ body: ReorderBody }), async (req, res) => {
  const rid = tenantId(req);
  const { ids } = req.body as ReorderBody;
  const count = await prisma.category.count({ where: { id: { in: ids }, restaurantId: rid } });
  if (new Set(ids).size !== ids.length || count !== ids.length) throw new AppError('VALIDATION', 'Lista de categorias inválida');
  await prisma.$transaction(ids.map((id, position) => prisma.category.updateMany({ where: { id, restaurantId: rid }, data: { position } })));
  await menuChanged(rid);
  res.json((await listCategories(rid)).map(toCategory));
});

router.patch('/categories/:id', validate({ params: IdParams, body: UpdateCategoryBody }), async (req, res) => {
  const { id } = req.params as IdParams;
  const rid = tenantId(req);
  // updateMany com restaurantId no where: nunca altera registro de outro tenant; count 0 → 404
  const { count } = await prisma.category.updateMany({ where: { id, restaurantId: rid }, data: req.body as UpdateCategoryBody });
  if (!count) throw notFound('Categoria');
  const row = await prisma.category.findUniqueOrThrow({ where: { id }, include: withCount });
  await menuChanged(rid);
  res.json(toCategory(row));
});

router.delete('/categories/:id', validate({ params: IdParams }), async (req, res) => {
  const rid = tenantId(req);
  const cat = await prisma.category.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: rid }, include: withCount });
  if (!cat) throw notFound('Categoria');
  if (cat._count.items) throw new AppError('CONFLICT', 'Mova ou exclua os itens da categoria antes de excluí-la');
  await prisma.category.delete({ where: { id: cat.id } });
  await menuChanged(rid);
  res.status(204).end();
});

// ---------- Itens ----------
/** Garante que categoria, mídia e grupos referenciados são do mesmo restaurante. */
async function checkRefs(rid: string, b: UpdateItemBody) {
  if (b.categoryId && !(await prisma.category.count({ where: { id: b.categoryId, restaurantId: rid } }))) throw notFound('Categoria');
  if (b.mediaId && !(await prisma.media.count({ where: { id: b.mediaId, restaurantId: rid } }))) throw notFound('Mídia');
  if (b.optionGroupIds?.length) {
    const ids = [...new Set(b.optionGroupIds)];
    if (ids.length !== b.optionGroupIds.length) throw new AppError('VALIDATION', 'Grupo de opcionais repetido');
    if ((await prisma.optionGroup.count({ where: { id: { in: ids }, restaurantId: rid } })) !== ids.length) throw notFound('Grupo de opcionais');
  }
}

const findItem = async (req: Request) => {
  const item = await prisma.item.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: tenantId(req) }, include: itemInclude });
  if (!item) throw notFound('Item');
  return item;
};

router.get('/items', validate({ query: ListItemsQuery }), async (req, res) => {
  const { categoryId } = req.query as ListItemsQuery;
  const rows = await prisma.item.findMany({
    where: { restaurantId: tenantId(req), categoryId },
    orderBy: [{ category: { position: 'asc' } }, { position: 'asc' }],
    include: itemInclude,
  });
  res.json(rows.map(toItem));
});

router.get('/items/:id', validate({ params: IdParams }), async (req, res) => {
  res.json(toItem(await findItem(req)));
});

router.post('/items', validate({ body: CreateItemBody }), async (req, res) => {
  const rid = tenantId(req);
  const { optionGroupIds, ...b } = req.body as CreateItemBody;
  await checkRefs(rid, req.body as CreateItemBody);
  const last = await prisma.item.aggregate({ where: { categoryId: b.categoryId }, _max: { position: true } });
  const row = await prisma.item.create({
    data: {
      ...b, restaurantId: rid, position: (last._max.position ?? -1) + 1,
      optionGroups: { create: optionGroupIds.map((groupId, position) => ({ groupId, position })) },
    },
    include: itemInclude,
  });
  await menuChanged(rid);
  res.status(201).json(toItem(row));
});

router.put('/items/order', validate({ body: ReorderBody }), async (req, res) => {
  const rid = tenantId(req);
  const { ids } = req.body as ReorderBody;
  const rows = await prisma.item.findMany({ where: { id: { in: ids }, restaurantId: rid }, select: { categoryId: true } });
  if (rows.length !== ids.length || new Set(rows.map((r) => r.categoryId)).size !== 1) {
    throw new AppError('VALIDATION', 'Envie os itens de uma única categoria');
  }
  await prisma.$transaction(ids.map((id, position) => prisma.item.updateMany({ where: { id, restaurantId: rid }, data: { position } })));
  await menuChanged(rid);
  const items = await prisma.item.findMany({ where: { restaurantId: rid, categoryId: rows[0]!.categoryId }, orderBy: { position: 'asc' }, include: itemInclude });
  res.json(items.map(toItem));
});

router.patch('/items/:id', validate({ params: IdParams, body: UpdateItemBody }), async (req, res) => {
  const rid = tenantId(req);
  const item = await findItem(req);
  const { optionGroupIds, ...b } = req.body as UpdateItemBody;
  await checkRefs(rid, req.body as UpdateItemBody);
  const row = await prisma.$transaction(async (tx) => {
    if (optionGroupIds) {
      await tx.itemOptionGroup.deleteMany({ where: { itemId: item.id } });
      await tx.itemOptionGroup.createMany({ data: optionGroupIds.map((groupId, position) => ({ itemId: item.id, groupId, position })) });
    }
    return tx.item.update({ where: { id: item.id }, data: b, include: itemInclude });
  });
  await menuChanged(rid, b.soldOut !== undefined && Object.keys(b).length === 1 ? { itemId: item.id, soldOut: b.soldOut } : {});
  res.json(toItem(row));
});

router.delete('/items/:id', validate({ params: IdParams }), async (req, res) => {
  const item = await findItem(req);
  if (await prisma.orderItem.count({ where: { itemId: item.id } })) {
    throw new AppError('CONFLICT', 'Este item já foi pedido; oculte-o em vez de excluir');
  }
  await prisma.item.delete({ where: { id: item.id } });
  await menuChanged(item.restaurantId);
  res.status(204).end();
});

/** Toggle de 1 toque: clientes com o feed aberto recebem menu:updated {itemId, soldOut} na hora. */
router.patch('/items/:id/sold-out', validate({ params: IdParams, body: SoldOutBody }), async (req, res) => {
  const item = await findItem(req);
  const { soldOut } = req.body as SoldOutBody;
  const row = await prisma.item.update({ where: { id: item.id }, data: { soldOut }, include: itemInclude });
  await menuChanged(item.restaurantId, { itemId: item.id, soldOut });
  res.json(toItem(row));
});

// ---------- Grupos de opcionais ----------
router.get('/option-groups', async (req, res) => {
  const rows = await prisma.optionGroup.findMany({ where: { restaurantId: tenantId(req) }, orderBy: { name: 'asc' }, include: groupInclude });
  res.json(rows.map(toGroup));
});

const optionsCreate = (b: UpsertOptionGroupBody) => b.options.map((o, position) => ({ ...o, position }));

router.post('/option-groups', validate({ body: UpsertOptionGroupBody }), async (req, res) => {
  const rid = tenantId(req);
  const b = req.body as UpsertOptionGroupBody;
  const row = await prisma.optionGroup.create({
    data: { restaurantId: rid, name: b.name, min: b.min, max: b.max, options: { create: optionsCreate(b) } },
    include: groupInclude,
  });
  res.status(201).json(toGroup(row));
});

const findGroup = async (req: Request) => {
  const g = await prisma.optionGroup.findFirst({ where: { id: (req.params as IdParams).id, restaurantId: tenantId(req) } });
  if (!g) throw notFound('Grupo de opcionais');
  return g;
};

/** Substitui as opções; pedidos antigos não mudam (guardam snapshot). */
router.put('/option-groups/:id', validate({ params: IdParams, body: UpsertOptionGroupBody }), async (req, res) => {
  const g = await findGroup(req);
  const b = req.body as UpsertOptionGroupBody;
  const row = await prisma.$transaction(async (tx) => {
    await tx.option.deleteMany({ where: { groupId: g.id } });
    return tx.optionGroup.update({
      where: { id: g.id },
      data: { name: b.name, min: b.min, max: b.max, options: { create: optionsCreate(b) } },
      include: groupInclude,
    });
  });
  await menuChanged(g.restaurantId);
  res.json(toGroup(row));
});

router.delete('/option-groups/:id', validate({ params: IdParams }), async (req, res) => {
  const g = await findGroup(req);
  await prisma.optionGroup.delete({ where: { id: g.id } });
  await menuChanged(g.restaurantId);
  res.status(204).end();
});

// ---------- Importar CSV ----------
/** Linhas → campos; aspas duplas com "" escapado. Delimitador ";" (Excel pt-BR) ou ",". */
export function parseCsv(text: string): string[][] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const delim = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; } else if (ch === '"') quoted = false; else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field || row.length) { row.push(field); rows.push(row); }
  return rows;
}

/** "32,90" · "32.90" · "R$ 1.032,90" → centavos; inválido → null. */
export function parsePriceCents(raw: string): number | null {
  let s = raw.replace(/R\$|\s/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s) * 100);
}

router.post('/import-csv', validate({ body: ImportCsvBody }), async (req, res) => {
  const rid = tenantId(req);
  const rows = parseCsv((req.body as ImportCsvBody).csv);
  const out: ImportCsvResponse = { categoriesCreated: 0, itemsCreated: 0, errors: [] };
  const cats = new Map((await prisma.category.findMany({ where: { restaurantId: rid } })).map((c) => [c.name.toLowerCase(), c.id]));
  let catPos = (await prisma.category.aggregate({ where: { restaurantId: rid }, _max: { position: true } }))._max.position ?? -1;

  for (const [i, cols] of rows.entries()) {
    const line = i + 1;
    const [categoria = '', nome = '', descricao = '', preco = ''] = cols.map((c) => c.trim());
    if (!cols.some((c) => c.trim())) continue;
    if (i === 0 && categoria.toLowerCase() === 'categoria') continue; // cabeçalho
    if (!categoria || categoria.length > 40) { out.errors.push({ line, message: 'Categoria vazia ou com mais de 40 caracteres' }); continue; }
    if (!nome || nome.length > 80) { out.errors.push({ line, message: 'Nome vazio ou com mais de 80 caracteres' }); continue; }
    if (descricao.length > 300) { out.errors.push({ line, message: 'Descrição com mais de 300 caracteres' }); continue; }
    const priceCents = parsePriceCents(preco);
    if (priceCents === null || priceCents > 10_000_000) { out.errors.push({ line, message: `Preço inválido: "${preco}"` }); continue; }

    let categoryId = cats.get(categoria.toLowerCase());
    if (!categoryId) {
      categoryId = (await prisma.category.create({ data: { restaurantId: rid, name: categoria, position: ++catPos } })).id;
      cats.set(categoria.toLowerCase(), categoryId);
      out.categoriesCreated++;
    }
    const last = await prisma.item.aggregate({ where: { categoryId }, _max: { position: true } });
    await prisma.item.create({
      data: { restaurantId: rid, categoryId, name: nome, description: descricao || null, priceCents, position: (last._max.position ?? -1) + 1 },
    });
    out.itemsCreated++;
  }
  if (out.itemsCreated || out.categoriesCreated) await menuChanged(rid);
  res.json(out);
});
