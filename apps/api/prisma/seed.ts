// Seed idempotente: restaurante demo "Brasa & Pão Hamburgueria". Senha de todos: SEED_PASSWORD (.env).
import { PrismaClient, type Role, type Sector } from '@prisma/client';
import argon2 from 'argon2';

const prisma = new PrismaClient();
const password = process.env.SEED_PASSWORD ?? (process.env.NODE_ENV === 'production' ? '' : 'garfeed123');
if (password.length < 8) throw new Error('Defina SEED_PASSWORD (mín. 8 caracteres) para rodar o seed em produção');

async function main() {
  const passwordHash = await argon2.hash(password);

  const r = await prisma.restaurant.upsert({
    where: { slug: 'brasa-e-pao' },
    update: {},
    create: {
      slug: 'brasa-e-pao',
      name: 'Brasa & Pão Hamburgueria',
      accentColor: '#FE581D',
      plan: 'PRO',
      status: 'ACTIVE',
      wifiName: 'BrasaPao_Clientes',
      wifiPassword: 'brasa2026',
      instagram: '@brasaepao',
      openingHours: Object.fromEntries(
        ['tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map((d) => [d, [['11:00', '15:00'], ['18:00', '23:00']]]),
      ),
    },
  });

  const users: { email: string; name: string; role: Role; restaurantId: string | null; sector?: Sector }[] = [
    { email: 'admin@garfeed.com.br', name: 'Admin Garfeed', role: 'SUPERADMIN', restaurantId: null },
    { email: 'carlos@brasaepao.com.br', name: 'Carlos', role: 'OWNER', restaurantId: r.id },
    { email: 'gerente@brasaepao.com.br', name: 'Marina', role: 'MANAGER', restaurantId: r.id },
    { email: 'julia@brasaepao.com.br', name: 'Júlia', role: 'WAITER', restaurantId: r.id },
    { email: 'cozinha@brasaepao.com.br', name: 'Cozinha', role: 'KITCHEN', restaurantId: r.id, sector: 'KITCHEN' },
    { email: 'bar@brasaepao.com.br', name: 'Bar', role: 'KITCHEN', restaurantId: r.id, sector: 'BAR' },
  ];
  for (const u of users) {
    await prisma.user.upsert({ where: { email: u.email }, update: { passwordHash }, create: { ...u, passwordHash } });
  }

  // Cardápio só é criado uma vez (não sobrescreve edições feitas no painel).
  if (!(await prisma.category.count({ where: { restaurantId: r.id } }))) {
    const cat = async (name: string, position: number, sector: Sector = 'KITCHEN') =>
      prisma.category.create({ data: { restaurantId: r.id, name, position, sector } });
    const destaques = await cat('Destaques', 0);
    const lanches = await cat('Lanches', 1);
    const porcoes = await cat('Porções', 2);
    const bebidas = await cat('Bebidas', 3, 'BAR');
    const sobremesas = await cat('Sobremesas', 4);

    const ponto = await prisma.optionGroup.create({
      data: {
        restaurantId: r.id, name: 'Ponto da carne', min: 1, max: 1,
        options: { create: [{ name: 'Ao ponto', position: 0 }, { name: 'Bem passado', position: 1 }] },
      },
    });
    const adicionais = await prisma.optionGroup.create({
      data: {
        restaurantId: r.id, name: 'Adicionais', min: 0, max: 3,
        options: {
          create: [
            { name: 'Bacon', priceCents: 500, position: 0 },
            { name: 'Ovo', priceCents: 300, position: 1 },
            { name: 'Cheddar extra', priceCents: 400, position: 2 },
          ],
        },
      },
    });

    const items = [
      { categoryId: destaques.id, name: 'Smash Duplo Cheddar', description: 'Dois smashs de 90g, cheddar inglês, cebola caramelizada, pão brioche', priceCents: 3290, badges: ['MOST_ORDERED'], groups: [ponto.id, adicionais.id] },
      { categoryId: lanches.id, name: 'Smash Clássico', description: 'Smash de 90g, queijo prato, alface, tomate e molho da casa no pão brioche', priceCents: 2690, badges: [], groups: [ponto.id, adicionais.id] },
      { categoryId: porcoes.id, name: 'Batata Rústica com Bacon', description: 'Batatas rústicas crocantes com bacon e cheddar cremoso', priceCents: 2490, badges: [], groups: [] },
      { categoryId: bebidas.id, name: 'Milkshake de Doce de Leite', description: 'Sorvete de creme batido com doce de leite artesanal', priceCents: 1990, badges: ['NEW'], groups: [] },
      { categoryId: bebidas.id, name: 'Chopp Pilsen 500ml', description: 'Chopp pilsen gelado, colarinho cremoso', priceCents: 1490, badges: [], groups: [] },
      { categoryId: sobremesas.id, name: 'Brownie com Sorvete', description: 'Brownie de chocolate meio amargo com bola de sorvete de creme', priceCents: 1890, badges: [], groups: [], soldOut: true },
    ];
    for (const [i, { groups, ...it }] of items.entries()) {
      await prisma.item.create({
        data: {
          ...it, restaurantId: r.id, position: i,
          optionGroups: { create: groups.map((groupId, position) => ({ groupId, position })) },
        },
      });
    }
  }

  // 20 mesas + placas GF0001..GF0020 vinculadas; GF0021..GF0025 soltas (3 pré-atribuídas ao restaurante).
  for (let n = 1; n <= 20; n++) {
    const table = await prisma.table.upsert({
      where: { restaurantId_name: { restaurantId: r.id, name: `Mesa ${n}` } },
      update: {},
      create: { restaurantId: r.id, name: `Mesa ${n}`, area: n <= 14 ? 'Salão' : 'Varanda' },
    });
    const code = `GF${String(n).padStart(4, '0')}`;
    await prisma.tag.upsert({
      where: { code },
      update: {},
      create: { code, status: 'ACTIVE', restaurantId: r.id, tableId: table.id, batch: 'DEMO', activatedAt: new Date() },
    });
  }
  for (let n = 21; n <= 25; n++) {
    const code = `GF${String(n).padStart(4, '0')}`;
    await prisma.tag.upsert({ where: { code }, update: {}, create: { code, batch: 'DEMO', restaurantId: n <= 23 ? r.id : null } });
  }

  console.log(`Seed ok: ${r.name} (slug ${r.slug}). Senha de todos os usuários: ${password}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
