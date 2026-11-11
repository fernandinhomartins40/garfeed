// Ponte com o app iOS (Capacitor, apps/mobile). O painel é carregado pelo `server.url` do app, então o
// Capacitor injeta `window.Capacitor` com os plugins nativos prontos — sem dependência npm no painel.
import { api } from '@garfeed/shared';
import { call } from './api';

type Handle = Promise<{ remove: () => Promise<void> }>;
type Perm = { receive: 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied' };
interface NdefRecord { tnf: number; type: number[]; payload: number[] }
interface CapacitorGlobal {
  isNativePlatform(): boolean;
  Plugins: {
    PushNotifications: {
      checkPermissions(): Promise<Perm>;
      requestPermissions(): Promise<Perm>;
      register(): Promise<void>;
      addListener(ev: 'registration', fn: (t: { value: string }) => void): Handle;
    };
    CapacitorNfc: {
      startScanning(o: { invalidateAfterFirstRead: boolean; alertMessage: string }): Promise<void>;
      stopScanning(): Promise<void>;
      addListener(ev: 'nfcEvent', fn: (e: { tag?: { ndefMessage?: NdefRecord[] | null } }) => void): Handle;
      addListener(ev: 'nfcSessionEnd', fn: (e: { reason: string }) => void): Handle;
    };
  };
}
declare global { interface Window { Capacitor?: CapacitorGlobal } }

export const isNative = () => !!window.Capacitor?.isNativePlatform();

// ---------- Push (APNs) ----------
const toWeb = (p: Perm): NotificationPermission => (p.receive === 'granted' || p.receive === 'denied' ? p.receive : 'default');
export const nativePushPermission = async () => toWeb(await window.Capacitor!.Plugins.PushNotifications.checkPermissions());

let listening = false;
/** Registra o aparelho no APNs e manda o token para a API. `ask` = pode abrir o diálogo de permissão (só após clique). */
export async function registerNativePush(ask: boolean): Promise<NotificationPermission> {
  const push = window.Capacitor!.Plugins.PushNotifications;
  let perm = await push.checkPermissions();
  if (ask && perm.receive !== 'granted' && perm.receive !== 'denied') perm = await push.requestPermissions();
  if (perm.receive !== 'granted') return toWeb(perm);
  if (!listening) {
    listening = true;
    await push.addListener('registration', (t) => {
      void call(api.push.apnsDevice, { body: { token: t.value } }).catch((e: unknown) => console.warn('registro APNs falhou', e));
    });
  }
  await push.register();
  return 'granted';
}

// ---------- NFC ----------
/** Texto de um registro NDEF "bem conhecido": URL (`U`, sem o prefixo http) ou texto (`T`). Outros tipos → null. */
export function ndefText(r: NdefRecord): string | null {
  if (r.tnf !== 1 || r.type.length !== 1 || !r.payload.length) return null;
  const skip = r.type[0] === 0x55 ? 1 : r.type[0] === 0x54 ? 1 + (r.payload[0]! & 0x3f) : -1;
  return skip < 0 ? null : new TextDecoder().decode(Uint8Array.from(r.payload.slice(skip)));
}

/** Abre a folha de leitura NFC do iOS (uma leitura por sessão). Devolve a função que cancela. */
export function scanNfcNative(onText: (s: string) => void, onErr: (msg: string) => void) {
  const nfc = window.Capacitor!.Plugins.CapacitorNfc;
  const subs = [
    nfc.addListener('nfcEvent', (e) => {
      const text = (e.tag?.ndefMessage ?? []).map(ndefText).find(Boolean);
      if (text) onText(text);
      else onErr('Não encontramos o código nesta placa. Digite o código impresso.');
    }),
    nfc.addListener('nfcSessionEnd', () => onErr('Leitura encerrada. Volte e toque em "Aproximar (NFC)" de novo, ou digite o código.')),
  ];
  nfc.startScanning({ invalidateAfterFirstRead: true, alertMessage: 'Encoste o topo do iPhone na placa.' })
    .catch(() => onErr('NFC indisponível neste aparelho. Digite o código.'));
  return () => {
    subs.forEach((s) => void s.then((h) => h.remove()));
    void nfc.stopScanning().catch(() => undefined);
  };
}
