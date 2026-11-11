// Dentro dos apps das lojas (App Store / Play Store) o painel só serve para ACESSAR: nada de cadastro, assinatura,
// pagamento ou menção a assinar em outro lugar (regra das lojas). No navegador comum tudo continua completo.
import { isNative } from './native';

const KEY = 'gf-store-app';

/**
 * true quando o painel roda dentro do app da loja:
 * (a) iOS/Capacitor — `isNative()` (lib/native.ts);
 * (b) Android TWA — a primeira carga chega com `?gfapp=android` (LauncherActivity.java acrescenta em toda abertura)
 *     ou com referrer `android-app://…`; o resultado fica no sessionStorage para valer nas navegações seguintes
 *     (o parâmetro e o referrer somem depois). Chamado na carga do painel (App.tsx).
 */
export function isStoreApp(): boolean {
  if (isNative()) return true;
  const twa = document.referrer.startsWith('android-app://') || new URLSearchParams(location.search).get('gfapp') === 'android';
  try {
    if (twa) sessionStorage.setItem(KEY, '1');
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return twa; // sessionStorage bloqueado: vale só o que dá para ver agora
  }
}
