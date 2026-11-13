/* global process, URL, fetch, setTimeout, console */
// Seed do cardápio de demonstração pela API (mesmo caminho do painel: upload para o MinIO → worker → READY).
// Idempotente: categorias, opcionais e itens são casados pelo nome; mídia só é enviada para item sem mídia
// (ou para todos com --refazer-midia).
//
// Uso (na raiz do repo):
//   DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/demo/cardapio-demo.mjs [--api=https://api.garfeed.com.br] [--refazer-midia]
//   (ou DEMO_TOKEN=<token de acesso do dono> no lugar de e-mail/senha)
// Fotos: docs/demo-cardapio/fotos/<foto>.jpg|png|webp  (lista em docs/demo-cardapio/produtos.json)
// Vídeos: docs/demo-cardapio/videos/<foto>.mp4 se existir; senão, para itens com "video": true, gera um clipe de 6 s
// a partir da foto (zoom lento) com o ffmpeg — serve para demonstrar e testar o processamento de vídeo.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const arg = (k) => process.argv.find((a) => a.startsWith(`--${k}=`))?.split('=')[1];
const API = (arg('api') ?? 'https://api.garfeed.com.br').replace(/\/$/, '');
const REDO = process.argv.includes('--refazer-midia');
/** --somente=foto1,foto2: limita a reenviar a mídia só desses produtos (com --refazer-midia). */
const ONLY = arg('somente')?.split(',');
const { DEMO_EMAIL, DEMO_PASSWORD, DEMO_TOKEN } = process.env;
if (!DEMO_TOKEN && (!DEMO_EMAIL || !DEMO_PASSWORD)) throw new Error('Defina DEMO_EMAIL e DEMO_PASSWORD (ou DEMO_TOKEN, token de acesso do dono)');
const ROOT = new URL('../../', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const DIR = join(ROOT, 'docs/demo-cardapio');
const data = JSON.parse(readFileSync(join(DIR, 'produtos.json'), 'utf8'));
const tmp = mkdtempSync(join(tmpdir(), 'garfeed-demo-'));

let token = '';
/** fetch que tenta de novo se a conexão ociosa foi fechada pelo servidor (ffmpeg demora mais que o keep-alive). */
async function http(url, init) {
  try { return await fetch(url, init); } catch (e) {
    if (e?.cause?.code !== 'ECONNRESET' && e?.cause?.code !== 'UND_ERR_SOCKET') throw e;
    return fetch(url, init);
  }
}
async function call(method, path, body) {
  const r = await http(API + path, {
    method, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { 'content-type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`${method} ${path}: ${r.status} ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : undefined;
}

const MIME = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', mp4: 'video/mp4' };
const findFile = (dir, base, exts) => exts.map((e) => join(DIR, dir, `${base}.${e}`)).find((f) => existsSync(f));

/** Sobe o arquivo como o painel faz e espera o worker deixar READY. Devolve a mídia e os tamanhos. */
async function upload(file, type) {
  const buf = readFileSync(file);
  const mimeType = MIME[file.split('.').pop().toLowerCase()];
  const { mediaId, uploadUrl } = await call('POST', '/media/upload-url', { type, mimeType, sizeBytes: buf.length, fileName: file.split(/[\\/]/).pop() });
  const put = await http(uploadUrl, { method: 'PUT', headers: { 'content-type': mimeType }, body: buf });
  if (!put.ok) throw new Error(`envio para o storage falhou: ${put.status}`);
  await call('POST', `/media/${mediaId}/complete`);
  for (let i = 0; i < 120; i++) {
    const m = await call('GET', `/media/${mediaId}`);
    if (m.status === 'READY') {
      const out = await http(m.url, { method: 'HEAD' });
      return { media: m, before: buf.length, after: Number(out.headers.get('content-length') ?? 0), ok: out.ok };
    }
    if (m.status === 'FAILED') throw new Error(`processamento falhou: ${m.error}`);
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error('mídia não ficou pronta em 4 min');
}

/** Clipe vertical de 6 s com zoom lento a partir da foto (só para a demonstração). */
function clipFromPhoto(photo, slug) {
  const out = join(tmp, `${slug}.mp4`);
  // zoompan arredonda a posição para pixels inteiros (treme); ampliar 4× antes deixa o passo 4× menor que 1 px na saída.
  // Zoom em onda (aproxima e volta): o loop do feed emenda sem pulo.
  execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', photo,
    '-vf', "scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,scale=4320:7680:flags=lanczos,zoompan=z='1+0.06*(1-cos(2*PI*on/180))/2':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=180:s=1080x1920:fps=30",
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-b:v', '8M', out]);
  return out;
}

const kb = (n) => `${Math.round(n / 1024)} KB`;
try {
  token = DEMO_TOKEN || (await call('POST', '/auth/login', { email: DEMO_EMAIL, password: DEMO_PASSWORD })).accessToken;
  console.log(`API ${API} — entrei como dono do restaurante`);

  // categorias na ordem do arquivo
  let cats = await call('GET', '/menu/categories');
  for (const c of data.categorias) if (!cats.some((x) => x.name === c.nome)) await call('POST', '/menu/categories', { name: c.nome, sector: c.setor });
  cats = await call('GET', '/menu/categories');
  const catOrder = [...data.categorias.map((c) => cats.find((x) => x.name === c.nome).id), ...cats.filter((x) => !data.categorias.some((c) => c.nome === x.name)).map((x) => x.id)];
  await call('PUT', '/menu/categories/order', { ids: catOrder });
  const catId = (n) => cats.find((x) => x.name === n).id;

  // grupos de opcionais (atualiza se já existir)
  let groups = await call('GET', '/menu/option-groups');
  for (const g of data.opcionais) {
    const body = { name: g.nome, min: g.min, max: g.max, options: g.opcoes.map(([name, priceCents]) => ({ name, priceCents })) };
    const have = groups.find((x) => x.name === g.nome);
    await call(have ? 'PUT' : 'POST', have ? `/menu/option-groups/${have.id}` : '/menu/option-groups', body);
  }
  groups = await call('GET', '/menu/option-groups');
  const groupId = (n) => groups.find((x) => x.name === n).id;

  // itens
  const items = await call('GET', '/menu/items');
  const report = [];
  for (const p of data.produtos) {
    const have = items.find((x) => x.name === p.nome);
    const body = {
      categoryId: catId(p.categoria), name: p.nome, description: p.descricao, priceCents: p.preco, promoPriceCents: p.promo ?? null,
      badges: p.badges ?? [], optionGroupIds: (p.opcionais ?? []).map(groupId), visible: true, soldOut: false,
    };
    const photo = findFile('fotos', p.foto, ['jpg', 'jpeg', 'png', 'webp']);
    const needMedia = (REDO && (!ONLY || ONLY.includes(p.foto))) || !have?.media || have.media.status !== 'READY';
    if (needMedia && photo) {
      const video = findFile('videos', p.foto, ['mp4']) ?? (p.video ? clipFromPhoto(photo, p.foto) : null);
      const r = await upload(video ?? photo, video ? 'VIDEO' : 'IMAGE');
      body.mediaId = r.media.id;
      report.push(`${video ? 'vídeo' : 'foto '} ${p.nome}: ${kb(r.before)} → ${kb(r.after)} (${r.media.width}×${r.media.height})${r.ok ? '' : ' [URL pública NÃO abriu]'}`);
    } else if (!photo) report.push(`sem foto  ${p.nome} (falta docs/demo-cardapio/fotos/${p.foto}.jpg)`);
    if (have) await call('PATCH', `/menu/items/${have.id}`, body);
    else await call('POST', '/menu/items', body);
  }
  // ordem dos itens = ordem do arquivo, categoria por categoria (os que não estão no arquivo vão para o fim)
  const now = await call('GET', '/menu/items');
  const rank = (x) => { const i = data.produtos.findIndex((p) => p.nome === x.name); return i < 0 ? 1e9 : i; };
  for (const c of cats) {
    const ids = now.filter((x) => x.categoryId === c.id).sort((a, b) => rank(a) - rank(b)).map((x) => x.id);
    if (ids.length) await call('PUT', '/menu/items/order', { ids });
  }

  console.log(report.join('\n') || 'nenhuma mídia nova (use --refazer-midia para reenviar)');
  console.log(`ok: ${data.categorias.length} categorias, ${data.opcionais.length} grupos de opcionais, ${data.produtos.length} produtos`);
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
