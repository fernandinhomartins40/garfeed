import { defineConfig } from 'vitest/config';
import { loadEnvFile } from 'node:process';

// Usa o .env da raiz (mesmo banco do dev; os testes criam e apagam os próprios dados).
loadEnvFile('../../.env');
process.env.NODE_ENV = 'test';

export default defineConfig({ test: { include: ['test/**/*.test.ts'], fileParallelism: false } });
