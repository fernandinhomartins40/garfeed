// Chamadas diretas à API de teste (setup e verificações). Caminhos = packages/shared/src/contract.ts.
import { API } from './urls';

export const PASSWORD = process.env.SEED_PASSWORD ?? 'garfeed123';
export const USERS = { owner: 'carlos@brasaepao.com.br', manager: 'gerente@brasaepao.com.br', waiter: 'julia@brasaepao.com.br' };

export async function token(email: string) {
  const r = await fetch(API + '/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }),
  });
  if (!r.ok) throw new Error(`login ${email}: ${r.status} ${await r.text()}`);
  return ((await r.json()) as { accessToken: string }).accessToken;
}

export async function call<T>(tok: string, method: string, path: string, body?: unknown): Promise<T> {
  const r = await fetch(API + path, {
    method, headers: { authorization: `Bearer ${tok}`, ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${await r.text()}`);
  return (r.status === 204 ? undefined : await r.json()) as T;
}

type OpeningHours = Record<string, [string, string][]> | null;
export const getSettings = (tok: string) => call<{ openingHours: OpeningHours }>(tok, 'GET', '/settings');
export const setOpeningHours = (tok: string, openingHours: OpeningHours) => call(tok, 'PATCH', '/settings', { openingHours });

/** Fecha a sessão aberta da mesa (zera pedidos/hora e bloqueio de chamado da mesa). */
export async function closeTable(tok: string, name: string) {
  const t = (await call<{ name: string; session: { id: string } | null }[]>(tok, 'GET', '/tables')).find((x) => x.name === name);
  if (!t) throw new Error(`${name} não existe — rode o seed`);
  if (t.session) await call(tok, 'POST', `/sessions/${t.session.id}/close`);
}

export async function setSoldOut(tok: string, itemName: string, soldOut: boolean) {
  const item = (await call<{ id: string; name: string }[]>(tok, 'GET', '/menu/items')).find((i) => i.name === itemName);
  if (!item) throw new Error(`item ${itemName} não existe — rode o seed`);
  await call(tok, 'PATCH', `/menu/items/${item.id}/sold-out`, { soldOut });
}
