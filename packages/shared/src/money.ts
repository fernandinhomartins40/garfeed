const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

/** Centavos (Int) → "R$ 32,90". Normaliza o espaço não separável do Intl para espaço comum. */
export function formatBRL(cents: number): string {
  if (!Number.isInteger(cents)) throw new TypeError('formatBRL espera centavos inteiros');
  return brl.format(cents / 100).replace(/\s/g, ' ');
}
