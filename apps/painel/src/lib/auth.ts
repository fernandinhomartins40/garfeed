import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResponse } from '@garfeed/shared';

type AuthState = {
  /** JWT só em memória (nunca em localStorage); o refresh fica no cookie httpOnly. */
  token: string | null;
  user: AuthResponse['user'] | null;
  restaurant: AuthResponse['restaurant'];
  ready: boolean;
  set: (r: AuthResponse) => void;
  clear: () => void;
};
export const useAuth = create<AuthState>((set) => ({
  token: null, user: null, restaurant: null, ready: false,
  set: (r) => set({ token: r.accessToken, user: r.user, restaurant: r.restaurant, ready: true }),
  clear: () => set({ token: null, user: null, restaurant: null, ready: true }),
}));

/** Preferências deste aparelho. */
type Prefs = { sound: boolean; volume: number; notifDismissed: boolean; set: (p: Partial<Omit<Prefs, 'set'>>) => void };
export const usePrefs = create<Prefs>()(persist((set) => ({
  sound: true, volume: 0.8, notifDismissed: false, set: (p) => set(p),
}), { name: 'gf-painel-prefs' }));

/** Estado do socket (para o banner offline). */
export const useLive = create<{ connected: boolean; everConnected: boolean }>(() => ({ connected: false, everConnected: false }));
