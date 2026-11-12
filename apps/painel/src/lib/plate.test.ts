import { describe, expect, it } from 'vitest';
import { PlateDoc, SavePlateDesignBody } from '@garfeed/shared';
import { a4Grid, fillVars, TEMPLATES } from './plate';

describe('editor de placas', () => {
  it('troca as variáveis do texto', () => {
    expect(fillVars('{Mesa} · {restaurante}', { mesa: 'Mesa 7', restaurante: 'Brasa & Pão', url: '' })).toBe('Mesa 7 · Brasa & Pão');
  });

  it('calcula quantas artes cabem no A4 e gira a folha quando cabe mais', () => {
    expect(a4Grid(80, 80)).toMatchObject({ cols: 2, rows: 3, perPage: 6, landscape: false });
    expect(a4Grid(100, 150)).toMatchObject({ perPage: 2 }); // 2 deitadas na folha horizontal
    expect(a4Grid(90, 50)).toMatchObject({ cols: 2, rows: 5, perPage: 10 });
    expect(a4Grid(300, 300).perPage).toBe(0); // maior que a folha: imprime uma por página
  });

  it('todos os modelos prontos passam na validação da API e têm QR', () => {
    for (const t of TEMPLATES) {
      expect(SavePlateDesignBody.safeParse(t).success, t.key).toBe(true);
      expect(PlateDoc.parse(t.doc).elements.some((e) => e.type === 'qr') || t.key === 'branco', t.key).toBe(true);
    }
  });
});
