import { afterEach, describe, expect, it, vi } from 'vitest';
import { isStoreApp } from './storeApp';

function world({ referrer = '', native, storage = true }: { referrer?: string; native?: boolean; storage?: boolean } = {}, store = new Map<string, string>()) {
  vi.stubGlobal('window', native === undefined ? {} : { Capacitor: { isNativePlatform: () => native } });
  vi.stubGlobal('document', { referrer });
  vi.stubGlobal('sessionStorage', storage
    ? { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) }
    : { getItem: () => { throw new Error('bloqueado'); }, setItem: () => { throw new Error('bloqueado'); } });
  return store;
}
afterEach(() => vi.unstubAllGlobals());

describe('isStoreApp', () => {
  it('navegador comum → false (inclusive Capacitor rodando na web)', () => {
    world({ referrer: 'https://garfeed.com.br/' });
    expect(isStoreApp()).toBe(false);
    world({ native: false });
    expect(isStoreApp()).toBe(false);
  });

  it('iOS/Capacitor nativo → true', () => {
    world({ native: true, storage: false });
    expect(isStoreApp()).toBe(true);
  });

  it('Android TWA: referrer android-app:// na primeira carga, lembrado nas navegações seguintes', () => {
    const store = world({ referrer: 'android-app://br.com.garfeed.painel/' });
    expect(isStoreApp()).toBe(true);
    world({ referrer: '' }, store); // navegação seguinte: o referrer sumiu, o sessionStorage lembra
    expect(isStoreApp()).toBe(true);
    world({ referrer: '' }); // outra sessão do navegador
    expect(isStoreApp()).toBe(false);
  });

  it('sessionStorage bloqueado não quebra: vale o referrer atual', () => {
    world({ referrer: 'android-app://br.com.garfeed.painel/', storage: false });
    expect(isStoreApp()).toBe(true);
    world({ storage: false });
    expect(isStoreApp()).toBe(false);
  });
});
