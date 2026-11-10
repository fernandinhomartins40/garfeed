import { Client } from 'minio';
import { env } from './env';

export const minio = new Client({
  endPoint: env.MINIO_ENDPOINT,
  port: env.MINIO_PORT,
  useSSL: env.MINIO_USE_SSL,
  accessKey: env.MINIO_ROOT_USER,
  secretKey: env.MINIO_ROOT_PASSWORD,
});

export const bucket = env.MINIO_BUCKET;

/** URL pré-assinada para o painel fazer PUT direto no MinIO. */
export const presignedPut = (key: string, expiresInSec = 15 * 60) => minio.presignedPutObject(bucket, key, expiresInSec);

/** URL pública de um objeto (servido pelo Nginx com cache em produção). */
export const publicUrl = (key: string) => `${env.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
