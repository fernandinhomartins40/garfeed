// Artes de placa (editor) e códigos "só QR" para mesas sem placa.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import type { SavePlateDesignBody } from '@garfeed/shared';
import { prisma } from '../src/lib/prisma';
import { app, bearer, dropRestaurants, joinTable, makeRestaurant, type Fixture } from './helpers';

let a: Fixture;
let b: Fixture;
let ownerA = '';
let ownerB = '';
const created: string[] = [];

const design: SavePlateDesignBody = {
  name: 'Adesivo 8 cm', widthMm: 80, heightMm: 80,
  doc: {
    background: '#FFFFFF',
    elements: [
      { id: 'q', type: 'qr', x: 15, y: 20, width: 50, height: 50, rotation: 0, opacity: 1, fg: '#142433', bg: '#FFFFFF' },
      { id: 't', type: 'text', x: 5, y: 5, width: 70, height: 10, rotation: 0, opacity: 1, text: '{mesa}', fontFamily: 'Nunito', fontSize: 8, fontWeight: '900', fill: '#142433', align: 'center' },
      { id: 'r', type: 'rect', x: 0, y: 0, width: 80, height: 80, rotation: 0, opacity: 1, fill: null, stroke: '#FE581D', strokeWidth: 1, cornerRadius: 4 },
    ],
  },
};

beforeAll(async () => {
  a = await makeRestaurant();
  b = await makeRestaurant();
  ownerA = await a.token('OWNER');
  ownerB = await b.token('OWNER');
});

afterAll(async () => {
  await prisma.tag.deleteMany({ where: { code: { in: created } } });
  await dropRestaurants(a.r.id, b.r.id);
  await prisma.$disconnect();
});

describe('artes de placa', () => {
  it('cria, lê, edita, lista e apaga', async () => {
    const c = await request(app).post('/plate-designs').set(bearer(ownerA)).send(design);
    expect(c.status).toBe(201);
    expect(c.body.doc.elements).toHaveLength(3);
    const id = c.body.id as string;

    const u = await request(app).put(`/plate-designs/${id}`).set(bearer(ownerA)).send({ ...design, name: 'Display A6', widthMm: 105, heightMm: 148 });
    expect(u.status).toBe(200);
    expect(u.body).toMatchObject({ name: 'Display A6', widthMm: 105, heightMm: 148 });

    const list = await request(app).get('/plate-designs').set(bearer(ownerA));
    expect(list.body.map((d: { id: string }) => d.id)).toEqual([id]);
    expect(list.body[0].doc).toBeUndefined(); // listagem leve, sem imagens

    expect((await request(app).delete(`/plate-designs/${id}`).set(bearer(ownerA))).status).toBe(204);
    expect((await request(app).get(`/plate-designs/${id}`).set(bearer(ownerA))).status).toBe(404);
  });

  it('valida o documento (cor, tipo e imagem)', async () => {
    const bad = (doc: unknown) => request(app).post('/plate-designs').set(bearer(ownerA)).send({ ...design, doc });
    expect((await bad({ background: 'red', elements: [] })).status).toBe(400);
    expect((await bad({ background: '#FFFFFF', elements: [{ ...design.doc.elements[0], type: 'video' }] })).status).toBe(400);
    expect((await bad({ background: '#FFFFFF', elements: [{ id: 'i', type: 'image', x: 0, y: 0, width: 10, height: 10, rotation: 0, opacity: 1, src: 'https://x.com/a.png' }] })).status).toBe(400);
  });

  it('isolamento: B não lê, não edita e não apaga a arte de A', async () => {
    const id = (await request(app).post('/plate-designs').set(bearer(ownerA)).send(design)).body.id as string;
    expect((await request(app).get(`/plate-designs/${id}`).set(bearer(ownerB))).status).toBe(404);
    expect((await request(app).put(`/plate-designs/${id}`).set(bearer(ownerB)).send({ ...design, name: 'invadido' })).status).toBe(404);
    expect((await request(app).delete(`/plate-designs/${id}`).set(bearer(ownerB))).status).toBe(404);
    expect((await request(app).get('/plate-designs').set(bearer(ownerB))).body).toEqual([]);
    expect((await prisma.plateDesign.findUniqueOrThrow({ where: { id } })).name).toBe(design.name);
  });

  it('garçom não acessa (só dono e gerente)', async () => {
    const waiter = await a.token('WAITER');
    expect((await request(app).get('/plate-designs').set(bearer(waiter))).status).toBe(403);
  });
});

describe('códigos só QR para mesas sem placa', () => {
  it('cria código para a mesa sem placa, mantém o das que têm, e o QR abre a mesa', async () => {
    const nova = await prisma.table.create({ data: { restaurantId: a.r.id, name: 'Mesa QR' } });
    const ids = [nova.id, a.tables[0]!.id];
    const res = await request(app).post('/tags/ensure-codes').set(bearer(ownerA)).send({ tableIds: ids });
    expect(res.status).toBe(200);
    const byTable = new Map(res.body.map((t: { table: { id: string }; code: string; status: string }) => [t.table.id, t]));
    expect(byTable.get(a.tables[0]!.id)).toMatchObject({ code: a.codes[0] });
    const qr = byTable.get(nova.id) as { code: string; status: string };
    expect(qr.status).toBe('ACTIVE');
    created.push(qr.code);

    // idempotente: chamar de novo não troca o código
    const again = await request(app).post('/tags/ensure-codes').set(bearer(ownerA)).send({ tableIds: [nova.id] });
    expect(again.body[0].code).toBe(qr.code);

    const { res: join } = await joinTable(qr.code);
    expect(join.status).toBe(200);
    expect(join.body.table.id).toBe(nova.id);
  });

  it('isolamento: não gera código para mesa de outro restaurante', async () => {
    const res = await request(app).post('/tags/ensure-codes').set(bearer(ownerA)).send({ tableIds: [b.tables[0]!.id] });
    expect(res.status).toBe(404);
  });
});
