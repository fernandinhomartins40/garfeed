// Fluxos críticos do MVP (PRD §10 B e §11) com navegador real: cardápio do cliente + painel em tempo real.
import { expect, test, type Browser, type Page } from '@playwright/test';
import { PASSWORD, setSoldOut, token, USERS } from './api';
import { API, CARDAPIO, PAINEL } from './urls';

const MESA = 'GF0007';
const mobile = { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true };

async function painel(browser: Browser, email: string) {
  const page = await (await browser.newContext({ viewport: { width: 1366, height: 900 } })).newPage();
  await page.goto(`${PAINEL}/login`);
  await page.locator('#email').fill(email);
  await page.locator('#password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Entrar', exact: true }).click();
  await expect(page).toHaveURL(/\/ao-vivo$/, { timeout: 30_000 }); // argon2 + 1ª compilação do Vite
  return page;
}

async function cliente(browser: Browser, code = MESA) {
  const page = await (await browser.newContext(mobile)).newPage();
  await page.goto(`${CARDAPIO}/${code}`);
  return page;
}

async function abrirFeed(page: Page) {
  await page.getByRole('button', { name: 'Ver cardápio' }).click();
  await expect(page.getByRole('region', { name: 'Smash Duplo Cheddar' })).toBeVisible();
}

const passoAtual = (page: Page) => page.locator('ol[aria-label="Andamento do pedido"] li[aria-current="step"]');

test('fluxo B: cliente pede com opcional, painel recebe em tempo real e conduz até Entregue', async ({ browser }) => {
  const staff = await painel(browser, USERS.manager);
  const guest = await cliente(browser);
  await expect(guest.getByText('Mesa 7')).toBeVisible();
  await abrirFeed(guest);

  await guest.getByRole('button', { name: 'Adicionar Smash Duplo Cheddar' }).click();
  const sheet = guest.getByRole('dialog', { name: 'Personalizar pedido' });
  await sheet.getByLabel('Ao ponto').check();
  await sheet.getByLabel('Bacon').check();
  await sheet.getByRole('button', { name: /^Adicionar · R\$\s?37,90$/ }).click();
  await guest.getByRole('button', { name: /Ver pedido · 1 item · R\$\s?37,90/ }).click();
  await guest.locator('#nome').fill('E2E Fluxo B');
  await guest.getByRole('button', { name: 'Enviar pedido' }).click();
  const t0 = Date.now();
  await expect(guest.getByRole('heading', { name: 'Pedido enviado!' })).toBeVisible();
  await expect(passoAtual(guest)).toContainText('Enviado');

  // RNF: pedido aparece no painel em < 2 s (Socket.io), sem recarregar
  const card = staff.locator('article').filter({ hasText: 'E2E Fluxo B' });
  await expect(card).toBeVisible({ timeout: 2_000 });
  console.log(`pedido→painel: ${Date.now() - t0} ms`);
  await expect(card).toContainText('Mesa 7');
  await expect(card).toContainText('Smash Duplo Cheddar');
  await expect(card).toContainText('Ao ponto, Bacon');

  await card.getByRole('button', { name: 'Aceitar' }).click();
  await expect(passoAtual(guest)).toContainText('Confirmado');
  await card.getByRole('button', { name: 'Iniciar preparo' }).click();
  await expect(passoAtual(guest)).toContainText('Em preparo');
  await card.getByRole('button', { name: 'Pronto' }).click();
  await expect(passoAtual(guest)).toContainText('Pronto');
  await card.getByRole('button', { name: 'Entregue' }).click();
  await expect(card).toHaveCount(0);
  await expect(passoAtual(guest)).toHaveCount(0); // todos os passos concluídos

  const me = await (await guest.request.get(`${API}/public/sessions/me`)).json();
  expect(me.orders.at(-1)).toMatchObject({ status: 'DELIVERED', customerName: 'E2E Fluxo B', totalCents: 3790 });
});

test('chamar garçom: painel recebe e a mesa fica bloqueada por 60 s', async ({ browser }) => {
  const staff = await painel(browser, USERS.manager);
  const guest = await cliente(browser);
  await abrirFeed(guest);
  await guest.getByRole('button', { name: 'Mesa 7 — abrir menu da mesa' }).click();
  await guest.getByRole('button', { name: 'Chamar garçom' }).click();

  const dlg = guest.getByRole('alertdialog');
  await expect(dlg).toContainText('Garçom a caminho da Mesa 7');
  await expect(dlg).toContainText(/Você pode chamar de novo em (60|59|58) s/);
  await expect(dlg.getByRole('button', { name: 'Chamar novamente' })).toBeDisabled();

  // o bloqueio é do servidor (não só da tela): repetir direto na API dá 429
  const again = await guest.request.post(`${API}/public/calls`, { data: { type: 'WAITER' } });
  expect(again.status()).toBe(429);
  const body = await again.json();
  expect(body.error.code).toBe('CALL_COOLDOWN');
  expect(body.error.retryAfterSec).toBeGreaterThan(50);
  expect(body.error.retryAfterSec).toBeLessThanOrEqual(60);

  // regex com "·": o toast "Mesa 7 chamou o garçom" não casa
  const faixa = staff.locator('p', { hasText: /^Mesa 7 · Chamou o garçom/ }).locator('..');
  await expect(faixa).toBeVisible();
  await faixa.getByRole('button', { name: 'Atendido' }).click();
  await expect(faixa).toHaveCount(0);
});

test('esgotado no painel chega ao feed aberto em < 3 s', async ({ browser }) => {
  const owner = await token(USERS.manager);
  const guest = await cliente(browser);
  await abrirFeed(guest);
  await expect(guest.getByRole('button', { name: 'Adicionar Batata Rústica com Bacon' })).toBeEnabled();
  try {
    const t0 = Date.now(); // inclui o GET+PATCH na API
    await setSoldOut(owner, 'Batata Rústica com Bacon', true);
    await expect(guest.getByRole('button', { name: 'Batata Rústica com Bacon esgotado' })).toBeDisabled({ timeout: 3_000 });
    console.log(`esgotado→feed: ${Date.now() - t0} ms`);
  } finally {
    await setSoldOut(owner, 'Batata Rústica com Bacon', false);
  }
  await expect(guest.getByRole('button', { name: 'Adicionar Batata Rústica com Bacon' })).toBeEnabled({ timeout: 3_000 });
});

test('placa não vinculada mostra "não ativada" (M1)', async ({ browser }) => {
  const guest = await cliente(browser, 'GF0024');
  await expect(guest.getByRole('heading', { name: 'Esta mesa ainda não foi ativada' })).toBeVisible();
});

test('WAITER não acessa o cardápio do painel', async ({ browser }) => {
  const staff = await painel(browser, USERS.waiter);
  await expect(staff.getByRole('link', { name: 'Cardápio' })).toHaveCount(0);
  await staff.goto(`${PAINEL}/cardapio`);
  await expect(staff).toHaveURL(/\/ao-vivo$/);
  await staff.goto(`${PAINEL}/configuracoes`);
  await expect(staff).toHaveURL(/\/ao-vivo$/);
  const r = await fetch(`${API}/menu/items`, { headers: { authorization: `Bearer ${await token(USERS.waiter)}` } });
  expect(r.status).toBe(403);
});
