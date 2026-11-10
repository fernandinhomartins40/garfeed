import { z } from 'zod';

/** Alfabeto sem caracteres ambíguos (sem 0/O, 1/I/L) — PRD RF-25. */
export const TAG_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
export const TAG_PREFIX = 'GF';
/** Código = "GF" + 4 caracteres = 6 no total (ex.: GF7K2P). Ver docs/DECISOES.md. */
export const TAG_CODE_LENGTH = 6;

/**
 * Aceita qualquer A-Z/0-9 após o prefixo (as placas demo GF0001.. usam dígitos fora do alfabeto);
 * normaliza para maiúsculas porque o código pode ser digitado à mão.
 */
export const TagCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^GF[0-9A-Z]{4}$/, 'Código de placa inválido');

/** Gera um código com aleatoriedade criptográfica (Web Crypto: Node 20+ e navegadores). */
export function generateTagCode(): string {
  const n = TAG_CODE_LENGTH - TAG_PREFIX.length;
  // 248 = maior múltiplo de 31 ≤ 256: rejeita bytes acima para não enviesar a distribuição
  let out = '';
  while (out.length < n) {
    for (const b of crypto.getRandomValues(new Uint8Array(n * 2))) {
      if (b < 248 && out.length < n) out += TAG_ALPHABET[b % TAG_ALPHABET.length];
    }
  }
  return TAG_PREFIX + out;
}

/** N códigos únicos dentro do lote. Unicidade global é garantida pelo @unique do banco. */
export function generateTagCodes(count: number, exclude: ReadonlySet<string> = new Set()): string[] {
  const codes = new Set<string>();
  while (codes.size < count) {
    const c = generateTagCode();
    if (!exclude.has(c)) codes.add(c);
  }
  return [...codes];
}

export const tagUrl = (baseUrl: string, code: string) => `${baseUrl.replace(/\/$/, '')}/${code}`;
