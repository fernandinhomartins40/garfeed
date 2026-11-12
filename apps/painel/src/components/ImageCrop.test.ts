import { describe, expect, it } from 'vitest';
import { clampOffset, cropRect } from './ImageCrop';

describe('corte da foto', () => {
  const img = { w: 4000, h: 3000 }; // foto deitada de celular
  const frame = { w: 270, h: 480 }; // moldura 9:16

  it('sem zoom, pega a altura inteira e um recorte 9:16 da largura', () => {
    const off = clampOffset(img, frame, 1, { x: -9999, y: 0 });
    const r = cropRect(img, frame, 1, off);
    expect(r.sh).toBeCloseTo(3000);
    expect(r.sw / r.sh).toBeCloseTo(9 / 16);
    expect(r.sx + r.sw).toBeCloseTo(4000); // arrastou tudo para a esquerda: termina na borda direita
  });

  it('nunca deixa faixa vazia na moldura', () => {
    expect(clampOffset(img, frame, 1, { x: 50, y: 50 })).toEqual({ x: 0, y: 0 });
    const r = cropRect(img, frame, 2, clampOffset(img, frame, 2, { x: -99999, y: -99999 }));
    expect(r.sx + r.sw).toBeCloseTo(4000);
    expect(r.sy + r.sh).toBeCloseTo(3000);
  });
});
