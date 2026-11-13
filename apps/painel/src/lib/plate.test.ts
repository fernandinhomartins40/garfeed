import { describe, expect, it } from 'vitest';
import { PlateDoc, SavePlateDesignBody } from '@garfeed/shared';
import { a4Grid, fillVars, TEMPLATES, withBrand } from './plate';

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

  it('modelos com as cores da marca: laranja vira a principal e marinho a escura', () => {
    const t = withBrand(TEMPLATES.find((x) => x.key === 'display')!, { accent: '#1D4ED8', dark: '#1E1B4B' });
    const colors = t.doc.elements.flatMap((e) => ['fill', 'stroke', 'fg'].map((k) => (e as Record<string, unknown>)[k]).filter(Boolean));
    expect(colors).toContain('#1D4ED8');
    expect(colors).toContain('#1E1B4B');
    expect(colors).not.toContain('#FE581D');
    expect(colors).not.toContain('#142433');
    expect(withBrand(TEMPLATES[0]!, null)).toBe(TEMPLATES[0]);
  });
});
