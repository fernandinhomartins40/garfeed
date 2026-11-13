import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Konva from 'konva';
import { toast } from 'sonner';
import {
  AlignCenter, AlignLeft, AlignRight, ArrowLeft, BringToFront, Circle, Copy, Download, ImagePlus, Minus, Plus, Printer, QrCode,
  Redo2, Save, SendToBack, Square, Trash2, Type, Undo2,
} from 'lucide-react';
import { api, PLATE_FONTS, tagUrl, type PlateDesign, type PlateElement, type SavePlateDesignBody, type Table } from '@garfeed/shared';
import { call, errMsg } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { qk } from '@/lib/live';
import { isNative } from '@/lib/native';
import { a4Grid, draw, FONT_WEIGHTS, imageFileToDataUrl, newId, prepare, renderPng, type PlateVars } from '@/lib/plate';
import { cn, TAG_BASE_URL } from '@/lib/utils';
import logoUrl from '@/assets/logo-horizontal-cor.svg';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ErrorBox, Spinner } from '@/components/ui/misc';

type Draft = SavePlateDesignBody;
type El = PlateElement;
/** Elemento novo (sem id/posição): Omit distribuído por tipo, senão a união perde os campos próprios. */
type DistOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
type NewEl = DistOmit<El, 'id' | 'x' | 'y' | 'rotation' | 'opacity'>;
const SNAP = 1.5; // mm: distância para "grudar" no centro da arte
const SIZES = [
  { label: 'Adesivo 5 × 5 cm', w: 50, h: 50 }, { label: 'Adesivo 8 × 8 cm', w: 80, h: 80 }, { label: 'Adesivo redondo 7 cm', w: 70, h: 70 },
  { label: 'Cartão 9 × 5 cm', w: 90, h: 50 }, { label: 'Display 10 × 15 cm', w: 100, h: 150 }, { label: 'A6 (10,5 × 14,8 cm)', w: 105, h: 148 },
  { label: 'A5 (14,8 × 21 cm)', w: 148, h: 210 },
];

export function PlateEditorPage() {
  const { id } = useParams();
  const q = useQuery({ queryKey: ['plate-design', id], queryFn: () => call(api.plateDesigns.get, { params: { id: id! } }), staleTime: Infinity });
  if (q.isLoading) return <Spinner />;
  if (q.error || !q.data) return <div className="p-6"><ErrorBox error={q.error} /></div>;
  return <Editor initial={q.data} />;
}

function Editor({ initial }: { initial: PlateDesign }) {
  const nav = useNavigate();
  const qc = useQueryClient();
  const restaurant = useAuth((s) => s.restaurant);
  const tables = useQuery({ queryKey: qk.tables, queryFn: () => call(api.tables.list) });
  const active = useMemo(() => (tables.data ?? []).filter((t) => t.active), [tables.data]);
  const brand = useQuery({ queryKey: ['plate-brand'], queryFn: () => call(api.plateDesigns.brand), staleTime: 60_000 }).data;
  const swatches = useMemo(() => [...new Set([brand?.accent, brand?.dark, '#FFFFFF', '#142433', '#FE581D', '#000000'].filter((c): c is string => !!c))], [brand]);

  const [d, setD] = useState<Draft>({ name: initial.name, widthMm: initial.widthMm, heightMm: initial.heightMm, doc: initial.doc });
  const [sel, setSel] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [previewId, setPreviewId] = useState('');
  const [printing, setPrinting] = useState(false);
  const past = useRef<Draft[]>([]);
  const future = useRef<Draft[]>([]);

  const preview = active.find((t) => t.id === previewId) ?? active[0];
  const vars: PlateVars = {
    mesa: preview?.name ?? 'Mesa 1', restaurante: restaurant?.name ?? 'Restaurante',
    url: tagUrl(TAG_BASE_URL, preview?.tag?.code ?? 'GF0000'),
  };

  /** Toda mudança passa por aqui: entra no histórico (desfazer) e marca "não salvo". */
  const commit = useCallback((next: Draft | ((p: Draft) => Draft)) => {
    setD((prev) => {
      const n = typeof next === 'function' ? next(prev) : next;
      if (n === prev) return prev;
      past.current = [...past.current.slice(-60), prev];
      future.current = [];
      return n;
    });
    setDirty(true);
  }, []);
  const patchEl = useCallback((id: string, p: Partial<El>) =>
    commit((prev) => ({ ...prev, doc: { ...prev.doc, elements: prev.doc.elements.map((e) => (e.id === id ? ({ ...e, ...p } as El) : e)) } })), [commit]);
  const undo = () => { const p = past.current.pop(); if (!p) return; future.current.push(d); setD(p); setDirty(true); };
  const redo = () => { const n = future.current.pop(); if (!n) return; past.current.push(d); setD(n); setDirty(true); };

  const selected = d.doc.elements.find((e) => e.id === sel) ?? null;
  const add = (e: NewEl, pos?: { x: number; y: number }) => {
    const el = { id: newId(), rotation: 0, opacity: 1, x: (d.widthMm - e.width) / 2, y: (d.heightMm - e.height) / 2, ...pos, ...e } as El;
    commit((p) => ({ ...p, doc: { ...p.doc, elements: [...p.doc.elements, el] } }));
    setSel(el.id);
  };
  const remove = (id: string) => { commit((p) => ({ ...p, doc: { ...p.doc, elements: p.doc.elements.filter((e) => e.id !== id) } })); setSel(null); };
  const duplicate = (id: string) => {
    const e = d.doc.elements.find((x) => x.id === id);
    if (!e) return;
    const c = { ...e, id: newId(), x: e.x + 3, y: e.y + 3 };
    commit((p) => ({ ...p, doc: { ...p.doc, elements: [...p.doc.elements, c] } }));
    setSel(c.id);
  };
  const reorder = (id: string, front: boolean) => commit((p) => {
    const rest = p.doc.elements.filter((e) => e.id !== id), e = p.doc.elements.find((x) => x.id === id)!;
    return { ...p, doc: { ...p.doc, elements: front ? [...rest, e] : [e, ...rest] } };
  });

  const save = useMutation({
    mutationFn: () => {
      if (JSON.stringify(d).length > 1_900_000) throw new Error('A arte ficou pesada demais. Remova ou troque alguma imagem por uma menor.');
      return call(api.plateDesigns.update, { params: { id: initial.id }, body: d });
    },
    onSuccess: (r) => { setDirty(false); qc.setQueryData(['plate-design', initial.id], r); void qc.invalidateQueries({ queryKey: ['plate-designs'] }); toast.success('Arte salva'); },
    onError: (e) => toast.error(errMsg(e)),
  });

  // não perder alterações ao fechar a aba
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  // atalhos de teclado (fora de campos de texto)
  const keys = useRef<(e: KeyboardEvent) => void>(() => undefined);
  keys.current = (e) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, select, [contenteditable]')) return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); return; }
    if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
    if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); save.mutate(); return; }
    if (!selected) return;
    if (mod && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(selected.id); return; }
    if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); remove(selected.id); return; }
    if (e.key === 'Escape') { setSel(null); return; }
    const step = e.shiftKey ? 5 : 1;
    const mv = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] }[e.key];
    if (mv) { e.preventDefault(); patchEl(selected.id, { x: selected.x + mv[0]!, y: selected.y + mv[1]! }); }
  };
  useEffect(() => { const h = (e: KeyboardEvent) => keys.current(e); window.addEventListener('keydown', h); return () => window.removeEventListener('keydown', h); }, []);

  const pickImage = async (file?: File) => {
    if (!file) return;
    try {
      const { src, ratio } = await imageFileToDataUrl(file);
      const w = Math.min(d.widthMm * 0.6, (d.heightMm * 0.6) / ratio);
      add({ type: 'image', src, width: w, height: w * ratio });
    } catch (e) { toast.error(errMsg(e)); }
  };
  const addGarfeedLogo = async () => {
    // SVG da marca → PNG (o documento só guarda PNG/JPEG/WEBP)
    const img = new Image();
    img.src = logoUrl;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = 1200; c.height = Math.round((1200 * img.naturalHeight) / img.naturalWidth);
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
    const w = d.widthMm * 0.5;
    add({ type: 'image', src: c.toDataURL('image/png'), width: w, height: (w * c.height) / c.width });
  };

  const qrTooSmall = d.doc.elements.some((e) => e.type === 'qr' && Math.min(e.width, e.height) < 25);
  const noQr = !d.doc.elements.some((e) => e.type === 'qr');
  // algo desenhado POR CIMA do QR (depois dele na ordem das camadas) impede a leitura
  const qrCovered = d.doc.elements.some((q, qi) => q.type === 'qr' && d.doc.elements.slice(qi + 1).some((o) =>
    o.x < q.x + q.width && o.x + o.width > q.x && o.y < q.y + q.height && o.y + (o.type === 'text' ? o.fontSize * 1.2 : o.height) > q.y));

  return (
    <Swatches.Provider value={swatches}>
    <div className="flex min-h-[calc(100dvh-3.5rem)] flex-col md:min-h-dvh">
      {/* barra superior */}
      <div className="flex flex-wrap items-center gap-2 border-b border-gf-border bg-white px-3 py-2 md:px-6">
        <Button variant="ghost" size="icon" aria-label="Voltar" onClick={() => (!dirty || confirm('Sair sem salvar as alterações?')) && nav('/placas/artes')}><ArrowLeft className="h-5 w-5" /></Button>
        <Input aria-label="Nome da arte" className="h-11 w-full min-w-0 max-w-xs flex-1 font-semibold" value={d.name} maxLength={60}
          onChange={(e) => { const name = e.target.value; setD((p) => ({ ...p, name })); setDirty(true); }} />
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Desfazer (Ctrl+Z)" disabled={!past.current.length} onClick={undo}><Undo2 className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Refazer (Ctrl+Y)" disabled={!future.current.length} onClick={redo}><Redo2 className="h-5 w-5" /></Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" loading={save.isPending} disabled={!dirty || !d.name.trim()} onClick={() => save.mutate()}><Save className="h-4 w-4" />{dirty ? 'Salvar' : 'Salvo'}</Button>
          <Button onClick={() => setPrinting(true)} disabled={noQr}><Printer className="h-4 w-4" />Imprimir</Button>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        {/* ferramentas */}
        <div className="flex gap-1 overflow-x-auto border-b border-gf-border bg-white p-2 lg:w-24 lg:flex-col lg:overflow-visible lg:border-b-0 lg:border-r">
          <Tool icon={<Type />} label="Texto" onClick={() => add({ type: 'text', text: 'Seu texto', fontFamily: 'Nunito', fontSize: Math.max(4, d.widthMm / 12), fontWeight: '900', fill: '#142433', align: 'center', width: d.widthMm * 0.8, height: 10 })} />
          <Tool icon={<span className="font-heading text-base font-black">M1</span>} label="Nome da mesa" onClick={() => add({ type: 'text', text: '{mesa}', fontFamily: 'Nunito', fontSize: Math.max(5, d.widthMm / 9), fontWeight: '900', fill: '#142433', align: 'center', width: d.widthMm * 0.8, height: 12 })} />
          <Tool icon={<QrCode />} label="QR Code" onClick={() => { const s = Math.max(30, Math.min(d.widthMm, d.heightMm) * 0.55); add({ type: 'qr', fg: '#142433', bg: '#FFFFFF', width: s, height: s }); }} />
          <label className="flex min-h-14 min-w-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-card px-2 text-xs font-semibold text-gf-navy-80 hover:bg-gf-bg [&_svg]:h-5 [&_svg]:w-5">
            <ImagePlus /><span>Imagem</span>
            <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="sr-only" onChange={(e) => { void pickImage(e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          {brand?.logo && <Tool icon={<img src={brand.logo} alt="" className="h-6 w-6 rounded object-contain" />} label="Seu logo" onClick={() => { const w = Math.min(d.widthMm, d.heightMm) * 0.2; add({ type: 'image', src: brand.logo!, width: w, height: w }, { x: 4, y: 4 }); }} />}
          <Tool icon={<img src={logoUrl} alt="" className="h-4 w-auto" />} label="Logo Garfeed" onClick={() => void addGarfeedLogo()} />
          <Tool icon={<Square />} label="Retângulo" onClick={() => add({ type: 'rect', fill: '#FE581D', stroke: null, strokeWidth: 1, cornerRadius: 3, width: d.widthMm * 0.5, height: d.heightMm * 0.2 })} />
          <Tool icon={<Circle />} label="Círculo" onClick={() => { const s = Math.min(d.widthMm, d.heightMm) * 0.4; add({ type: 'ellipse', fill: '#FFE9DC', stroke: null, strokeWidth: 1, width: s, height: s }); }} />
        </div>

        {/* área da arte */}
        <div className="relative flex min-h-[55dvh] min-w-0 flex-1 flex-col bg-gf-bg">
          <Canvas d={d} vars={vars} zoom={zoom} sel={sel} onSelect={setSel} onChange={patchEl} />
          <div className="flex flex-wrap items-center justify-center gap-2 border-t border-gf-border bg-white px-3 py-2 text-sm">
            <Button variant="ghost" size="icon" aria-label="Diminuir zoom" onClick={() => setZoom((z) => Math.max(0.25, +(z - 0.25).toFixed(2)))}><Minus className="h-4 w-4" /></Button>
            <span className="w-14 text-center tabular-nums text-gf-navy-80">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" aria-label="Aumentar zoom" onClick={() => setZoom((z) => Math.min(4, +(z + 0.25).toFixed(2)))}><Plus className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => setZoom(1)}>Ajustar</Button>
            {active.length > 0 && (
              <label className="flex items-center gap-2 text-gf-navy-80">Pré-visualizar:
                <Select aria-label="Mesa da pré-visualização" className="[&_select]:h-9" value={preview?.id ?? ''} onChange={(e) => setPreviewId(e.target.value)}>
                  {active.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </label>
            )}
          </div>
        </div>

        {/* propriedades */}
        <aside className="w-full border-t border-gf-border bg-white p-4 lg:w-80 lg:overflow-y-auto lg:border-l lg:border-t-0">
          {(qrTooSmall || noQr || qrCovered) && (
            <p role="status" className="mb-4 rounded-card border border-amber-200 bg-amber-100 px-3 py-2 text-sm font-semibold text-gf-navy">
              {noQr ? 'Adicione o QR Code da mesa para poder imprimir.'
                : qrCovered ? 'Tem algo por cima do QR Code: o celular pode não conseguir ler. Afaste o elemento ou envie-o para trás.'
                : 'QR menor que 2,5 cm pode falhar na leitura. Recomendado: 3 cm ou mais.'}
            </p>
          )}
          {selected
            ? <ElementPanel e={selected} onChange={(p) => patchEl(selected.id, p)} onDelete={() => remove(selected.id)} onDuplicate={() => duplicate(selected.id)} onFront={() => reorder(selected.id, true)} onBack={() => reorder(selected.id, false)} />
            : <DocPanel d={d} onChange={commit} />}
        </aside>
      </div>

      <PrintDialog open={printing} onOpenChange={setPrinting} d={d} tables={active} restaurante={vars.restaurante} />
    </div>
    </Swatches.Provider>
  );
}

function Tool({ icon, label, onClick }: { icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="flex min-h-14 min-w-16 shrink-0 flex-col items-center justify-center gap-1 rounded-card px-2 text-xs font-semibold text-gf-navy-80 hover:bg-gf-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gf-orange [&_svg]:h-5 [&_svg]:w-5">
      {icon}<span className="whitespace-nowrap">{label}</span>
    </button>
  );
}

/** Palco Konva: desenha a arte, deixa arrastar/redimensionar/girar e devolve as mudanças em mm. */
function Canvas({ d, vars, zoom, sel, onSelect, onChange }: {
  d: Draft; vars: PlateVars; zoom: number; sel: string | null; onSelect: (id: string | null) => void; onChange: (id: string, p: Partial<El>) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const k = useRef<{ stage: Konva.Stage; art: Konva.Layer; ui: Konva.Layer; tr: Konva.Transformer; gv: Konva.Line; gh: Konva.Line } | null>(null);
  const [avail, setAvail] = useState({ w: 600, h: 500 });
  const cb = useRef({ onSelect, onChange });
  cb.current = { onSelect, onChange };

  useEffect(() => {
    const stage = new Konva.Stage({ container: host.current!, width: 10, height: 10 });
    const art = new Konva.Layer(), ui = new Konva.Layer();
    const tr = new Konva.Transformer({ rotationSnaps: [0, 45, 90, 135, 180, 225, 270, 315], anchorSize: 12, borderStroke: '#FE581D', anchorStroke: '#FE581D', anchorCornerRadius: 3, padding: 2 });
    const guide = { stroke: '#2563EB', dash: [1, 1], visible: false, listening: false };
    const gv = new Konva.Line(guide), gh = new Konva.Line(guide);
    ui.add(gv, gh, tr);
    stage.add(art, ui);
    stage.on('mousedown touchstart', (e) => { if (e.target === stage || e.target.name() === 'bg') cb.current.onSelect(null); });
    k.current = { stage, art, ui, tr, gv, gh };
    const ro = new ResizeObserver(([entry]) => entry && setAvail({ w: entry.contentRect.width, h: entry.contentRect.height }));
    ro.observe(box.current!);
    return () => { ro.disconnect(); stage.destroy(); k.current = null; };
  }, []);

  const scale = Math.max(0.5, Math.min((avail.w - 48) / d.widthMm, (avail.h - 48) / d.heightMm)) * zoom;

  useEffect(() => {
    const c = k.current;
    if (!c) return;
    let alive = true;
    void prepare(d.doc).then(() => {
      if (!alive) return;
      const { stage, art, ui, tr, gv, gh } = c;
      stage.size({ width: d.widthMm * scale, height: d.heightMm * scale });
      for (const l of [art, ui]) l.scale({ x: scale, y: scale });
      gv.strokeWidth(1 / scale); gh.strokeWidth(1 / scale);
      gv.points([d.widthMm / 2, 0, d.widthMm / 2, d.heightMm]); gh.points([0, d.heightMm / 2, d.widthMm, d.heightMm / 2]);
      art.destroyChildren();
      draw(art, d, d.doc, vars);
      for (const e of d.doc.elements) {
        const n = art.findOne(`.${e.id}`)!;
        n.draggable(true);
        n.on('mousedown touchstart', () => cb.current.onSelect(e.id));
        n.on('mouseenter', () => { stage.container().style.cursor = 'move'; });
        n.on('mouseleave', () => { stage.container().style.cursor = ''; });
        n.on('dragmove', () => {
          // gruda no centro da arte (só sem rotação, onde a caixa é a do elemento)
          if (n.rotation()) return;
          const w = e.type === 'text' ? n.width() : e.width, h = e.type === 'text' ? n.height() : e.height;
          const sx = Math.abs(n.x() + w / 2 - d.widthMm / 2) < SNAP, sy = Math.abs(n.y() + h / 2 - d.heightMm / 2) < SNAP;
          if (sx) n.x(d.widthMm / 2 - w / 2);
          if (sy) n.y(d.heightMm / 2 - h / 2);
          gv.visible(sx); gh.visible(sy);
        });
        n.on('dragend', () => { gv.visible(false); gh.visible(false); cb.current.onChange(e.id, { x: n.x(), y: n.y() }); });
        n.on('transformend', () => {
          const sx = n.scaleX(), sy = n.scaleY();
          const p: Partial<El> = { x: n.x(), y: n.y(), rotation: Math.round(n.rotation() * 10) / 10 };
          if (e.type === 'text') {
            // canto: aumenta a letra (como no Canva); lateral: só a largura da caixa
            Object.assign(p, { width: Math.max(5, e.width * sx) }, Math.abs(sy - 1) > 0.01 ? { fontSize: Math.max(1, e.fontSize * sy) } : {});
          } else {
            Object.assign(p, { width: Math.max(2, e.width * sx), height: Math.max(2, e.height * sy) });
          }
          cb.current.onChange(e.id, p);
        });
      }
      const node = sel ? art.findOne(`.${sel}`) : undefined;
      const e = d.doc.elements.find((x) => x.id === sel);
      tr.nodes(node ? [node] : []);
      tr.keepRatio(e?.type === 'qr' || e?.type === 'image');
      tr.enabledAnchors(e?.type === 'qr' || e?.type === 'image'
        ? ['top-left', 'top-right', 'bottom-left', 'bottom-right']
        : ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right']);
      ui.batchDraw(); art.batchDraw();
    });
    return () => { alive = false; };
  }, [d, vars.mesa, vars.restaurante, vars.url, scale, sel]);

  return (
    <div ref={box} className="relative min-h-0 flex-1 overflow-auto">
      <div className="grid min-h-full min-w-full place-items-center p-6" style={{ width: 'max-content' }}>
        <div ref={host} className="bg-white shadow-lg ring-1 ring-gf-border" />
      </div>
    </div>
  );
}

const Num = ({ label, value, onChange, step = 1, min, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; min?: number; max?: number }) => (
  <Field label={label}><Input type="number" inputMode="decimal" step={step} min={min} max={max} value={Math.round(value * 10) / 10}
    onChange={(e) => { const v = Number(e.target.value); if (Number.isFinite(v) && e.target.value !== '') onChange(v); }} /></Field>
);
/** Cores à mão nos seletores: as da marca do restaurante (quando houver) e as básicas. */
const Swatches = createContext<string[]>([]);
function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const sw = useContext(Swatches);
  return (
    <Field label={label}>
      <div className="flex items-center gap-2">
        <input type="color" aria-label={label} value={value} onChange={(e) => onChange(e.target.value.toUpperCase())} className="h-11 w-14 shrink-0 cursor-pointer rounded-lg border border-gf-border bg-white p-1" />
        <Input aria-label={`${label} (hex)`} value={value} maxLength={7} onChange={(e) => /^#[0-9A-Fa-f]{6}$/.test(e.target.value) && onChange(e.target.value.toUpperCase())} />
      </div>
      <span className="mt-2 flex flex-wrap gap-1.5">
        {sw.map((c) => (
          <button key={c} type="button" aria-label={`Usar a cor ${c}`} title={c} onClick={(e) => { e.preventDefault(); onChange(c); }}
            className={cn('h-8 w-8 rounded-full border-2', value.toUpperCase() === c.toUpperCase() ? 'border-gf-orange' : 'border-gf-border')} style={{ background: c }} />
        ))}
      </span>
    </Field>
  );
}
/** Cor que pode ser "sem cor" (preenchimento/contorno). */
const OptColor = ({ label, value, onChange, fallback }: { label: string; value: string | null; onChange: (v: string | null) => void; fallback: string }) => (
  <div>
    <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-gf-navy">
      <input type="checkbox" className="h-5 w-5 accent-gf-orange" checked={value !== null} onChange={(e) => onChange(e.target.checked ? fallback : null)} />{label}
    </label>
    {value !== null && <Color label={`Cor: ${label.toLowerCase()}`} value={value} onChange={onChange} />}
  </div>
);

const TYPE_LABEL: Record<El['type'], string> = { qr: 'QR Code', text: 'Texto', image: 'Imagem', rect: 'Retângulo', ellipse: 'Círculo' };

function ElementPanel({ e, onChange, onDelete, onDuplicate, onFront, onBack }: {
  e: El; onChange: (p: Partial<El>) => void; onDelete: () => void; onDuplicate: () => void; onFront: () => void; onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-heading text-xl font-black text-gf-navy">{TYPE_LABEL[e.type]}</h2>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" aria-label="Trazer para frente" onClick={onFront}><BringToFront className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Enviar para trás" onClick={onBack}><SendToBack className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Duplicar (Ctrl+D)" onClick={onDuplicate}><Copy className="h-5 w-5" /></Button>
          <Button variant="ghost" size="icon" aria-label="Excluir (Delete)" onClick={onDelete}><Trash2 className="h-5 w-5 text-danger" /></Button>
        </div>
      </div>

      {e.type === 'text' && <>
        <Field label="Texto" hint="Use {mesa} e {restaurante}: cada mesa sai com o próprio nome.">
          <Textarea rows={3} value={e.text} maxLength={300} onChange={(x) => onChange({ text: x.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Fonte">
            <Select value={e.fontFamily} onChange={(x) => { const f = x.target.value as (typeof PLATE_FONTS)[number]; onChange({ fontFamily: f, fontWeight: FONT_WEIGHTS[f].at(-1)! }); }}>
              {PLATE_FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
            </Select>
          </Field>
          <Field label="Peso">
            <Select value={e.fontWeight} onChange={(x) => onChange({ fontWeight: x.target.value as typeof e.fontWeight })}>
              {FONT_WEIGHTS[e.fontFamily].map((w) => <option key={w} value={w}>{({ '400': 'Normal', '600': 'Seminegrito', '800': 'Negrito', '900': 'Extranegrito' } as const)[w]}</option>)}
            </Select>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Num label="Tamanho (mm)" value={e.fontSize} step={0.5} min={1} max={300} onChange={(v) => onChange({ fontSize: Math.max(1, v) })} />
          <Field label="Alinhamento">
            <div className="flex gap-1">
              {([['left', AlignLeft], ['center', AlignCenter], ['right', AlignRight]] as const).map(([a, I]) => (
                <button key={a} type="button" aria-label={`Alinhar ${a === 'left' ? 'à esquerda' : a === 'right' ? 'à direita' : 'ao centro'}`} aria-pressed={e.align === a} onClick={() => onChange({ align: a })}
                  className={cn('grid h-11 flex-1 place-items-center rounded-lg border', e.align === a ? 'border-gf-orange bg-gf-orange-soft text-gf-orange' : 'border-gf-border text-gf-navy-80')}><I className="h-5 w-5" /></button>
              ))}
            </div>
          </Field>
        </div>
        <Color label="Cor do texto" value={e.fill} onChange={(fill) => onChange({ fill })} />
      </>}

      {e.type === 'qr' && <>
        <p className="text-sm text-gf-navy-80">Na impressão, cada mesa recebe o próprio QR. Mantenha cores bem contrastantes (escuro sobre claro).</p>
        <Color label="Cor do QR" value={e.fg} onChange={(fg) => onChange({ fg })} />
        <Color label="Fundo do QR" value={e.bg} onChange={(bg) => onChange({ bg })} />
      </>}

      {(e.type === 'rect' || e.type === 'ellipse') && <>
        <OptColor label="Preenchimento" value={e.fill} fallback="#FE581D" onChange={(fill) => onChange({ fill })} />
        <OptColor label="Contorno" value={e.stroke} fallback="#142433" onChange={(stroke) => onChange({ stroke })} />
        {e.stroke !== null && <Num label="Espessura do contorno (mm)" value={e.strokeWidth} step={0.5} min={0} max={50} onChange={(strokeWidth) => onChange({ strokeWidth: Math.max(0, strokeWidth) })} />}
        {e.type === 'rect' && <Num label="Arredondamento (mm)" value={e.cornerRadius} step={0.5} min={0} max={1000} onChange={(cornerRadius) => onChange({ cornerRadius: Math.max(0, cornerRadius) })} />}
      </>}

      <div className="grid grid-cols-2 gap-3">
        <Num label="X (mm)" value={e.x} onChange={(x) => onChange({ x })} />
        <Num label="Y (mm)" value={e.y} onChange={(y) => onChange({ y })} />
        <Num label="Largura (mm)" value={e.width} min={2} onChange={(width) => onChange(e.type === 'qr' ? { width: Math.max(2, width), height: Math.max(2, width) } : e.type === 'image' ? { width: Math.max(2, width), height: Math.max(2, (width * e.height) / e.width) } : { width: Math.max(2, width) })} />
        {e.type !== 'text' && e.type !== 'qr' && <Num label="Altura (mm)" value={e.height} min={2} onChange={(height) => onChange(e.type === 'image' ? { height: Math.max(2, height), width: Math.max(2, (height * e.width) / e.height) } : { height: Math.max(2, height) })} />}
        <Num label="Rotação (°)" value={e.rotation} min={-360} max={360} onChange={(rotation) => onChange({ rotation: Math.max(-360, Math.min(360, rotation)) })} />
      </div>
      <Field label={`Opacidade: ${Math.round(e.opacity * 100)}%`}>
        <input type="range" min={0.1} max={1} step={0.05} value={e.opacity} onChange={(x) => onChange({ opacity: Number(x.target.value) })} className="w-full accent-gf-orange" />
      </Field>
      <p className="text-xs text-gf-muted">Dica: arraste para mover, use as alças para redimensionar e girar. Setas movem 1 mm (Shift: 5 mm).</p>
    </div>
  );
}

function DocPanel({ d, onChange }: { d: Draft; onChange: (n: Draft) => void }) {
  const preset = SIZES.find((s) => s.w === d.widthMm && s.h === d.heightMm);
  const resize = (w: number, h: number) => onChange({ ...d, widthMm: Math.round(Math.min(420, Math.max(20, w))), heightMm: Math.round(Math.min(420, Math.max(20, h))) });
  return (
    <div className="space-y-4">
      <h2 className="font-heading text-xl font-black text-gf-navy">Arte</h2>
      <Field label="Tamanho">
        <Select value={preset ? `${preset.w}x${preset.h}` : ''} onChange={(e) => { const [w, h] = e.target.value.split('x').map(Number); if (w && h) resize(w, h); }}>
          {!preset && <option value="">Personalizado</option>}
          {SIZES.map((s) => <option key={s.label} value={`${s.w}x${s.h}`}>{s.label}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Num label="Largura (mm)" value={d.widthMm} min={20} max={420} onChange={(w) => resize(w, d.heightMm)} />
        <Num label="Altura (mm)" value={d.heightMm} min={20} max={420} onChange={(h) => resize(d.widthMm, h)} />
      </div>
      <Color label="Cor de fundo" value={d.doc.background} onChange={(background) => onChange({ ...d, doc: { ...d.doc, background } })} />
      <p className="text-sm text-gf-navy-80">Clique num elemento da arte para editar. Para adesivo redondo, use um círculo do tamanho da arte e corte no contorno.</p>
    </div>
  );
}

/** Escolhe as mesas, garante um QR para cada uma e abre a impressão (A4 com várias ou uma por página). */
function PrintDialog({ open, onOpenChange, d, tables, restaurante }: { open: boolean; onOpenChange: (o: boolean) => void; d: Draft; tables: Table[]; restaurante: string }) {
  const qc = useQueryClient();
  const [ids, setIds] = useState<Set<string>>(new Set());
  const [layout, setLayout] = useState<'a4' | 'single'>('a4');
  const [marks, setMarks] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const grid = a4Grid(d.widthMm, d.heightMm);
  const mode = grid.perPage ? layout : 'single';
  useEffect(() => { if (open) setIds(new Set(tables.map((t) => t.id))); }, [open, tables]);
  const chosen = tables.filter((t) => ids.has(t.id));
  const without = chosen.filter((t) => !t.tag).length;

  async function images() {
    setBusy('Preparando os QR Codes…');
    const tags = await call(api.tags.ensureCodes, { body: { tableIds: chosen.map((t) => t.id) } });
    void qc.invalidateQueries({ queryKey: qk.tables }); void qc.invalidateQueries({ queryKey: ['tags'] });
    const code = new Map(tags.map((t) => [t.table?.id, t.code]));
    const out: { name: string; src: string }[] = [];
    for (const [i, t] of chosen.entries()) {
      setBusy(`Gerando ${i + 1} de ${chosen.length}…`);
      out.push({ name: t.name, src: await renderPng(d, { mesa: t.name, restaurante, url: tagUrl(TAG_BASE_URL, code.get(t.id)!) }) });
    }
    return out;
  }

  async function print() {
    if (isNative()) { alert('A impressão não está disponível no app. Abra painel.garfeed.com.br em um computador para imprimir.'); return; }
    const w = window.open('', '_blank'); // abre já no clique: depois do await o navegador bloquearia o pop-up
    if (!w) { toast.error('Permita pop-ups para imprimir.'); return; }
    w.document.write('<p style="font-family:sans-serif;padding:24px">Gerando a arte das mesas…</p>');
    try {
      const imgs = await images();
      const W = d.widthMm, H = d.heightMm;
      const cut = marks ? 'outline:0.2mm dashed #9AA1AB;' : '';
      let body: string, page: string;
      if (mode === 'single') {
        page = `${W}mm ${H}mm`;
        body = imgs.map((i) => `<img src="${i.src}" alt="" style="width:${W}mm;height:${H}mm;display:block;break-after:page">`).join('');
      } else {
        const pw = grid.landscape ? 297 : 210, ph = grid.landscape ? 210 : 297;
        page = `A4 ${grid.landscape ? 'landscape' : 'portrait'}`;
        const pages: string[] = [];
        for (let p = 0; p < imgs.length; p += grid.perPage) {
          pages.push(`<div style="width:${pw}mm;height:${ph}mm;box-sizing:border-box;padding:8mm;display:grid;align-content:start;grid-template-columns:repeat(${grid.cols},${W}mm);grid-auto-rows:${H}mm;gap:4mm;break-after:page">${
            imgs.slice(p, p + grid.perPage).map((i) => `<img src="${i.src}" alt="" style="width:${W}mm;height:${H}mm;display:block;${cut}">`).join('')}</div>`);
        }
        body = pages.join('');
      }
      w.document.open();
      w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${d.name.replace(/[<&]/g, '')}</title>
        <style>@page{size:${page};margin:0}html,body{margin:0}img{image-rendering:auto}</style></head>
        <body>${body}<script>Promise.all([...document.images].map(i=>i.decode().catch(()=>0))).then(()=>print())</script></body></html>`);
      w.document.close();
      onOpenChange(false);
    } catch (e) { w.close(); toast.error(errMsg(e)); } finally { setBusy(null); }
  }

  async function download() {
    try {
      const imgs = await images();
      for (const i of imgs) {
        const a = document.createElement('a');
        a.href = i.src; a.download = `${d.name} - ${i.name}.png`.replace(/[\\/:*?"<>|]/g, '');
        a.click();
        await new Promise((r) => setTimeout(r, 250)); // o navegador baixa um de cada vez
      }
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(null); }
  }

  const all = ids.size === tables.length;
  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)} title="Imprimir" className="max-w-xl"
      description="Cada mesa sai com o próprio nome e QR Code. Na janela de impressão, use escala 100% (tamanho real)."
      footer={<>
        <Button variant="outline" disabled={!chosen.length || !!busy} onClick={() => void download()}><Download className="h-4 w-4" />Baixar PNG</Button>
        <Button disabled={!chosen.length || !!busy} loading={!!busy} onClick={() => void print()}><Printer className="h-4 w-4" />{busy ?? `Imprimir ${chosen.length} ${chosen.length === 1 ? 'mesa' : 'mesas'}`}</Button>
      </>}>
      {!tables.length ? <p className="text-gf-navy-80">Cadastre as mesas em Mesas para imprimir.</p> : <>
        <label className="mb-2 flex items-center gap-3 font-semibold text-gf-navy">
          <input type="checkbox" className="h-5 w-5 accent-gf-orange" checked={all} onChange={() => setIds(all ? new Set() : new Set(tables.map((t) => t.id)))} />Todas as mesas ({tables.length})
        </label>
        <div className="grid max-h-56 grid-cols-2 gap-1 overflow-y-auto rounded-card border border-gf-border p-2 sm:grid-cols-3">
          {tables.map((t) => (
            <label key={t.id} className="flex min-h-11 items-center gap-2 rounded-lg px-2 hover:bg-gf-bg">
              <input type="checkbox" className="h-5 w-5 shrink-0 accent-gf-orange" checked={ids.has(t.id)}
                onChange={() => setIds((s) => { const n = new Set(s); if (n.has(t.id)) n.delete(t.id); else n.add(t.id); return n; })} />
              <span className="min-w-0 truncate">{t.name}</span>
            </label>
          ))}
        </div>
        {without > 0 && <p className="mt-2 text-sm text-gf-navy-80">{without} {without === 1 ? 'mesa ainda não tem' : 'mesas ainda não têm'} placa: vão ganhar um código só QR agora (aparece em Placas).</p>}
        <fieldset className="mt-4 space-y-2">
          <legend className="mb-1 font-semibold text-gf-navy">Como imprimir</legend>
          <label className={cn('flex items-start gap-3', !grid.perPage && 'opacity-50')}>
            <input type="radio" name="layout" className="mt-1 h-5 w-5 accent-gf-orange" disabled={!grid.perPage} checked={mode === 'a4'} onChange={() => setLayout('a4')} />
            <span><b>Folha A4</b> — {grid.perPage ? `${grid.perPage} por folha, para recortar em casa` : 'a arte é maior que a folha'}</span>
          </label>
          <label className="flex items-start gap-3">
            <input type="radio" name="layout" className="mt-1 h-5 w-5 accent-gf-orange" checked={mode === 'single'} onChange={() => setLayout('single')} />
            <span><b>Uma por página</b> — no tamanho exato da arte ({d.widthMm / 10} × {d.heightMm / 10} cm), para gráfica ou impressora de etiqueta</span>
          </label>
          {mode === 'a4' && (
            <label className="flex items-center gap-3 pl-8 text-sm">
              <input type="checkbox" className="h-5 w-5 accent-gf-orange" checked={marks} onChange={(e) => setMarks(e.target.checked)} />Linha tracejada para recorte
            </label>
          )}
        </fieldset>
      </>}
    </Dialog>
  );
}
