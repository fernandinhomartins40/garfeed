// Requer docker-compose.dev (postgres + minio) e ffmpeg/ffprobe no PATH.
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { bucket, minio, prisma, processMedia } from '../src/media';

const run = promisify(execFile);
let dir = '';
let restaurantId = '';

beforeAll(async () => {
  dir = await mkdtemp(join(tmpdir(), 'garfeed-worker-test-'));
  restaurantId = (await prisma.restaurant.create({ data: { slug: `worker-${Date.now().toString(36)}`, name: 'Worker' } })).id;
});

afterAll(async () => {
  await prisma.restaurant.deleteMany({ where: { id: restaurantId } });
  await prisma.$disconnect();
  await rm(dir, { recursive: true, force: true });
});

const ffprobe = async (file: string) => {
  const { stdout } = await run('ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height', '-of', 'json', file]);
  return (JSON.parse(stdout) as { streams: { codec_type: string; codec_name: string; width?: number; height?: number }[] }).streams;
};

describe('worker de mídia', () => {
  it('vídeo 16:9 com áudio → mp4 720×1280 H.264 sem áudio, pôster JPG e thumb WebP; Media READY', async () => {
    const src = join(dir, 'in.mp4');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=3:size=1280x720:rate=30',
      '-f', 'lavfi', '-i', 'sine=duration=3', '-c:v', 'libx264', '-c:a', 'aac', '-shortest', src]);
    const key = `${restaurantId}/teste/original.mp4`;
    await minio.fPutObject(bucket, key, src, { 'Content-Type': 'video/mp4' });
    const media = await prisma.media.create({ data: { restaurantId, type: 'VIDEO', status: 'PROCESSING', mimeType: 'video/mp4', sizeBytes: 1, originalKey: key } });

    const r = await processMedia(media.id);
    expect(r?.media).toMatchObject({ status: 'READY', width: 720, height: 1280 });
    expect(r!.media.durationMs).toBeGreaterThan(2500);
    expect(r!.media.posterUrl).toMatch(/poster\.jpg$/);
    expect(r!.media.thumbUrl).toMatch(/thumb\.webp$/);

    const out = join(dir, 'out.mp4');
    await minio.fGetObject(bucket, `${restaurantId}/teste/video.mp4`, out);
    const streams = await ffprobe(out);
    expect(streams).toEqual([expect.objectContaining({ codec_type: 'video', codec_name: 'h264', width: 720, height: 1280 })]);
    const poster = await minio.statObject(bucket, `${restaurantId}/teste/poster.jpg`);
    expect(poster.size).toBeGreaterThan(1000);
    expect(poster.metaData['content-type']).toBe('image/jpeg');
    // original apagado (economia de espaço); vídeo de teste de 3 s fica bem abaixo do teto de 1,2 Mbps
    await expect(minio.statObject(bucket, key)).rejects.toThrow();
    expect((await minio.statObject(bucket, `${restaurantId}/teste/video.mp4`)).size).toBeLessThan(3 * 1_200_000 / 8 * 1.2);
  });

  it('imagem → WebP + thumb; Media READY', async () => {
    const src = join(dir, 'in.png');
    await run('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=800x600', '-frames:v', '1', src]);
    const key = `${restaurantId}/teste-img/original.png`;
    await minio.fPutObject(bucket, key, src, { 'Content-Type': 'image/png' });
    const media = await prisma.media.create({ data: { restaurantId, type: 'IMAGE', status: 'PROCESSING', mimeType: 'image/png', sizeBytes: 1, originalKey: key } });
    const r = await processMedia(media.id);
    expect(r?.media).toMatchObject({ status: 'READY', width: 800, height: 600, posterUrl: null });
    expect(r!.media.url).toMatch(/image\.webp$/);
    await expect(minio.statObject(bucket, key)).rejects.toThrow();
  });
});
