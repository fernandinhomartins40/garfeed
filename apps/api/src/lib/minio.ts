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

// O navegador faz o PUT na origem pública da mídia (MEDIA_PUBLIC_URL = {origem}/{bucket}, path-style; em produção o Nginx
// de midia.* repassa ao MinIO mantendo o Host). A assinatura inclui o host, então assinamos com essa origem; a região fixa
// evita a consulta de região pela rede (presign vira cálculo local).
const pub = new URL(env.MEDIA_PUBLIC_URL);
const signer = new Client({
  endPoint: pub.hostname,
  port: pub.port ? Number(pub.port) : pub.protocol === 'https:' ? 443 : 80,
  useSSL: pub.protocol === 'https:',
  accessKey: env.MINIO_ROOT_USER,
  secretKey: env.MINIO_ROOT_PASSWORD,
  region: 'us-east-1',
});

/** URL pré-assinada para o painel fazer PUT direto no MinIO (pela origem pública). */
export const presignedPut = (key: string, expiresInSec = 15 * 60) => signer.presignedPutObject(bucket, key, expiresInSec);

/** URL pública de um objeto (servido pelo Nginx com cache em produção). */
export const publicUrl = (key: string) => `${env.MEDIA_PUBLIC_URL.replace(/\/$/, '')}/${key}`;
