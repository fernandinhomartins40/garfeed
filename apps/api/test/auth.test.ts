// Requer postgres do docker-compose.dev + migrate + seed (usuário carlos@brasaepao.com.br).
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { AuthResponse, COOKIES } from '@garfeed/shared';
import { createApp } from '../src/app';

const app = createApp();
const password = process.env.SEED_PASSWORD ?? 'garfeed123';

const refreshCookieOf = (res: request.Response) => {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  return raw?.find((c) => c.startsWith(`${COOKIES.refresh}=`))?.split(';')[0];
};

describe('auth', () => {
  it('login com senha correta devolve token e cookie httpOnly de refresh', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'CARLOS@brasaepao.com.br', password });
    expect(res.status).toBe(200);
    const body = AuthResponse.parse(res.body);
    expect(body.user.role).toBe('OWNER');
    expect(body.restaurant?.slug).toBe('brasa-e-pao');
    expect(String(res.headers['set-cookie'])).toMatch(/HttpOnly/i);
  });

  it('login com senha errada → 401 com mensagem pt-BR', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'carlos@brasaepao.com.br', password: 'errada' });
    expect(res.status).toBe(401);
    expect(res.body.error).toMatchObject({ code: 'UNAUTHORIZED', message: 'E-mail ou senha incorretos.' });
  });

  it('corpo inválido → 400 VALIDATION', async () => {
    const res = await request(app).post('/auth/login').send({ email: 'nao-e-email' });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION');
  });

  it('refresh rotaciona: o cookie antigo deixa de valer; logout revoga', async () => {
    const login = await request(app).post('/auth/login').send({ email: 'carlos@brasaepao.com.br', password });
    const c1 = refreshCookieOf(login)!;

    const r1 = await request(app).post('/auth/refresh').set('Cookie', c1);
    expect(r1.status).toBe(200);
    expect(AuthResponse.parse(r1.body).user.email).toBe('carlos@brasaepao.com.br');
    const c2 = refreshCookieOf(r1)!;
    expect(c2).not.toBe(c1);

    expect((await request(app).post('/auth/refresh').set('Cookie', c1)).status).toBe(401);

    expect((await request(app).post('/auth/logout').set('Cookie', c2)).status).toBe(204);
    expect((await request(app).post('/auth/refresh').set('Cookie', c2)).status).toBe(401);
  });

  it('rota autenticada sem token → 401', async () => {
    expect((await request(app).get('/menu/categories')).status).toBe(401);
  });
});
