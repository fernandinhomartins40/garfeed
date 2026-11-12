// Templates dos e-mails do Garfeed (docs/EMAILS.md). Funções puras: recebem os dados e devolvem assunto + HTML + texto.
// HTML de e-mail: tabelas e CSS inline (Gmail/Outlook), 600px, logo em PNG por URL absoluta (clientes não renderizam SVG).
import { LIMITS, ROLE_LABEL, type Role } from '@garfeed/shared';
import type { MailContent } from './mailer';

const SITE = 'https://garfeed.com.br';
const LOGO = `${SITE}/assets/email/logo-garfeed.png`;
const SUPPORT = 'fuseagencia10@gmail.com';
const C = { orange: '#FE581D', navy: '#142433', navy80: '#3A4756', muted: '#6B7480', border: '#F1E4DA', cream: '#FFF8F2', soft: '#FFF1EA' };
const HEADING = "'Nunito','Trebuchet MS','Segoe UI',Arial,sans-serif";
const BODY = "'Inter','Segoe UI',Helvetica,Arial,sans-serif";

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Content = {
  subject: string;
  /** Resumo que o cliente de e-mail mostra ao lado do assunto. */
  preheader: string;
  title: string;
  /** Parágrafos em texto puro (escapados no HTML). */
  body: string[];
  /** Quadro de destaque: pares rótulo/valor. */
  facts?: [label: string, value: string][];
  cta?: { label: string; url: string };
  /** Observação menor abaixo do botão (validade do link, "não foi você?"). */
  note?: string;
};

const p = (text: string, style: string) => `<p style="margin:0 0 16px;${style}">${esc(text)}</p>`;

function render(c: Content): MailContent {
  const text = [
    c.title, '', ...c.body.flatMap((b) => [b, '']),
    ...(c.facts ? [...c.facts.map(([l, v]) => `${l}: ${v}`), ''] : []),
    ...(c.cta ? [`${c.cta.label}: ${c.cta.url}`, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '--', `Garfeed — cardápio em feed com pedido pela mesa`, SITE, `Privacidade: ${SITE}/privacidade/`, `Dúvidas: ${SUPPORT}`,
  ].join('\n');

  const facts = c.facts && `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;background:${C.soft};border-radius:12px;">
                <tr><td style="padding:16px 20px;font-family:${BODY};font-size:15px;line-height:24px;color:${C.navy80};">
                  ${c.facts.map(([l, v]) => `<span style="color:${C.muted};">${esc(l)}:</span> <strong style="color:${C.navy};">${esc(v)}</strong>`).join('<br>')}
                </td></tr>
              </table>`;
  const cta = c.cta && `
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
                <tr><td align="center" bgcolor="${C.orange}" style="border-radius:999px;background:${C.orange};">
                  <a href="${esc(c.cta.url)}" target="_blank" style="display:inline-block;padding:16px 36px;font-family:${HEADING};font-size:17px;font-weight:800;line-height:20px;color:#FFFFFF;text-decoration:none;border-radius:999px;">${esc(c.cta.label)}</a>
                </td></tr>
              </table>
              <p style="margin:0 0 16px;font-family:${BODY};font-size:13px;line-height:20px;color:${C.muted};">Se o botão não funcionar, copie e cole este endereço no navegador:<br><a href="${esc(c.cta.url)}" style="color:${C.orange};word-break:break-all;">${esc(c.cta.url)}</a></p>`;

  const html = `<!DOCTYPE html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(c.subject)}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600&family=Nunito:wght@800;900&display=swap" rel="stylesheet">
<style>
  body { margin:0; padding:0; }
  img { border:0; outline:none; text-decoration:none; }
  @media only screen and (max-width:620px) {
    .gf-card { padding:28px 22px !important; }
    .gf-title { font-size:24px !important; line-height:30px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background:${C.cream};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${C.cream};font-size:1px;line-height:1px;">${esc(c.preheader)}${'&nbsp;&zwnj;'.repeat(40)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.cream}" style="background:${C.cream};">
  <tr><td align="center" style="padding:32px 12px;">
    <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;">
      <tr><td align="center" style="padding:0 0 24px;">
        <a href="${SITE}" target="_blank"><img src="${LOGO}" width="168" height="47" alt="Garfeed" style="display:block;width:168px;height:47px;font-family:${HEADING};font-size:28px;font-weight:900;color:${C.navy};"></a>
      </td></tr>
      <tr><td height="6" bgcolor="${C.orange}" style="height:6px;line-height:6px;font-size:0;background:${C.orange};border-radius:16px 16px 0 0;">&nbsp;</td></tr>
      <tr><td class="gf-card" bgcolor="#FFFFFF" style="padding:40px 44px 28px;background:#FFFFFF;border:1px solid ${C.border};border-top:0;border-radius:0 0 16px 16px;">
              <h1 class="gf-title" style="margin:0 0 20px;font-family:${HEADING};font-size:28px;line-height:34px;font-weight:900;color:${C.navy};">${esc(c.title)}</h1>
              ${c.body.map((b) => p(b, `font-family:${BODY};font-size:16px;line-height:26px;color:${C.navy80};`)).join('\n              ')}${facts ?? ''}${cta ?? ''}
              ${c.note ? p(c.note, `font-family:${BODY};font-size:14px;line-height:22px;color:${C.muted};`) : ''}
      </td></tr>
      <tr><td align="center" style="padding:24px 20px 8px;font-family:${BODY};font-size:13px;line-height:20px;color:${C.muted};">
        <strong style="font-family:${HEADING};font-weight:800;color:${C.navy};">Garfeed</strong> — Deu fome? Rolou, pediu.<br>
        <a href="${SITE}" target="_blank" style="color:${C.muted};text-decoration:underline;">garfeed.com.br</a> &nbsp;·&nbsp;
        <a href="${SITE}/privacidade/" target="_blank" style="color:${C.muted};text-decoration:underline;">Privacidade</a> &nbsp;·&nbsp;
        <a href="mailto:${SUPPORT}" style="color:${C.muted};text-decoration:underline;">${SUPPORT}</a>
      </td></tr>
      <tr><td align="center" style="padding:0 20px 24px;font-family:${BODY};font-size:12px;line-height:18px;color:${C.muted};">
        Você recebeu este e-mail porque tem um acesso ao painel do Garfeed. Esta é uma mensagem automática.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  return { subject: c.subject, html, text };
}

const first = (name: string) => name.trim().split(/\s+/)[0] ?? name;
const NOT_YOU = `Não foi você? Fale com o dono do restaurante ou escreva para ${SUPPORT}.`;

export const passwordResetEmail = (v: { name: string; url: string }) => render({
  subject: 'Redefinir sua senha do Garfeed',
  preheader: `O link vale por ${LIMITS.passwordResetMinutes} minutos e só pode ser usado uma vez.`,
  title: 'Vamos criar uma nova senha',
  body: [`Olá, ${first(v.name)}!`, 'Recebemos um pedido para redefinir a senha do seu acesso ao painel do Garfeed. Toque no botão para escolher uma nova.'],
  cta: { label: 'Definir nova senha', url: v.url },
  note: `O link vale por ${LIMITS.passwordResetMinutes} minutos e só pode ser usado uma vez. Se você não pediu, ignore este e-mail: sua senha continua a mesma.`,
});

export const inviteEmail = (v: { name: string; restaurantName: string; inviterName: string; role: Role; url: string }) => render({
  subject: `${first(v.inviterName)} convidou você para o ${v.restaurantName} no Garfeed`,
  preheader: `Defina sua senha e entre no painel. O convite vale por ${LIMITS.inviteDays} dias.`,
  title: 'Você foi convidado para a equipe',
  body: [`Olá, ${first(v.name)}!`, `${v.inviterName} adicionou você à equipe do ${v.restaurantName} no Garfeed. Para começar, é só definir a sua senha.`],
  facts: [['Restaurante', v.restaurantName], ['Seu papel', ROLE_LABEL[v.role]], ['Convite válido por', `${LIMITS.inviteDays} dias`]],
  cta: { label: 'Aceitar convite', url: v.url },
  note: 'Se o convite expirar, peça a quem convidou para reenviar. Não conhece este restaurante? Pode ignorar este e-mail.',
});

/** Dono criado pelo superadmin. Sem senha inicial → o link é o de definir senha (7 dias); com senha → link do login. */
export const ownerWelcomeEmail = (v: { name: string; restaurantName: string; url: string; setPassword: boolean }) => render({
  subject: `Bem-vindo ao Garfeed, ${first(v.name)}!`,
  preheader: `O painel do ${v.restaurantName} está pronto para você.`,
  title: `O ${v.restaurantName} já está no Garfeed`,
  body: [
    `Olá, ${first(v.name)}!`,
    `Criamos o painel do ${v.restaurantName}. É por ele que você monta o cardápio em feed, vincula as placas das mesas e acompanha os pedidos em tempo real.`,
    v.setPassword ? 'Para o primeiro acesso, defina a sua senha:' : 'Entre com este e-mail e a senha combinada com a nossa equipe:',
  ],
  cta: { label: v.setPassword ? 'Definir minha senha' : 'Entrar no painel', url: v.url },
  note: v.setPassword
    ? `O link vale por ${LIMITS.inviteDays} dias. Depois disso, use "Esqueci minha senha" na tela de login ou fale com a gente em ${SUPPORT}.`
    : `Precisa de ajuda para começar? Escreva para ${SUPPORT}.`,
});

/** Dono que se cadastrou sozinho (POST /auth/signup): já definiu a senha, então o link é o do painel. */
export const signupWelcomeEmail = (v: { name: string; restaurantName: string; url: string; trialDays: number }) => render({
  subject: `Bem-vindo ao Garfeed, ${first(v.name)}!`,
  preheader: `O painel do ${v.restaurantName} está pronto. Você tem ${v.trialDays} dias grátis.`,
  title: `O ${v.restaurantName} já está no Garfeed`,
  body: [
    `Olá, ${first(v.name)}!`,
    `Sua conta foi criada e o painel do ${v.restaurantName} já está no ar. Você tem ${v.trialDays} dias grátis para testar, sem cartão.`,
    'Para começar: cadastre o cardápio, crie as mesas e vincule as placas. Depois é só acompanhar os pedidos em tempo real.',
  ],
  facts: [['Restaurante', v.restaurantName], ['Teste grátis', `${v.trialDays} dias, sem cartão`]],
  cta: { label: 'Abrir o painel', url: v.url },
  note: `Entre com este e-mail e a senha que você criou. Precisa de ajuda para começar? Escreva para ${SUPPORT}.`,
});

export const passwordChangedEmail = (v: { name: string }) => render({
  subject: 'Sua senha do Garfeed foi alterada',
  preheader: 'Se foi você, não precisa fazer nada.',
  title: 'Senha alterada',
  body: [`Olá, ${first(v.name)}!`, 'A senha do seu acesso ao painel do Garfeed acabou de ser alterada. Por segurança, as sessões abertas foram encerradas: entre de novo com a senha nova.'],
  note: NOT_YOU,
});

export const accountStatusEmail = (v: { name: string; restaurantName: string; active: boolean; loginUrl: string }) => render(v.active ? {
  subject: `Seu acesso ao ${v.restaurantName} foi reativado`,
  preheader: 'Você já pode entrar no painel de novo.',
  title: 'Acesso reativado',
  body: [`Olá, ${first(v.name)}!`, `Seu acesso ao painel do ${v.restaurantName} no Garfeed foi reativado. Entre com o mesmo e-mail e senha de antes.`],
  cta: { label: 'Entrar no painel', url: v.loginUrl },
} : {
  subject: `Seu acesso ao ${v.restaurantName} foi desativado`,
  preheader: 'Você não consegue mais entrar no painel deste restaurante.',
  title: 'Acesso desativado',
  body: [`Olá, ${first(v.name)}!`, `Seu acesso ao painel do ${v.restaurantName} no Garfeed foi desativado pelo dono do restaurante. As sessões abertas foram encerradas.`],
  note: 'Se você acha que foi um engano, fale com o dono do restaurante.',
});

export const restaurantStatusEmail = (v: { name: string; restaurantName: string; suspended: boolean; loginUrl: string }) => render(v.suspended ? {
  subject: `O ${v.restaurantName} foi suspenso no Garfeed`,
  preheader: 'O cardápio continua visível, mas os pedidos estão pausados.',
  title: 'Restaurante suspenso',
  body: [
    `Olá, ${first(v.name)}!`,
    `O ${v.restaurantName} foi suspenso no Garfeed. Enquanto isso, os clientes ainda veem o cardápio pelas placas, mas não conseguem fazer pedidos nem chamar o garçom.`,
    `Para regularizar e reativar, fale com a nossa equipe em ${SUPPORT}.`,
  ],
} : {
  subject: `O ${v.restaurantName} foi reativado no Garfeed`,
  preheader: 'Pedidos e chamados pela mesa estão funcionando de novo.',
  title: 'Restaurante reativado',
  body: [`Olá, ${first(v.name)}!`, `Boa notícia: o ${v.restaurantName} foi reativado. Os pedidos e os chamados pela mesa já estão funcionando de novo.`],
  cta: { label: 'Abrir o painel', url: v.loginUrl },
});

export const testEmail = (v: { name: string }) => render({
  subject: 'E-mail de teste do Garfeed',
  preheader: 'Se você está lendo isto, o envio está funcionando.',
  title: 'O envio de e-mails está funcionando',
  body: [`Olá, ${first(v.name)}!`, 'Este é um e-mail de teste do Garfeed, enviado pelo Velomail a partir do domínio garfeed.com.br. Nenhuma ação é necessária.'],
  facts: [['Remetente', 'nao-responda@garfeed.com.br'], ['Autenticação', 'SPF, DKIM e DMARC']],
});
