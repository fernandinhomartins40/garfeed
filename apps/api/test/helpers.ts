// Fixtures dos testes: restaurante isolado com equipe de todos os papéis, cardápio, mesas e placas.
import request from 'supertest';
import argon2 from 'argon2';
import { COOKIES, generateTagCode, type Role, type Sector } from '@garfeed/shared';
import type { Prisma } from '@prisma/client';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

export const app = createApp();
export const password = 'senha-teste-123';
const hash = argon2.hash(password);
let seq = 0;

export const login = async (email: string) => {
  const res = await request(app).post('/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login falhou: ${email}`);
  return res.body.accessToken as string;
};

const ROLES_TO_MAKE: [Role, Sector | null][] = [['OWNER', null], ['MANAGER', null], ['WAITER', null], ['KITCHEN', 'KITCHEN'], ['KITCHEN', 'BAR']];

export async function makeRestaurant(data: Partial<Prisma.RestaurantCreateInput> = {}) {
  const tag = `${Date.now().toString(36)}-${++seq}-${Math.random().toString(36).slice(2, 6)}`;
  const passwordHash = await hash;
  const r = await prisma.restaurant.create({
    data: {
      slug: `t-${tag}`, name: `Teste ${tag}`, status: 'ACTIVE', ...data,
      users: { create: ROLES_TO_MAKE.map(([role, sector]) => ({ role, sector, name: `${role} ${sector ?? ''}`, email: `${role}-${sector ?? 'x'}-${tag}@teste.dev`.toLowerCase(), passwordHash })) },
    },
  });
  const lanches = await prisma.category.create({ data: { restaurantId: r.id, name: 'Lanches', position: 0 } });
  const bebidas = await prisma.category.create({ data: { restaurantId: r.id, name: 'Bebidas', position: 1, sector: 'BAR' } });
  const ponto = await prisma.optionGroup.create({
    data: { restaurantId: r.id, name: 'Ponto', min: 1, max: 1, options: { create: [{ name: 'Ao ponto', position: 0 }, { name: 'Bem passado', position: 1 }] } },
    include: { options: true },
  });
  const adicionais = await prisma.optionGroup.create({
    data: { restaurantId: r.id, name: 'Adicionais', min: 0, max: 2, options: { create: [{ name: 'Bacon', priceCents: 500, position: 0 }, { name: 'Ovo', priceCents: 300, position: 1 }, { name: 'Queijo', priceCents: 400, position: 2 }] } },
    include: { options: true },
  });
  const burger = await prisma.item.create({
    data: { restaurantId: r.id, categoryId: lanches.id, name: 'Burger', priceCents: 3000, position: 0, optionGroups: { create: [{ groupId: ponto.id, position: 0 }, { groupId: adicionais.id, position: 1 }] } },
  });
  const chopp = await prisma.item.create({ data: { restaurantId: r.id, categoryId: bebidas.id, name: 'Chopp', priceCents: 1500, promoPriceCents: 1200, position: 0 } });
  const brownie = await prisma.item.create({ data: { restaurantId: r.id, categoryId: lanches.id, name: 'Brownie', priceCents: 1800, position: 1, soldOut: true } });
  const tables = await Promise.all([1, 2, 3].map((n) => prisma.table.create({ data: { restaurantId: r.id, name: `Mesa ${n}` } })));
  const codes: string[] = [];
  for (const t of tables) {
    const code = await freeCode();
    await prisma.tag.create({ data: { code, status: 'ACTIVE', restaurantId: r.id, tableId: t.id, activatedAt: new Date() } });
    codes.push(code);
  }
  const email = (role: Role, sector: Sector | null = null) => `${role}-${sector ?? 'x'}-${tag}@teste.dev`.toLowerCase();
  return {
    r, lanches, bebidas, ponto, adicionais, burger, chopp, brownie, tables, codes,
    token: (role: Role, sector: Sector | null = role === 'KITCHEN' ? 'KITCHEN' : null) => login(email(role, sector)),
  };
}
export type Fixture = Awaited<ReturnType<typeof makeRestaurant>>;

export async function freeCode() {
  for (;;) {
    const code = generateTagCode();
    if (!(await prisma.tag.count({ where: { code } }))) return code;
  }
}

/** Entra na mesa como um celular; devolve o cookie gf_guest. */
export async function joinTable(code: string, cookie?: string) {
  const req = request(app).post(`/public/tags/${code}/session`);
  const res = await (cookie ? req.set('Cookie', cookie) : req);
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return { res, cookie: raw?.find((c) => c.startsWith(`${COOKIES.guest}=`))?.split(';')[0] ?? '' };
}

// OrderItem → Item é Restrict (histórico protegido): apaga pedidos antes do cascade do restaurante
export const dropRestaurants = (...ids: string[]) => prisma.$transaction([
  prisma.order.deleteMany({ where: { restaurantId: { in: ids } } }),
  prisma.restaurant.deleteMany({ where: { id: { in: ids } } }),
]);

export const bearer = (t: string) => ({ Authorization: `Bearer ${t}` });
