import { describe, expect, it } from 'vitest';
import { BADGE_LABEL, LIMITS, ORDER_STATUS_LABEL, type PublicItem } from '@garfeed/shared';
import { BADGES, CALL_COOLDOWN_SEC, STATUS_LABEL, groupError, onColor, openUntil, todayHours, unitPrice } from './lib';

const ponto = { id: 'g1', name: 'Ponto da carne', min: 1, max: 1, options: [{ id: 'a', name: 'Ao ponto', priceCents: 0, position: 0 }, { id: 'b', name: 'Bem passado', priceCents: 0, position: 1 }] };
const adic = { id: 'g2', name: 'Adicionais', min: 0, max: 2, options: [{ id: 'x', name: 'Bacon', priceCents: 500, position: 0 }, { id: 'y', name: 'Ovo', priceCents: 300, position: 1 }, { id: 'z', name: 'Cheddar', priceCents: 400, position: 2 }] };
const item = { priceCents: 3290, promoPriceCents: null, optionGroups: [ponto, adic] } as unknown as PublicItem;

describe('opcionais', () => {
  it('valida min/max', () => {
    expect(groupError(ponto, [])).toMatch(/Escolha 1/);
    expect(groupError(ponto, ['a'])).toBeNull();
    expect(groupError(adic, ['x', 'y', 'z'])).toMatch(/Máximo de 2/);
  });
  it('soma opcionais ao preço (promo tem prioridade)', () => {
    expect(unitPrice(item, ['a', 'x'])).toBe(3790);
    expect(unitPrice({ ...item, promoPriceCents: 2990 }, ['x', 'y'])).toBe(3790);
  });
});

describe('horário e cor', () => {
  const h = { tue: [['11:00', '15:00'], ['18:00', '23:30']] as [string, string][] };
  const tue20h = new Date(2026, 10, 10, 20, 0); // terça
  it('formata faixas e "aberto até"', () => {
    expect(todayHours(h, tue20h)).toBe('11h às 15h · 18h às 23h30');
    expect(openUntil(h, tue20h)).toBe('23h30');
    expect(todayHours(h, new Date(2026, 10, 9))).toBeNull();
  });
  it('texto legível sobre a cor de destaque', () => {
    expect(onColor('#FE581D')).toBe('#FFFFFF');
    expect(onColor('#FFE066')).toBe('#142433');
  });
});

it('constantes espelham o contrato', () => {
  expect(CALL_COOLDOWN_SEC).toBe(LIMITS.callCooldownSec);
  expect(STATUS_LABEL).toEqual(ORDER_STATUS_LABEL);
  expect(BADGES).toEqual(BADGE_LABEL);
});

describe('cores da marca própria', () => {
  it('texto na cor da marca sempre legível sobre branco', async () => {
    const { readableOnWhite, mix } = await import('./lib');
    const { contrast } = await import('@garfeed/shared/brand');
    for (const c of ['#FFD400', '#22C55E', '#FE581D', '#1D4ED8']) expect(contrast(readableOnWhite(c), '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
    expect(readableOnWhite('#1D4ED8')).toBe('#1D4ED8'); // já escura: não mexe
    expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
  });
});
