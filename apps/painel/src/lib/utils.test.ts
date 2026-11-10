import { describe, expect, it } from 'vitest';
import { ago, extractTagCode, parseCents, centsToInput } from './utils';

describe('extractTagCode', () => {
  it('lê URL da placa, código puro e minúsculas', () => {
    expect(extractTagCode('https://g.garfeed.com.br/GF7K2P')).toBe('GF7K2P');
    expect(extractTagCode('g.garfeed.com.br/gf0001/')).toBe('GF0001');
    expect(extractTagCode(' gf7k2p ')).toBe('GF7K2P');
    expect(extractTagCode('https://g.garfeed.com.br/GF7K2P?src=nfc')).toBe('GF7K2P');
  });
  it('rejeita lixo', () => {
    expect(extractTagCode('https://exemplo.com/abc')).toBeNull();
    expect(extractTagCode('')).toBeNull();
  });
});

describe('dinheiro', () => {
  it('converte texto em centavos', () => {
    expect(parseCents('32,90')).toBe(3290);
    expect(parseCents('32.90')).toBe(3290);
    expect(parseCents('R$ 1.032,90')).toBe(103290);
    expect(parseCents('')).toBeNull();
    expect(centsToInput(3290)).toBe('32,90');
  });
});

it('ago', () => {
  const now = Date.parse('2026-11-10T12:00:00Z');
  expect(ago('2026-11-10T11:59:20Z', now)).toBe('há 40 s');
  expect(ago('2026-11-10T11:58:00Z', now)).toBe('há 2 min');
});
