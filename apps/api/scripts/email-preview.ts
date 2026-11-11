// Gera os previews estáticos dos e-mails em docs/emails-preview/ (pnpm --filter api emails:preview).
import { mkdirSync, writeFileSync } from 'node:fs';
import * as e from '../src/lib/emails';

const out = new URL('../../../docs/emails-preview/', import.meta.url);
const painel = 'https://painel.garfeed.com.br';
const token = 'EXEMPLO-nao-e-um-token-real';
const loginUrl = `${painel}/login`;

const previews = {
  'recuperacao-de-senha': e.passwordResetEmail({ name: 'Carlos Souza', url: `${painel}/redefinir-senha?token=${token}` }),
  'convite-de-equipe': e.inviteEmail({ name: 'Ana Oliveira', restaurantName: 'Brasa & Pão', inviterName: 'Carlos Souza', role: 'WAITER', url: `${painel}/aceitar-convite?token=${token}` }),
  'boas-vindas-dono': e.ownerWelcomeEmail({ name: 'Carlos Souza', restaurantName: 'Brasa & Pão', url: `${painel}/aceitar-convite?token=${token}`, setPassword: true }),
  'senha-alterada': e.passwordChangedEmail({ name: 'Carlos Souza' }),
  'conta-desativada': e.accountStatusEmail({ name: 'Ana Oliveira', restaurantName: 'Brasa & Pão', active: false, loginUrl }),
  'conta-reativada': e.accountStatusEmail({ name: 'Ana Oliveira', restaurantName: 'Brasa & Pão', active: true, loginUrl }),
  'restaurante-suspenso': e.restaurantStatusEmail({ name: 'Carlos Souza', restaurantName: 'Brasa & Pão', suspended: true, loginUrl }),
  'restaurante-reativado': e.restaurantStatusEmail({ name: 'Carlos Souza', restaurantName: 'Brasa & Pão', suspended: false, loginUrl }),
  'teste': e.testEmail({ name: 'Admin Garfeed' }),
};

mkdirSync(out, { recursive: true });
for (const [name, mail] of Object.entries(previews)) {
  writeFileSync(new URL(`${name}.html`, out), mail.html);
  writeFileSync(new URL(`${name}.txt`, out), `Assunto: ${mail.subject}\n\n${mail.text}\n`);
}
writeFileSync(new URL('index.html', out), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>E-mails do Garfeed — previews</title>
<body style="font-family:system-ui,sans-serif;max-width:640px;margin:40px auto;color:#142433"><h1>E-mails do Garfeed</h1><p>Gerado por <code>pnpm --filter api emails:preview</code>. Planejamento em <code>docs/EMAILS.md</code>.</p><ul>
${Object.entries(previews).map(([n, m]) => `<li><a href="${n}.html">${m.subject}</a> · <a href="${n}.txt">texto</a></li>`).join('\n')}
</ul></body></html>
`);
console.log(`${Object.keys(previews).length} previews em docs/emails-preview/`);
