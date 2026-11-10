import { defineConfig } from 'vitest/config';
import { loadEnvFile } from 'node:process';

// Usa o .env da raiz (postgres + minio do docker-compose.dev).
loadEnvFile('../../.env');

export default defineConfig({ test: { include: ['test/**/*.test.ts'], testTimeout: 60_000 } });
