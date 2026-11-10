import type { Restaurant } from '@prisma/client';
import { OpeningHours, type PublicRestaurant } from '@garfeed/shared';

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

/** Dia da semana e HH:MM no fuso do restaurante. */
function localNow(timezone: string, now: Date) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone: timezone, weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(now).map((p) => [p.type, p.value]),
  );
  const day = DAYS.findIndex((d) => d === String(parts.weekday).toLowerCase());
  return { day, hhmm: `${parts.hour}:${parts.minute}` };
}

/** Sem horário cadastrado = sempre aberto. Faixa que vira a noite (["18:00","02:00"]) vale até o dia seguinte. */
export function isOpenAt(hoursJson: unknown, timezone: string, now = new Date()): boolean {
  if (hoursJson == null) return true;
  const parsed = OpeningHours.safeParse(hoursJson);
  if (!parsed.success) return true;
  const hours = parsed.data;
  const { day, hhmm } = localNow(timezone, now);
  const today = hours[DAYS[day]!] ?? [];
  const yesterday = hours[DAYS[(day + 6) % 7]!] ?? [];
  return today.some(([a, b]) => (a <= b ? hhmm >= a && hhmm < b : hhmm >= a))
    || yesterday.some(([a, b]) => a > b && hhmm < b);
}

/** AAAA-MM-DD no fuso do restaurante (escopo do número do pedido). */
export const localDay = (timezone: string, now = new Date()) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);

export function toPublicRestaurant(r: Restaurant, now = new Date()): PublicRestaurant {
  const isOpen = isOpenAt(r.openingHours, r.timezone, now);
  return {
    id: r.id, slug: r.slug, name: r.name, logoUrl: r.logoUrl, accentColor: r.accentColor,
    wifiName: r.wifiName, wifiPassword: r.wifiPassword, instagram: r.instagram, googleReviewUrl: r.googleReviewUrl,
    openingHours: OpeningHours.safeParse(r.openingHours).data ?? null,
    isOpen,
    canOrder: isOpen && r.status !== 'SUSPENDED',
    timezone: r.timezone,
  };
}
