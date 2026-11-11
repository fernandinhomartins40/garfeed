import qrcode from 'qrcode-generator';
import { tagUrl } from '@garfeed/shared';
import logo from '@/assets/logo-horizontal-cor.svg';
import { isNative } from './native';
import { TAG_BASE_URL } from './utils';

export const qrSvg = (text: string) => {
  const q = qrcode(0, 'M');
  q.addData(text);
  q.make();
  return q.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

/**
 * QR de emergência (RF-21): abre uma página A4 com um cartão por mesa e chama a impressão
 * do navegador — "Salvar como PDF" gera o PDF sem lib extra.
 */
export function printEmergencyQrs(entries: { table: string; code: string }[]) {
  // app iOS (WKWebView): não abre janela nova nem imprime — avisa em vez do falso "permita pop-ups"
  if (isNative()) {
    alert('A impressão dos QR não está disponível no app. Abra painel.garfeed.com.br em um computador para imprimir.');
    return true;
  }
  const w = window.open('', '_blank');
  if (!w) return false;
  const cards = entries.map(({ table, code }) => {
    const url = tagUrl(TAG_BASE_URL, code);
    return `<div class="card"><img class="logo" src="${new URL(logo, location.href).href}" alt="Garfeed"><h1>${esc(table)}</h1>
      <div class="qr">${qrSvg(url)}</div><p>Aponte a câmera para ver o cardápio e pedir</p><small>${esc(url.replace(/^https?:\/\//, ''))}</small></div>`;
  }).join('');
  w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>QR de emergência</title><style>
    @page { size: A4; margin: 12mm }
    body { font-family: Inter, system-ui, sans-serif; color: #142433; margin: 0; display: grid; grid-template-columns: 1fr 1fr; gap: 10mm }
    .card { border: 2px dashed #E6E8EC; border-radius: 12px; padding: 8mm; text-align: center; break-inside: avoid }
    .logo { height: 12mm } h1 { font: 900 28pt Nunito, system-ui, sans-serif; margin: 4mm 0 } .qr svg { width: 55mm; height: 55mm }
    p { margin: 3mm 0 1mm; font-weight: 600 } small { color: #6B7480 }
  </style></head><body>${cards}<script>onload = () => { print(); }</script></body></html>`);
  w.document.close();
  return true;
}
