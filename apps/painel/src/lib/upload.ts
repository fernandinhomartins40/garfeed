import { useCallback, useEffect, useRef, useState } from 'react';
import { api, MEDIA_LIMITS, type Media, type MediaType } from '@garfeed/shared';
import { call, errMsg } from './api';

export type UploadPhase = 'idle' | 'uploading' | 'processing' | 'ready' | 'failed';
export type UploadState = { phase: UploadPhase; progress: number; file?: { name: string; size: number }; media?: Media; error?: string; localUrl?: string };

const videoDurationMs = (file: File) => new Promise<number>((res) => {
  const v = document.createElement('video');
  v.preload = 'metadata';
  v.onloadedmetadata = () => { res(v.duration * 1000); URL.revokeObjectURL(v.src); };
  v.onerror = () => res(0); // formato que o navegador não lê (ex.: .mov HEVC): o worker valida
  v.src = URL.createObjectURL(file);
});

/** Valida no cliente o que o servidor também valida (formato, tamanho, 30 s). */
export async function checkFile(file: File): Promise<{ type: MediaType } | { error: string }> {
  const type: MediaType = file.type.startsWith('video/') ? 'VIDEO' : 'IMAGE';
  const lim = MEDIA_LIMITS[type];
  if (!(lim.mimeTypes as readonly string[]).includes(file.type)) return { error: 'Formato não suportado. Use MP4/MOV ou JPG/PNG/WEBP/HEIC.' };
  if (file.size > lim.maxBytes) return { error: `Arquivo maior que ${lim.maxBytes / 1024 / 1024} MB.` };
  if (type === 'VIDEO' && (await videoDurationMs(file)) > MEDIA_LIMITS.VIDEO.maxDurationMs + 500) return { error: 'O vídeo deve ter até 30 s.' };
  return { type };
}

/**
 * Upload direto para a URL pré-assinada (MinIO) com progresso → /complete → polling de GET /media/:id.
 * Envio e processamento são fases separadas (P5).
 */
export function useMediaUpload(initial?: Media | null) {
  const [s, setS] = useState<UploadState>(() => (initial ? { phase: initial.status === 'READY' ? 'ready' : initial.status === 'FAILED' ? 'failed' : 'processing', progress: 100, media: initial } : { phase: 'idle', progress: 0 }));
  const xhr = useRef<XMLHttpRequest | null>(null);
  const poll = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lastFile = useRef<File | null>(null);

  const stop = () => { xhr.current?.abort(); xhr.current = null; clearTimeout(poll.current); };
  useEffect(() => stop, []);

  const watch = useCallback((id: string) => {
    const tick = async () => {
      try {
        const m = await call(api.media.get, { params: { id } });
        if (m.status === 'READY') return setS((p) => ({ ...p, phase: 'ready', media: m }));
        if (m.status === 'FAILED') return setS((p) => ({ ...p, phase: 'failed', media: m, error: m.error ?? 'Não foi possível processar o arquivo.' }));
        setS((p) => ({ ...p, media: m }));
      } catch { /* rede instável: tenta de novo */ }
      poll.current = setTimeout(() => void tick(), 2000);
    };
    void tick();
  }, []);

  // Mídia do item ainda processando ao abrir a tela.
  const initialId = initial && (initial.status === 'PROCESSING' || initial.status === 'UPLOADING') ? initial.id : null;
  useEffect(() => { if (initialId) watch(initialId); }, [initialId, watch]);

  const start = useCallback(async (file: File) => {
    stop();
    lastFile.current = file;
    const localUrl = URL.createObjectURL(file);
    const base = { file: { name: file.name, size: file.size }, localUrl };
    const chk = await checkFile(file);
    if ('error' in chk) return setS({ ...base, phase: 'failed', progress: 0, error: chk.error });
    setS({ ...base, phase: 'uploading', progress: 0 });
    try {
      const up = await call(api.media.uploadUrl, { body: { type: chk.type, mimeType: file.type, sizeBytes: file.size, fileName: file.name.slice(0, 200) } });
      await new Promise<void>((res, rej) => {
        const x = (xhr.current = new XMLHttpRequest());
        x.open('PUT', up.uploadUrl);
        x.setRequestHeader('Content-Type', file.type);
        x.upload.onprogress = (e) => e.lengthComputable && setS((p) => ({ ...p, progress: Math.round((e.loaded / e.total) * 100) }));
        x.onload = () => (x.status < 300 ? res() : rej(new Error(`Falha no envio (${x.status}).`)));
        x.onerror = () => rej(new Error('Falha de rede no envio.'));
        x.onabort = () => rej(new Error('cancelado'));
        x.send(file);
      });
      const m = await call(api.media.complete, { params: { id: up.mediaId } });
      setS((p) => ({ ...p, phase: 'processing', progress: 100, media: m }));
      watch(m.id);
    } catch (e) {
      if (errMsg(e) === 'cancelado') return;
      setS((p) => ({ ...p, phase: 'failed', error: errMsg(e) }));
    }
  }, [watch]);

  const cancel = useCallback(() => { stop(); setS({ phase: 'idle', progress: 0 }); }, []);
  const retry = useCallback(() => { if (lastFile.current) void start(lastFile.current); }, [start]);
  return { ...s, start, cancel, retry, busy: s.phase === 'uploading' || s.phase === 'processing' };
}
