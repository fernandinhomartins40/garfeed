import type { z } from 'zod';
import { api, buildPath, type AuthResponse, type ErrorResponse } from '@garfeed/shared';
import { API_URL } from './utils';
import { useAuth } from './auth';

type AnyRoute = { method: string; path: string; auth: string; response: z.ZodType | null; params?: z.ZodType; query?: z.ZodType; body?: z.ZodType };
type Out<R> = R extends { response: infer S } ? (S extends z.ZodType ? z.infer<S> : void) : never;
type Opt<R, K extends string> = R extends { [k in K]: infer S } ? (S extends z.ZodType ? { [k in K]: z.input<S> } : object) : object;
export type Req<R> = Opt<R, 'params'> & Opt<R, 'query'> & Opt<R, 'body'>;

export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public details?: unknown) { super(message); }
}

let refreshing: Promise<boolean> | null = null;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Renova o accessToken pelo cookie de refresh (uma chamada por vez) e agenda a próxima renovação. */
export function refresh(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const r = await fetch(API_URL + api.auth.refresh.path, { method: 'POST', credentials: 'include' });
      if (!r.ok) throw new Error();
      applyAuth((await r.json()) as AuthResponse);
      return true;
    } catch {
      useAuth.getState().clear();
      return false;
    } finally { refreshing = null; }
  })();
  return refreshing;
}
export function applyAuth(r: AuthResponse) {
  useAuth.getState().set(r);
  clearTimeout(timer);
  timer = setTimeout(() => void refresh(), Math.max(30, r.expiresInSec - 60) * 1000);
}
export async function logout() {
  clearTimeout(timer);
  await fetch(API_URL + api.auth.logout.path, { method: 'POST', credentials: 'include' }).catch(() => undefined);
  useAuth.getState().clear();
}

async function raw(route: AnyRoute, req: { params?: Record<string, string>; query?: Record<string, unknown>; body?: unknown }, retry = true): Promise<Response> {
  const qs = req.query ? new URLSearchParams(Object.entries(req.query).filter(([, v]) => v != null && v !== '').map(([k, v]) => [k, String(v)])).toString() : '';
  const headers: Record<string, string> = {};
  const token = useAuth.getState().token;
  if (route.auth === 'jwt' && token) headers.Authorization = `Bearer ${token}`;
  if (req.body !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(API_URL + buildPath(route.path, req.params) + (qs ? `?${qs}` : ''), {
      method: route.method, headers, credentials: 'include', body: req.body === undefined ? undefined : JSON.stringify(req.body),
    });
  } catch {
    throw new ApiError(0, 'NETWORK', 'Sem conexão com o servidor. Tente de novo.');
  }
  if (res.status === 401 && route.auth === 'jwt' && retry && (await refresh())) return raw(route, req, false);
  if (!res.ok) {
    const e = (await res.json().catch(() => null)) as ErrorResponse | null;
    throw new ApiError(res.status, e?.error.code ?? 'INTERNAL', e?.error.message ?? 'Algo deu errado. Tente de novo.', e?.error.details);
  }
  return res;
}

/** Chama uma rota do contrato: `call(api.menu.updateItem, { params: { id }, body })`. */
export async function call<R extends AnyRoute>(route: R, ...[req]: object extends Req<R> ? [Req<R>?] : [Req<R>]): Promise<Out<R>> {
  const res = await raw(route, (req ?? {}) as never);
  if (route.response === null || res.status === 204) return undefined as Out<R>;
  return (res.headers.get('content-type')?.includes('json') ? res.json() : res.text()) as Promise<Out<R>>;
}

/** Baixa um arquivo autenticado (CSV de lotes). */
export async function download(route: AnyRoute, params: Record<string, string>, fileName: string) {
  const blob = await (await raw(route, { params })).blob();
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: fileName });
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

export const errMsg = (e: unknown) => (e instanceof Error ? e.message : 'Algo deu errado.');
