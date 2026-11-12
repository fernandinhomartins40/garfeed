import { useEffect, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { Button } from './ui/button';
import { Dialog } from './ui/dialog';

/** Corte em proporção fixa + compressão no navegador: toda foto do cardápio chega no mesmo formato. */
export type CropSpec = { aspect: number; outW: number; outH: number; mime: 'image/jpeg' | 'image/png'; label: string };
export const CROP_ITEM: CropSpec = { aspect: 9 / 16, outW: 1080, outH: 1920, mime: 'image/jpeg', label: 'Formato do cardápio (tela cheia, vertical)' };
export const CROP_LOGO: CropSpec = { aspect: 1, outW: 800, outH: 800, mime: 'image/png', label: 'Logo quadrado' };

/** Navegadores fora do Safari não abrem HEIC: nesses casos a foto vai inteira e o servidor converte. */
export const canCrop = (f: File) => f.type.startsWith('image/') && !/heic|heif/.test(f.type);

/** Retângulo da imagem original que cabe na moldura (o que vai para o arquivo final). */
export function cropRect(img: { w: number; h: number }, frame: { w: number; h: number }, zoom: number, off: { x: number; y: number }) {
  const s = Math.max(frame.w / img.w, frame.h / img.h) * zoom;
  return { sx: -off.x / s, sy: -off.y / s, sw: frame.w / s, sh: frame.h / s, scale: s };
}
/** Mantém a imagem cobrindo a moldura inteira (sem faixas vazias). */
export function clampOffset(img: { w: number; h: number }, frame: { w: number; h: number }, zoom: number, off: { x: number; y: number }) {
  const s = Math.max(frame.w / img.w, frame.h / img.h) * zoom;
  return { x: Math.min(0, Math.max(frame.w - img.w * s, off.x)), y: Math.min(0, Math.max(frame.h - img.h * s, off.y)) };
}

export function ImageCropDialog({ file, spec, onDone, onCancel }: { file: File | null; spec: CropSpec; onDone: (f: File) => void; onCancel: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const drag = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  // moldura na tela: até 300 px de largura e 56% da altura da janela
  const fh = Math.min(typeof window === 'undefined' ? 480 : window.innerHeight * 0.56, 300 / spec.aspect);
  const frame = { w: Math.round(fh * spec.aspect), h: Math.round(fh) };

  useEffect(() => {
    if (!file) return;
    const u = URL.createObjectURL(file);
    setUrl(u); setImg(null); setZoom(1);
    const i = new Image();
    i.onload = () => {
      setImg(i);
      const s = Math.max(frame.w / i.naturalWidth, frame.h / i.naturalHeight);
      setOff({ x: (frame.w - i.naturalWidth * s) / 2, y: (frame.h - i.naturalHeight * s) / 2 }); // centralizada
    };
    i.onerror = () => onDone(file); // formato que o navegador não abre: segue inteira, o servidor ajusta
    i.src = u;
    return () => URL.revokeObjectURL(u);
  }, [file]);

  const dims = img ? { w: img.naturalWidth, h: img.naturalHeight } : { w: 1, h: 1 };
  const setZoomKeep = (z: number) => {
    // zoom em torno do centro da moldura
    const nz = Math.min(4, Math.max(1, z));
    const r = cropRect(dims, frame, zoom, off), cx = r.sx + r.sw / 2, cy = r.sy + r.sh / 2;
    const s = Math.max(frame.w / dims.w, frame.h / dims.h) * nz;
    setOff(clampOffset(dims, frame, nz, { x: frame.w / 2 - cx * s, y: frame.h / 2 - cy * s }));
    setZoom(nz);
  };
  const onDown = (e: RPointerEvent) => { (e.target as Element).setPointerCapture(e.pointerId); drag.current = { x: e.clientX, y: e.clientY, ox: off.x, oy: off.y }; };
  const onMove = (e: RPointerEvent) => {
    const d = drag.current;
    if (d) setOff(clampOffset(dims, frame, zoom, { x: d.ox + e.clientX - d.x, y: d.oy + e.clientY - d.y }));
  };

  async function done() {
    if (!img || !file) return;
    setBusy(true);
    const r = cropRect(dims, frame, zoom, off);
    // não amplia além do original: foto pequena sai só cortada, sem ficar borrada
    const W = Math.round(Math.min(spec.outW, r.sw)), H = Math.round(W / spec.aspect);
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    if (spec.mime === 'image/jpeg') { ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H); } // PNG transparente vira fundo branco no JPEG
    ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, 0, 0, W, H);
    const blob = await new Promise<Blob | null>((ok) => c.toBlob(ok, spec.mime, 0.85));
    setBusy(false);
    if (!blob) return onDone(file);
    const ext = spec.mime === 'image/png' ? 'png' : 'jpg';
    onDone(new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'foto'}.${ext}`, { type: spec.mime }));
  }

  const r = cropRect(dims, frame, zoom, off);
  return (
    <Dialog open={!!file} onOpenChange={(o) => !o && onCancel()} title="Ajustar foto" description={`${spec.label}. Arraste para posicionar e use o zoom.`} className="max-w-md"
      footer={<><Button variant="outline" onClick={onCancel}>Cancelar</Button><Button loading={busy} disabled={!img} onClick={() => void done()}>Usar esta foto</Button></>}>
      <div className="flex flex-col items-center gap-4">
        <div className="relative touch-none select-none overflow-hidden rounded-card bg-gf-navy ring-2 ring-gf-orange" style={{ width: frame.w, height: frame.h }}
          onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
          onWheel={(e) => setZoomKeep(zoom * (e.deltaY < 0 ? 1.08 : 1 / 1.08))}>
          {url && img && (
            <img src={url} alt="" draggable={false} className="pointer-events-none absolute left-0 top-0 max-w-none cursor-move"
              style={{ width: dims.w * r.scale, height: dims.h * r.scale, transform: `translate(${off.x}px, ${off.y}px)` }} />
          )}
          {/* terços: ajuda a centralizar o prato */}
          <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3">
            {Array.from({ length: 9 }, (_, i) => <span key={i} className="border border-white/20" />)}
          </div>
        </div>
        <div className="flex w-full items-center gap-3">
          <Button variant="ghost" size="icon" aria-label="Diminuir zoom" onClick={() => setZoomKeep(zoom - 0.2)}><Minus className="h-5 w-5" /></Button>
          <input type="range" aria-label="Zoom" min={1} max={4} step={0.01} value={zoom} onChange={(e) => setZoomKeep(Number(e.target.value))} className="w-full accent-gf-orange" />
          <Button variant="ghost" size="icon" aria-label="Aumentar zoom" onClick={() => setZoomKeep(zoom + 0.2)}><Plus className="h-5 w-5" /></Button>
        </div>
      </div>
    </Dialog>
  );
}
