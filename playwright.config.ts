// E2E (pnpm e2e) contra o stack dev: precisa do docker dev (postgres/redis/minio) + migrate + seed.
// Sobe API, painel e cardápio próprios em portas separadas (3100/5183/5184) para não colidir com um `pnpm dev` aberto.
import { defineConfig } from '@playwright/test';
import { API, CARDAPIO, PAINEL } from './e2e/urls';
const vite = { VITE_API_URL: API };

export default defineConfig({
  testDir: 'e2e',
  workers: 1, // os testes compartilham a Mesa 7 e o cardápio do seed
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never' }]],
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  use: { locale: 'pt-BR', timezoneId: 'America/Sao_Paulo', trace: 'retain-on-failure' },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: [
    {
      command: 'pnpm exec tsx --env-file=../../.env src/index.ts',
      cwd: 'apps/api',
      url: `${API}/health`,
      env: { API_PORT: '3100', CORS_ORIGINS: `${PAINEL},${CARDAPIO}`, LOG_LEVEL: 'warn' },
      reuseExistingServer: false,
      timeout: 180_000,
    },
    { command: 'pnpm exec vite --port 5183 --strictPort', cwd: 'apps/painel', url: PAINEL, env: vite, reuseExistingServer: false, timeout: 180_000 },
    { command: 'pnpm exec vite --port 5184 --strictPort', cwd: 'apps/cardapio', url: CARDAPIO, env: vite, reuseExistingServer: false, timeout: 180_000 },
  ],
});
