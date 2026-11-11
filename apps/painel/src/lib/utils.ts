import { useEffect } from 'react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { TagCode } from '@garfeed/shared';

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));

/** Telas claras de tela cheia: o app iOS pinta a barra de status pelo theme-color; volta ao marinho ao sair. */
export function useThemeColor(color: string) {
  useEffect(() => {
    const m = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!m) return;
    const prev = m.content;
    m.content = color;
    return () => { m.content = prev; };
  }, [color]);
}

export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:3000').replace(/\/$/, '');
export const TAG_BASE_URL = import.meta.env.VITE_TAG_BASE_URL || 'https://g.garfeed.com.br';

/** "há 40 s", "há 2 min", "há 1 h". */
export function ago(iso: string, now = Date.now()) {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `há ${s} s`;
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  const d = Math.floor(s / 86400);
  return d === 1 ? 'ontem' : `há ${d} dias`;
}
export const minutesSince = (iso: string, now = Date.now()) => (now - new Date(iso).getTime()) / 60000;

/** "32,90" | "32.90" | "R$ 1.032,90" → 3290; vazio/inválido → null. */
export function parseCents(v: string): number | null {
  let s = v.replace(/[^\d,.]/g, '');
  if (!s) return null;
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}
/** 3290 → "32,90" (para inputs). */
export const centsToInput = (c: number | null | undefined) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));

/** Extrai o código de "https://g.garfeed.com.br/GF7K2P", "g.garfeed.com.br/gf7k2p" ou "GF7K2P". */
export function extractTagCode(raw: string): string | null {
  const last = raw.trim().replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '';
  const r = TagCode.safeParse(last);
  return r.success ? r.data : null;
}

export const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';
