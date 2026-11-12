// Processamento de mídia (PRD RF-16): vídeo → MP4 720×1280 H.264 (CRF 27, teto 1,2 Mbps), sem áudio, faststart + pôster JPG + thumb WebP;
// imagem → WebP (até 1080×1920) + thumb WebP. Derivados ficam na mesma pasta do original no MinIO; o original é apagado
// depois que tudo fica pronto (só ocupava espaço: nada mais o lê).
import { execFile } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, posix } from 'node:path';
import { promisify } from 'node:util';
import { PrismaClient } from '@prisma/client';
import { Client } from 'minio';
import { Redis } from 'ioredis';
import sharp from 'sharp';
import { MEDIA_LIMITS, menuCacheKey } from '@garfeed/shared';

const run = promisify(execFile);
// o cache do libvips mantém arquivos abertos (no Windows impede apagar a pasta temporária)
sharp.cache(false);
const env = process.env;

export const prisma = new PrismaClient();
export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT ?? 'localhost',
  port: Number(env.MINIO_PORT ?? 9000),
  useSSL: env.MINIO_USE_SSL === 'true',
  accessKey: env.MINIO_ROOT_USER ?? '',
  secretKey: env.MINIO_ROOT_PASSWORD ?? '',
});
export const bucket = env.MINIO_BUCKET ?? 'garfeed-media';
const publicUrl = (key: string) => `${(env.MEDIA_PUBLIC_URL ?? '').replace(/\/$/, '')}/${key}`;

/** Erro do arquivo do usuário (não adianta tentar de novo). Mensagem pt-BR vai para Media.error. */
export class MediaRejected extends Error {}

const ffmpeg = (args: string[]) => run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { maxBuffer: 10 * 1024 * 1024 });

async function probe(file: string) {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height:format=duration', '-of', 'json', file]);
  const j = JSON.parse(stdout) as { streams?: { width: number; height: number }[]; format?: { duration?: string } };
  const s = j.streams?.[0];
  if (!s) throw new MediaRejected('O arquivo não contém vídeo');
  return { width: s.width, height: s.height, durationMs: Math.round(Number(j.format?.duration ?? 0) * 1000) };
}

async function processVideo(input: string, dir: string) {
  const { durationMs } = await probe(input);
  if (durationMs > MEDIA_LIMITS.VIDEO.maxDurationMs + 500) throw new MediaRejected('Vídeo com mais de 30 segundos');
  const video = join(dir, 'video.mp4');
  const poster = join(dir, 'poster.jpg');
  await ffmpeg([
    '-i', input, '-an',
    // preenche a tela 9:16 (corta as sobras) e fixa 30 fps
    '-vf', 'scale=720:1280:force_original_aspect_ratio=increase,crop=720:1280,fps=30',
    // qualidade constante (CRF 27) com teto de 1,2 Mbps: prato parado gasta bem menos que 1,2 Mbps; GOP de 2 s para
    // começar a tocar rápido e pular sem travar; faststart = toca enquanto baixa
    '-c:v', 'libx264', '-preset', 'medium', '-profile:v', 'high', '-level', '4.0', '-pix_fmt', 'yuv420p',
    '-crf', '27', '-maxrate', '1200k', '-bufsize', '2400k', '-g', '60', '-keyint_min', '30', '-sc_threshold', '0',
    '-movflags', '+faststart', video,
  ]);
  await ffmpeg(['-ss', String(Math.min(1, durationMs / 2000)), '-i', video, '-frames:v', '1', '-q:v', '3', poster]);
  const out = await probe(video);
  return {
    files: [
      { name: 'video.mp4', path: video, type: 'video/mp4' },
      { name: 'poster.jpg', path: poster, type: 'image/jpeg' },
      { name: 'thumb.webp', path: await thumb(poster, dir), type: 'image/webp' },
    ],
    meta: out,
  };
}

async function thumb(src: string, dir: string) {
  const file = join(dir, 'thumb.webp');
  await sharp(src).resize(360, 640, { fit: 'cover' }).webp({ quality: 75 }).toFile(file);
  return file;
}

async function processImage(input: string, mimeType: string, dir: string) {
  let src = input;
  // o sharp pré-compilado não decodifica HEIC (HEVC): converte com o ffmpeg antes
  if (mimeType === 'image/heic' || mimeType === 'image/heif') {
    src = join(dir, 'heic.png');
    await ffmpeg(['-i', input, '-frames:v', '1', src]).catch(() => { throw new MediaRejected('Não foi possível ler a foto HEIC; envie em JPG'); });
  }
  const image = join(dir, 'image.webp');
  const info = await sharp(src).rotate().resize(1080, 1920, { fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toFile(image)
    .catch(() => { throw new MediaRejected('Arquivo de imagem inválido'); });
  return {
    files: [
      { name: 'image.webp', path: image, type: 'image/webp' },
      { name: 'thumb.webp', path: await thumb(image, dir), type: 'image/webp' },
    ],
    meta: { width: info.width, height: info.height, durationMs: null },
  };
}

/** Processa uma Media PROCESSING e grava READY. Erros sobem para o chamador decidir FAILED/nova tentativa. */
export async function processMedia(mediaId: string, redis?: Redis) {
  const media = await prisma.media.findUnique({ where: { id: mediaId } });
  if (!media || media.status !== 'PROCESSING') return null; // apagada ou já processada (job repetido)
  const dir = await mkdtemp(join(tmpdir(), 'garfeed-media-'));
  try {
    const input = join(dir, posix.basename(media.originalKey));
    await minio.fGetObject(bucket, media.originalKey, input);
    const { files, meta } = media.type === 'VIDEO' ? await processVideo(input, dir) : await processImage(input, media.mimeType, dir);
    const folder = posix.dirname(media.originalKey);
    const urls: Record<string, string> = {};
    for (const f of files) {
      const key = `${folder}/${f.name}`;
      await minio.fPutObject(bucket, key, f.path, { 'Content-Type': f.type, 'Cache-Control': 'public, max-age=31536000, immutable' });
      urls[f.name] = publicUrl(key);
    }
    const updated = await prisma.media.update({
      where: { id: media.id },
      data: {
        status: 'READY', error: null, width: meta.width, height: meta.height, durationMs: meta.durationMs,
        url: urls['video.mp4'] ?? urls['image.webp']!, posterUrl: urls['poster.jpg'] ?? null, thumbUrl: urls['thumb.webp']!,
      },
    });
    await redis?.del(menuCacheKey(media.restaurantId)); // item com esta mídia passa a mostrá-la no feed
    await minio.removeObject(bucket, media.originalKey).catch(() => undefined); // falhar aqui não desfaz o READY
    return { media: updated, outputBytes: (await stat(files[0]!.path)).size };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export const markFailed = (mediaId: string, error: string) =>
  prisma.media.updateMany({ where: { id: mediaId, status: 'PROCESSING' }, data: { status: 'FAILED', error } });
