// MODELO de teste de isolamento multi-tenant: copie este padrão para cada módulo novo.
// Cria um restaurante B isolado, loga como dono de A e prova que não lê nem altera dados de B.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import { createApp } from '../src/app';
import { prisma } from '../src/lib/prisma';

const app = createApp();
const suffix = Date.now().toString(36);
const password = 'senha-teste-123';
let tokenA = '';
let tokenWaiterA = '';
let categoryB = '';
let restaurantA = '';
let restaurantB = '';

const login = async (email: string) => (await request(app).post('/auth/login').send({ email, password })).body.accessToken as string;

beforeAll(async () => {
  const passwordHash = await argon2.hash(password);
  const make = async (tag: string) => prisma.restaurant.create({
    data: {
      slug: `teste-${tag}-${suffix}`,
      name: `Teste ${tag}`,
      users: {
        create: [
          { name: `Dono ${tag}`, email: `dono-${tag}-${suffix}@teste.dev`, role: 'OWNER', passwordHash },
          { name: `Garçom ${tag}`, email: `garcom-${tag}-${suffix}@teste.dev`, role: 'WAITER', passwordHash },
        ],
      },
      categories: { create: [{ name: `Categoria ${tag}`, position: 0 }] },
    },
    include: { categories: true },
  });
  const a = await make('a');
  const b = await make('b');
  restaurantA = a.id;
  restaurantB = b.id;
  categoryB = b.categories[0]!.id;
  tokenA = await login(`dono-a-${suffix}@teste.dev`);
  tokenWaiterA = await login(`garcom-a-${suffix}@teste.dev`);
});

afterAll(async () => {
  await prisma.restaurant.deleteMany({ where: { id: { in: [restaurantA, restaurantB] } } });
  await prisma.$disconnect();
});

describe('isolamento multi-tenant', () => {
  it('listagem só traz dados do próprio restaurante', async () => {
    const res = await request(app).get('/menu/categories').auth(tokenA, { type: 'bearer' });
    expect(res.status).toBe(200);
    expect(res.body.map((c: { name: string }) => c.name)).toEqual(['Categoria a']);
  });

  it('alterar registro de outro restaurante → 404 e nada muda', async () => {
    const res = await request(app).patch(`/menu/categories/${categoryB}`).auth(tokenA, { type: 'bearer' }).send({ name: 'invadido' });
    expect(res.status).toBe(404);
    expect((await prisma.category.findUniqueOrThrow({ where: { id: categoryB } })).name).toBe('Categoria b');
  });

  it('WAITER não acessa cardápio (403)', async () => {
    expect((await request(app).get('/menu/categories').auth(tokenWaiterA, { type: 'bearer' })).status).toBe(403);
  });
});
