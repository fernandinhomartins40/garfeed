import { describe, expect, it } from 'vitest';
import { formatBRL } from './money';
import { generateTagCode, generateTagCodes, TAG_ALPHABET, TagCode } from './tag-code';
import { buildPath } from './contract';
import { CreateOrderBody, ListOrdersQuery } from './schemas';

describe('formatBRL', () => {
  it('formata centavos em reais', () => {
    expect(formatBRL(3290)).toBe('R$ 32,90');
    expect(formatBRL(0)).toBe('R$ 0,00');
    expect(formatBRL(5)).toBe('R$ 0,05');
    expect(formatBRL(123456)).toBe('R$ 1.234,56');
  });
  it('rejeita valor não inteiro', () => {
    expect(() => formatBRL(32.9)).toThrow();
  });
});

describe('código de placa', () => {
  it('gera GF + 4 caracteres do alfabeto sem ambíguos', () => {
    for (let i = 0; i < 500; i++) {
      const c = generateTagCode();
      expect(c).toMatch(/^GF.{4}$/);
      for (const ch of c.slice(2)) expect(TAG_ALPHABET).toContain(ch);
    }
  });
  it('alfabeto não tem 0, 1, O, I, L', () => {
    expect(TAG_ALPHABET).not.toMatch(/[01OIL]/);
  });
  it('gera lote sem repetidos e respeita exclusões', () => {
    const codes = generateTagCodes(300, new Set(['GF2222']));
    expect(new Set(codes).size).toBe(300);
    expect(codes).not.toContain('GF2222');
  });
  it('valida e normaliza código digitado', () => {
    expect(TagCode.parse(' gf7k2p ')).toBe('GF7K2P');
    expect(TagCode.parse('GF0001')).toBe('GF0001');
    expect(TagCode.safeParse('XX7K2P').success).toBe(false);
  });
});

describe('contrato', () => {
  it('buildPath substitui parâmetros', () => {
    expect(buildPath('/tags/:code/unlink', { code: 'GF7K2P' })).toBe('/tags/GF7K2P/unlink');
  });
  it('ListOrdersQuery aceita status separados por vírgula', () => {
    expect(ListOrdersQuery.parse({ status: 'PENDING,READY' }).status).toEqual(['PENDING', 'READY']);
    expect(ListOrdersQuery.safeParse({ status: 'FOO' }).success).toBe(false);
  });
  it('CreateOrderBody exige itens', () => {
    expect(CreateOrderBody.safeParse({ idempotencyKey: crypto.randomUUID(), items: [] }).success).toBe(false);
  });
});
