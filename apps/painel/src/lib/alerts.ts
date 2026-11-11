import { api } from '@garfeed/shared';
import { call } from './api';
import { isNative, registerNativePush } from './native';

// ---------- Som (Web Audio, sem arquivo) ----------
let ctx: AudioContext | null = null;
const audio = () => (ctx ??= new AudioContext());

/** Navegadores só liberam áudio depois de um gesto: chame em pointerdown/keydown. */
export function unlockAudio() {
  const c = audio();
  if (c.state === 'suspended') void c.resume();
}
export const audioLocked = () => !ctx || ctx.state !== 'running';

/** Alerta alto: três bipes ascendentes. */
export function playAlert(volume = 0.8) {
  const c = audio();
  if (c.state !== 'running') return;
  [880, 1175, 1568].forEach((f, i) => {
    const o = c.createOscillator();
    const g = c.createGain();
    const t = c.currentTime + i * 0.22;
    o.type = 'square';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, volume * 0.5), t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
    o.connect(g).connect(c.destination);
    o.start(t);
    o.stop(t + 0.21);
  });
}

// ---------- Notificações do navegador + Web Push ----------
export const notifSupported = () => 'Notification' in window && 'serviceWorker' in navigator;

const b64ToBytes = (b64: string) => {
  const s = atob((b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(s, (ch) => ch.charCodeAt(0));
};

/** Pede permissão (só após clique do usuário), registra o SW e assina o Web Push se houver chave VAPID. */
export async function enableNotifications(): Promise<NotificationPermission> {
  if (isNative()) return registerNativePush(true); // app iOS: push nativo (APNs)
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm;
  await subscribePush().catch((e: unknown) => console.warn('Web Push indisponível', e));
  return perm;
}

export async function subscribePush() {
  if (isNative()) return void (await registerNativePush(false));
  if (!notifSupported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.register('/sw.js');
  if (!('pushManager' in reg)) return;
  let key = import.meta.env.VITE_VAPID_PUBLIC_KEY;
  if (!key) key = (await call(api.push.vapidPublicKey)).publicKey ?? undefined;
  if (!key) return;
  const sub = (await reg.pushManager.getSubscription())
    ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(key) }));
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys.auth) return;
  await call(api.push.subscribe, { body: { endpoint: j.endpoint, keys: { p256dh: j.keys.p256dh, auth: j.keys.auth } } });
}

/** Notificação local quando a aba está em segundo plano (o Web Push cobre a aba fechada). */
export async function notify(title: string, body: string) {
  if (!notifSupported() || Notification.permission !== 'granted' || !document.hidden) return;
  const reg = await navigator.serviceWorker.getRegistration();
  if (reg) await reg.showNotification(title, { body, icon: '/icon-192.png', tag: 'gf-alerta' });
  else new Notification(title, { body, icon: '/icon-192.png' });
}
