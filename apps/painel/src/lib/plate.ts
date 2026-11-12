// Núcleo do editor de placas: desenha um PlateDoc numa camada Konva (editor e impressão usam o mesmo código,
// então o que se vê é o que sai impresso). Todas as medidas do documento estão em milímetros.
import Konva from 'konva';
import qrcode from 'qrcode-generator';
import type { PlateDoc, PlateElement, SavePlateDesignBody } from '@garfeed/shared';

export type PlateVars = { mesa: string; restaurante: string; url: string };

export const fillVars = (text: string, v: PlateVars) => text.replace(/\{mesa\}/gi, v.mesa).replace(/\{restaurante\}/gi, v.restaurante);

/** Pesos com arquivo de fonte carregado no painel (@fontsource): evita a fonte "falsa" do navegador. */
export const FONT_WEIGHTS = { Nunito: ['800', '900'], Inter: ['400', '600'] } as const;

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Matriz do QR (nível M). A zona de silêncio (4 módulos) fica dentro do quadrado do elemento. */
function qrModules(text: string) {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return { n: q.getModuleCount(), dark: (r: number, c: number) => q.isDark(r, c) };
}

const images = new Map<string, HTMLImageElement>();
const loadImage = (src: string) => new Promise<HTMLImageElement>((ok, fail) => {
  const hit = images.get(src);
  if (hit) return ok(hit);
  const img = new Image();
  img.onload = () => { images.set(src, img); ok(img); };
  img.onerror = () => fail(new Error('Imagem inválida'));
  img.src = src;
});

/** Espera as fontes e imagens do documento (o Konva desenha texto/imagem só uma vez). */
export async function prepare(doc: PlateDoc) {
  await Promise.all([
    ...doc.elements.filter((e) => e.type === 'image').map((e) => loadImage(e.src).catch(() => undefined)),
    ...doc.elements.filter((e) => e.type === 'text').map((e) => document.fonts.load(`${e.fontWeight} 20px ${e.fontFamily}`).catch(() => undefined)),
  ]);
}

/** Cria o nó Konva de um elemento (com `name` = id do elemento). Imagens precisam ter passado por prepare(). */
export function toNode(e: PlateElement, v: PlateVars): Konva.Shape {
  const base = { name: e.id, x: e.x, y: e.y, rotation: e.rotation, opacity: e.opacity };
  switch (e.type) {
    case 'qr': {
      const m = qrModules(v.url);
      return new Konva.Shape({
        ...base, width: e.width, height: e.height,
        sceneFunc: (ctx, shape) => {
          const w = shape.width(), h = shape.height(), cell = Math.min(w, h) / (m.n + 8);
          ctx.fillStyle = e.bg; ctx.fillRect(0, 0, w, h);
          ctx.fillStyle = e.fg;
          const ox = (w - cell * m.n) / 2, oy = (h - cell * m.n) / 2;
          for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
            // +0.02 mm de sobreposição: sem frestas brancas entre módulos ao ampliar
            if (m.dark(r, c)) ctx.fillRect(ox + c * cell, oy + r * cell, cell + 0.02, cell + 0.02);
          }
        },
        hitFunc: (ctx, shape) => { ctx.beginPath(); ctx.rect(0, 0, shape.width(), shape.height()); ctx.closePath(); ctx.fillStrokeShape(shape); },
      });
    }
    case 'text':
      return new Konva.Text({
        ...base, width: e.width, text: fillVars(e.text, v), fontFamily: e.fontFamily, fontSize: e.fontSize,
        fontStyle: e.fontWeight, fill: e.fill, align: e.align, lineHeight: 1.15, wrap: 'word',
      });
    case 'image':
      return new Konva.Image({ ...base, width: e.width, height: e.height, image: images.get(e.src) });
    case 'rect':
      return new Konva.Rect({
        ...base, width: e.width, height: e.height, cornerRadius: e.cornerRadius,
        fill: e.fill ?? undefined, stroke: e.stroke ?? undefined, strokeWidth: e.stroke ? e.strokeWidth : 0, hitStrokeWidth: 4,
      });
    case 'ellipse':
      // Konva.Ellipse é centrado: o offset mantém x/y como canto superior esquerdo, igual aos outros elementos
      return new Konva.Ellipse({
        ...base, radiusX: e.width / 2, radiusY: e.height / 2, offsetX: -e.width / 2, offsetY: -e.height / 2,
        fill: e.fill ?? undefined, stroke: e.stroke ?? undefined, strokeWidth: e.stroke ? e.strokeWidth : 0, hitStrokeWidth: 4,
      });
  }
}

/** Fundo + elementos numa camada (o fundo se chama "bg" e não é selecionável). */
export function draw(layer: Konva.Layer, size: { widthMm: number; heightMm: number }, doc: PlateDoc, v: PlateVars) {
  layer.add(new Konva.Rect({ name: 'bg', x: 0, y: 0, width: size.widthMm, height: size.heightMm, fill: doc.background }));
  for (const e of doc.elements) layer.add(toNode(e, v));
}

/** PNG da arte em `dpi` (300 = qualidade de gráfica). Usa um palco fora da tela, 1 px = 1 mm. */
export async function renderPng(d: Pick<SavePlateDesignBody, 'widthMm' | 'heightMm' | 'doc'>, v: PlateVars, dpi = 300) {
  await prepare(d.doc);
  const box = document.createElement('div');
  const stage = new Konva.Stage({ container: box, width: d.widthMm, height: d.heightMm });
  const layer = new Konva.Layer();
  stage.add(layer);
  draw(layer, d, d.doc, v);
  const url = stage.toDataURL({ pixelRatio: dpi / 25.4, mimeType: 'image/png' });
  stage.destroy();
  return url;
}

/** Quantas artes cabem numa folha A4 (margem 8 mm, 4 mm entre elas). Gira a folha se couber mais deitada. */
export function a4Grid(widthMm: number, heightMm: number) {
  const fit = (pw: number, ph: number) => ({
    cols: Math.max(0, Math.floor((pw - 16 + 4) / (widthMm + 4))),
    rows: Math.max(0, Math.floor((ph - 16 + 4) / (heightMm + 4))),
  });
  const p = fit(210, 297), l = fit(297, 210);
  const land = l.cols * l.rows > p.cols * p.rows;
  const g = land ? l : p;
  return { ...g, perPage: g.cols * g.rows, landscape: land };
}

/** Lê uma imagem do computador e reduz (máx. 1400 px) para caber no documento. */
export async function imageFileToDataUrl(file: File): Promise<{ src: string; ratio: number }> {
  const src = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, fail) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => fail(new Error('Não foi possível abrir a imagem.')); i.src = src; });
    for (const max of [1400, 1000, 700]) {
      const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * k); c.height = Math.round(img.naturalHeight * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      // PNG mantém transparência (logos); JPEG para fotos
      const out = file.type === 'image/png' || file.type === 'image/svg+xml' ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', 0.85);
      if (out.length < 1_150_000) return { src: out, ratio: img.naturalHeight / img.naturalWidth };
    }
    throw new Error('Imagem grande demais. Use uma imagem menor.');
  } finally { URL.revokeObjectURL(src); }
}

// ---------- Modelos prontos ----------
const NAVY = '#142433', ORANGE = '#FE581D', WHITE = '#FFFFFF', CREAM = '#FFF8F2';
const el = <T extends PlateElement['type']>(e: Omit<Extract<PlateElement, { type: T }>, 'id' | 'rotation' | 'opacity'> & { type: T }) =>
  ({ id: newId(), rotation: 0, opacity: 1, ...e }) as unknown as PlateElement;
const text = (t: string, x: number, y: number, width: number, fontSize: number, o: Partial<Extract<PlateElement, { type: 'text' }>> = {}) =>
  el({ type: 'text', text: t, x, y, width, height: fontSize * 1.2, fontSize, fontFamily: 'Nunito', fontWeight: '900', fill: NAVY, align: 'center', ...o } as never);

export type PlateTemplate = { key: string; label: string; hint: string } & SavePlateDesignBody;
export const TEMPLATES: PlateTemplate[] = [
  {
    key: 'adesivo-quadrado', label: 'Adesivo quadrado', hint: '8 × 8 cm', name: 'Adesivo quadrado', widthMm: 80, heightMm: 80,
    doc: { background: WHITE, elements: [
      el({ type: 'rect', x: 2, y: 2, width: 76, height: 76, cornerRadius: 6, fill: null, stroke: ORANGE, strokeWidth: 1.5 }),
      text('{mesa}', 4, 6, 72, 9),
      el({ type: 'qr', x: 17, y: 17, width: 46, height: 46, fg: NAVY, bg: WHITE }),
      text('Aponte a câmera e peça pelo cardápio', 6, 65, 68, 3.6, { fontFamily: 'Inter', fontWeight: '600' }),
    ] },
  },
  {
    key: 'adesivo-redondo', label: 'Adesivo redondo', hint: '7 cm de diâmetro', name: 'Adesivo redondo', widthMm: 70, heightMm: 70,
    doc: { background: WHITE, elements: [
      el({ type: 'ellipse', x: 0, y: 0, width: 70, height: 70, fill: NAVY, stroke: null, strokeWidth: 0 }),
      text('{mesa}', 10, 7, 50, 6.5, { fill: WHITE }),
      el({ type: 'qr', x: 18, y: 17, width: 34, height: 34, fg: NAVY, bg: WHITE }),
      text('CARDÁPIO DIGITAL', 12, 54, 46, 3.4, { fill: ORANGE }),
    ] },
  },
  {
    key: 'display', label: 'Display de mesa', hint: '10 × 15 cm (vertical)', name: 'Display de mesa', widthMm: 100, heightMm: 150,
    doc: { background: CREAM, elements: [
      el({ type: 'rect', x: 0, y: 0, width: 100, height: 30, cornerRadius: 0, fill: ORANGE, stroke: null, strokeWidth: 0 }),
      text('{restaurante}', 6, 10, 88, 8, { fill: WHITE }),
      text('{mesa}', 6, 38, 88, 13),
      el({ type: 'qr', x: 20, y: 60, width: 60, height: 60, fg: NAVY, bg: WHITE }),
      text('Aponte a câmera para ver o cardápio, pedir e chamar o garçom', 10, 126, 80, 4.2, { fontFamily: 'Inter', fontWeight: '600' }),
    ] },
  },
  {
    key: 'cartao', label: 'Cartão de mesa', hint: '9 × 5 cm (deitado)', name: 'Cartão de mesa', widthMm: 90, heightMm: 50,
    doc: { background: WHITE, elements: [
      el({ type: 'rect', x: 0, y: 0, width: 36, height: 50, cornerRadius: 0, fill: NAVY, stroke: null, strokeWidth: 0 }),
      text('{mesa}', 2, 18, 32, 7, { fill: WHITE }),
      el({ type: 'qr', x: 42, y: 5, width: 40, height: 40, fg: NAVY, bg: WHITE }),
    ] },
  },
  { key: 'branco', label: 'Em branco', hint: 'Você escolhe o tamanho', name: 'Arte em branco', widthMm: 100, heightMm: 100, doc: { background: WHITE, elements: [] } },
];
