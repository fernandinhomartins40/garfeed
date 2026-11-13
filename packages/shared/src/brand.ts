import type { Plan, RestStatus } from './enums';

/** Marca própria no cardápio e nas plaquinhas (logo e cores): planos Pro e Rede, e o teste grátis para experimentar. */
export const hasBranding = (plan: Plan, status: RestStatus) => plan !== 'ESSENTIAL' || status === 'TRIAL';

/** Luminância relativa WCAG de uma cor #RRGGBB. */
export function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
/** Contraste WCAG entre duas cores #RRGGBB (1 a 21). */
export const contrast = (a: string, b: string) => {
  const [x, y] = [luminance(a), luminance(b)].sort((m, n) => n - m) as [number, number];
  return (x + 0.05) / (y + 0.05);
};
