// Marca própria (logo e cores) só nos planos com o recurso: Pro, Rede e teste grátis.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { prisma } from '../src/lib/prisma';
import { app, bearer, dropRestaurants, makeRestaurant, type Fixture } from './helpers';

const brand = { accentColor: '#1D4ED8', darkColor: '#1E1B4B', logoUrl: 'http://localhost:9000/garfeed-media/x/logo/image.webp' };
let essential: Fixture, pro: Fixture, trial: Fixture;

beforeAll(async () => {
  essential = await makeRestaurant({ plan: 'ESSENTIAL', status: 'ACTIVE', ...brand });
  pro = await makeRestaurant({ plan: 'PRO', status: 'ACTIVE', ...brand });
  trial = await makeRestaurant({ plan: 'ESSENTIAL', status: 'TRIAL', ...brand });
});
afterAll(async () => {
  await dropRestaurants(essential.r.id, pro.r.id, trial.r.id);
  await prisma.$disconnect();
});

const publicBrand = async (f: Fixture) => (await request(app).get(`/public/tags/${f.codes[0]}`)).body.restaurant;

describe('marca própria no cardápio', () => {
  it('Essencial: cardápio com as cores e o logo do Garfeed (dados salvos não somem)', async () => {
    expect(await publicBrand(essential)).toMatchObject({ accentColor: null, darkColor: null, whiteLabel: false });
    const owner = await essential.token('OWNER');
    expect((await request(app).get('/settings').set(bearer(owner))).body).toMatchObject({ accentColor: brand.accentColor, darkColor: brand.darkColor });
  });

  it('Pro e teste grátis: cores e logo do restaurante', async () => {
    for (const f of [pro, trial]) expect(await publicBrand(f)).toMatchObject({ accentColor: brand.accentColor, darkColor: brand.darkColor, whiteLabel: true });
  });

  it('cor escura clara demais é recusada (texto ficaria ilegível)', async () => {
    const owner = await pro.token('OWNER');
    expect((await request(app).patch('/settings').set(bearer(owner)).send({ darkColor: '#FFE066' })).status).toBe(400);
    expect((await request(app).patch('/settings').set(bearer(owner)).send({ darkColor: '#14213D' })).body.darkColor).toBe('#14213D');
  });

  it('kit da marca do editor de plaquinhas segue o plano', async () => {
    const e = (await request(app).get('/plate-designs/brand').set(bearer(await essential.token('OWNER')))).body;
    expect(e).toMatchObject({ enabled: false, accent: null, dark: null, logo: null });
    const p = (await request(app).get('/plate-designs/brand').set(bearer(await pro.token('OWNER')))).body;
    expect(p).toMatchObject({ enabled: true, accent: brand.accentColor });
  });
});
