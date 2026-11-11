// Recuperação de senha, convite de equipe e avisos por e-mail. O transporte do mailer é trocado por um falso que captura as mensagens.
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import type { StaffUser } from '@garfeed/shared';
import { hashToken } from '../src/lib/auth';
import { transport, type Mail } from '../src/lib/mailer';
import { prisma } from '../src/lib/prisma';
import { redis } from '../src/lib/redis';
import { app, bearer, dropRestaurants, makeRestaurant, password, type Fixture } from './helpers';

const outbox: Mail[] = [];
vi.spyOn(transport, 'deliver').mockImplementation(async (m) => { outbox.push(m); });

const tokenOf = (m: Mail) => new URL(/https?:\/\/\S+token=\S+/.exec(m.text)![0]).searchParams.get('token')!;
const to = (email: string) => outbox.filter((m) => m.to === email);
const loginStatus = async (email: string, pwd: string) => (await request(app).post('/auth/login').send({ email, password: pwd })).status;
const expire = (token: string) => prisma.userToken.update({ where: { tokenHash: hashToken(token) }, data: { expiresAt: new Date(Date.now() - 1000) } });
const NEW = 'nova-senha-456';

let a: Fixture, b: Fixture;
let ownerA: string, ownerB: string;
let staff: StaffUser[];
const emailOf = (role: string) => staff.find((u) => u.role === role)!.email;

beforeAll(async () => {
  [a, b] = await Promise.all([makeRestaurant(), makeRestaurant()]);
  [ownerA, ownerB] = await Promise.all([a.token('OWNER'), b.token('OWNER')]);
  staff = (await request(app).get('/users').set(bearer(ownerA))).body as StaffUser[];
});
beforeEach(async () => {
  outbox.length = 0;
  const keys = await redis.keys('rl:*'); // zera os rate limits entre os casos
  if (keys.length) await redis.del(...keys);
});
afterAll(async () => { await dropRestaurants(a.r.id, b.r.id); });

describe('recuperação de senha', () => {
  it('resposta idêntica para e-mail existente e inexistente; só o existente recebe o link', async () => {
    const email = emailOf('MANAGER');
    const yes = await request(app).post('/auth/forgot-password').send({ email: email.toUpperCase() });
    const no = await request(app).post('/auth/forgot-password').send({ email: 'ninguem-aqui@teste.dev' });
    expect([yes.status, yes.text]).toEqual([204, '']);
    expect([no.status, no.text]).toEqual([yes.status, yes.text]);
    expect(outbox).toHaveLength(1);
    expect(outbox[0]).toMatchObject({ to: email, subject: 'Redefinir sua senha do Garfeed' });
    expect(outbox[0]!.html).toContain(tokenOf(outbox[0]!));
  });

  it('token de uso único: redefine, derruba as sessões, avisa por e-mail e não vale de novo; só o hash fica no banco', async () => {
    const email = emailOf('MANAGER');
    const oldAccess = await a.token('MANAGER');
    await request(app).post('/auth/forgot-password').send({ email });
    const token = tokenOf(to(email)[0]!);

    const stored = await prisma.userToken.findMany({ where: { user: { email } } });
    expect(stored).toHaveLength(1);
    expect(stored[0]!.tokenHash).toBe(hashToken(token));
    expect(JSON.stringify(stored)).not.toContain(token);
    expect(stored[0]!.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(3_600_000);

    const info = await request(app).post('/auth/password-token').send({ token });
    expect(info.body).toMatchObject({ purpose: 'RESET', email, restaurantName: a.r.name });

    expect((await request(app).post('/auth/reset-password').send({ token, password: 'curta' })).status).toBe(400); // não gasta o token
    expect((await request(app).post('/auth/reset-password').send({ token, password: NEW })).status).toBe(204);
    expect(await loginStatus(email, password)).toBe(401);
    expect(await loginStatus(email, NEW)).toBe(200);
    expect((await request(app).get('/orders').set(bearer(oldAccess))).status).toBe(401); // access token antigo revogado
    expect(to(email).map((m) => m.subject)).toContain('Sua senha do Garfeed foi alterada');

    const again = await request(app).post('/auth/reset-password').send({ token, password: 'outra-senha-789' });
    expect(again.status).toBe(400);
    expect(again.body.error.message).toMatch(/inválido ou expirou/);
    expect((await request(app).post('/auth/password-token').send({ token })).status).toBe(400);
    expect(await loginStatus(email, NEW)).toBe(200);
  });

  it('token expirado ou inventado → 400; novo pedido invalida o link anterior', async () => {
    const email = emailOf('WAITER');
    await request(app).post('/auth/forgot-password').send({ email });
    await request(app).post('/auth/forgot-password').send({ email });
    const [first, second] = to(email).map(tokenOf) as [string, string];
    expect((await request(app).post('/auth/reset-password').send({ token: first, password: NEW })).status).toBe(400);
    await expire(second);
    expect((await request(app).post('/auth/password-token').send({ token: second })).status).toBe(400);
    expect((await request(app).post('/auth/reset-password').send({ token: second, password: NEW })).status).toBe(400);
    expect((await request(app).post('/auth/reset-password').send({ token: 'x'.repeat(43), password: NEW })).status).toBe(400);
    expect(await loginStatus(email, password)).toBe(200); // senha intacta
  });

  it('rate limit: no máximo 3 links por e-mail por hora (em silêncio) e 5 pedidos por IP (429)', async () => {
    const email = emailOf('WAITER');
    for (let i = 0; i < 5; i++) expect((await request(app).post('/auth/forgot-password').send({ email })).status).toBe(204);
    expect(to(email)).toHaveLength(3);
    const blocked = await request(app).post('/auth/forgot-password').send({ email });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('convite de equipe', () => {
  const invitee = () => `convidada-${Date.now()}-${Math.random().toString(36).slice(2, 6)}@teste.dev`;
  const inviteUser = async (email: string) => {
    const res = await request(app).post('/users').set(bearer(ownerA)).send({ name: 'Ana Convidada', email, role: 'WAITER' });
    expect(res.status).toBe(201);
    return res.body as StaffUser;
  };

  it('convidar sem senha → pendente, e-mail com link; aceitar define a senha e libera o login', async () => {
    const email = invitee();
    const u = await inviteUser(email);
    expect(u.invite).toBe('PENDING');
    expect(to(email)).toHaveLength(1);
    expect(to(email)[0]!.subject).toContain(a.r.name);
    expect(to(email)[0]!.text).toContain('Garçom');
    const token = tokenOf(to(email)[0]!);
    expect(await loginStatus(email, password)).toBe(401); // sem senha ainda
    await request(app).post('/auth/forgot-password').send({ email });
    expect(to(email)).toHaveLength(1); // convite pendente não gera link de recuperação

    const info = await request(app).post('/auth/password-token').send({ token });
    expect(info.body).toEqual({ purpose: 'INVITE', name: 'Ana Convidada', email, restaurantName: a.r.name });
    expect((await request(app).post('/auth/reset-password').send({ token, password: NEW })).status).toBe(204);
    expect(await loginStatus(email, NEW)).toBe(200);
    expect((await request(app).post('/auth/reset-password').send({ token, password: NEW })).status).toBe(400); // uso único

    const list = (await request(app).get('/users').set(bearer(ownerA))).body as StaffUser[];
    expect(list.find((x) => x.id === u.id)!.invite).toBeNull();
    // já aceito: não dá para reenviar nem cancelar
    expect((await request(app).post(`/users/${u.id}/invite`).set(bearer(ownerA))).status).toBe(409);
    expect((await request(app).delete(`/users/${u.id}/invite`).set(bearer(ownerA))).status).toBe(409);
  });

  it('convite expirado não é aceito; reenviar gera link novo e invalida o antigo', async () => {
    const email = invitee();
    const u = await inviteUser(email);
    const old = tokenOf(to(email)[0]!);
    await expire(old);
    const list = (await request(app).get('/users').set(bearer(ownerA))).body as StaffUser[];
    expect(list.find((x) => x.id === u.id)!.invite).toBe('EXPIRED');
    expect((await request(app).post('/auth/reset-password').send({ token: old, password: NEW })).status).toBe(400);

    const resent = await request(app).post(`/users/${u.id}/invite`).set(bearer(ownerA));
    expect(resent.status).toBe(200);
    expect(resent.body.invite).toBe('PENDING');
    expect(to(email)).toHaveLength(2);
    const fresh = tokenOf(to(email)[1]!);
    expect(fresh).not.toBe(old);
    expect((await request(app).post('/auth/password-token').send({ token: old })).status).toBe(400);
    expect((await request(app).post('/auth/reset-password').send({ token: fresh, password: NEW })).status).toBe(204);
    expect(await loginStatus(email, NEW)).toBe(200);
  });

  it('outro restaurante não reenvia nem cancela o convite (404); gerente não convida (403); cancelar remove o acesso', async () => {
    const email = invitee();
    const u = await inviteUser(email);
    const token = tokenOf(to(email)[0]!);
    expect((await request(app).post(`/users/${u.id}/invite`).set(bearer(ownerB))).status).toBe(404);
    expect((await request(app).delete(`/users/${u.id}/invite`).set(bearer(ownerB))).status).toBe(404);
    expect(((await request(app).get('/users').set(bearer(ownerB))).body as StaffUser[]).some((x) => x.id === u.id)).toBe(false);
    expect((await request(app).post(`/users/${u.id}/invite`).set(bearer(await a.token('KITCHEN')))).status).toBe(403);
    expect(to(email)).toHaveLength(1);

    expect((await request(app).delete(`/users/${u.id}/invite`).set(bearer(ownerA))).status).toBe(204);
    expect((await request(app).post('/auth/reset-password').send({ token, password: NEW })).status).toBe(400);
    expect(await prisma.user.count({ where: { email } })).toBe(0);
  });
});

describe('avisos', () => {
  it('conta desativada/reativada e senha trocada pelo dono avisam a pessoa', async () => {
    const u = staff.find((x) => x.role === 'KITCHEN')!;
    await request(app).patch(`/users/${u.id}`).set(bearer(ownerA)).send({ active: false });
    await request(app).patch(`/users/${u.id}`).set(bearer(ownerA)).send({ active: true });
    await request(app).patch(`/users/${u.id}`).set(bearer(ownerA)).send({ name: 'Só o nome' }); // sem aviso
    await request(app).patch(`/users/${u.id}`).set(bearer(ownerA)).send({ password: NEW });
    expect(to(u.email).map((m) => m.subject)).toEqual([
      `Seu acesso ao ${a.r.name} foi desativado`, `Seu acesso ao ${a.r.name} foi reativado`, 'Sua senha do Garfeed foi alterada',
    ]);
  });

  it('superadmin: dono novo recebe boas-vindas com link de definir senha; suspender/reativar avisa o dono', async () => {
    const tag = Date.now().toString(36);
    const adminEmail = `admin-mail-${tag}@teste.dev`;
    const ownerEmail = `dono-${tag}@teste.dev`;
    await prisma.user.create({ data: { email: adminEmail, name: 'Admin', role: 'SUPERADMIN', passwordHash: await argon2.hash(password) } });
    const admin = (await request(app).post('/auth/login').send({ email: adminEmail, password })).body.accessToken as string;
    const created = await request(app).post('/admin/restaurants').set(bearer(admin)).send({ name: 'Novo Bistrô', slug: `novo-${tag}`, owner: { name: 'Dona Nova', email: ownerEmail } });
    try {
      expect(created.status).toBe(201);
      expect(to(ownerEmail)[0]!.subject).toBe('Bem-vindo ao Garfeed, Dona!');
      const token = tokenOf(to(ownerEmail)[0]!);
      expect((await request(app).post('/auth/password-token').send({ token })).body).toMatchObject({ purpose: 'INVITE', restaurantName: 'Novo Bistrô' });
      expect((await request(app).post('/auth/reset-password').send({ token, password: NEW })).status).toBe(204);
      expect(await loginStatus(ownerEmail, NEW)).toBe(200);

      const id = created.body.id as string;
      await request(app).patch(`/admin/restaurants/${id}`).set(bearer(admin)).send({ status: 'SUSPENDED' });
      await request(app).patch(`/admin/restaurants/${id}`).set(bearer(admin)).send({ plan: 'PRO' }); // sem aviso
      await request(app).patch(`/admin/restaurants/${id}`).set(bearer(admin)).send({ status: 'ACTIVE' });
      expect(to(ownerEmail).slice(1).map((m) => m.subject)).toEqual(['O Novo Bistrô foi suspenso no Garfeed', 'O Novo Bistrô foi reativado no Garfeed']);
      // e-mail de teste: sem credencial no ambiente de teste a rota avisa em vez de fingir que enviou
      const test = await request(app).post('/admin/test-email').set(bearer(admin));
      expect([204, 400]).toContain(test.status);
      expect((await request(app).post('/admin/test-email').set(bearer(ownerA))).status).toBe(403);
    } finally {
      if (created.body.id) await dropRestaurants(created.body.id as string);
      await prisma.user.deleteMany({ where: { email: adminEmail } });
    }
  });
});
