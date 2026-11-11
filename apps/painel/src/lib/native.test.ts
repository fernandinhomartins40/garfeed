import { describe, expect, it } from 'vitest';
import { ndefText } from './native';
import { extractTagCode } from './utils';

const bytes = (s: string) => [...new TextEncoder().encode(s)];

describe('ndefText (NFC do app iOS)', () => {
  it('registro de URL: descarta o byte do prefixo e o código sai pelo extractTagCode', () => {
    const text = ndefText({ tnf: 1, type: [0x55], payload: [0x04, ...bytes('g.garfeed.com.br/GF7K2P')] });
    expect(text).toBe('g.garfeed.com.br/GF7K2P');
    expect(extractTagCode(text!)).toBe('GF7K2P');
  });
  it('registro de texto: descarta o idioma', () => {
    expect(ndefText({ tnf: 1, type: [0x54], payload: [2, ...bytes('pt'), ...bytes('GF7K2P')] })).toBe('GF7K2P');
  });
  it('outros tipos e payload vazio → null', () => {
    expect(ndefText({ tnf: 2, type: [0x55], payload: [0, 1] })).toBeNull();
    expect(ndefText({ tnf: 1, type: [0x53, 0x70], payload: [0, 1] })).toBeNull();
    expect(ndefText({ tnf: 1, type: [0x55], payload: [] })).toBeNull();
  });
});
