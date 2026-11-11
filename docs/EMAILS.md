# E-mails do Garfeed

Todo e-mail do produto é **transacional** e vai para quem tem acesso ao **painel** (equipe do restaurante e superadmin).
O **cliente final é anônimo** (regra 6 do `CLAUDE.md`): não tem cadastro, não informa e-mail e **nunca recebe e-mail**.

- **Envio:** Velomail (servidor de e-mail próprio do dono do projeto — ver `docs/DECISOES.md`), API HTTP
  `POST https://www.velomail.com.br/api/emails/send` com `Authorization: Bearer <VELOMAIL_API_KEY>`.
- **Remetente:** `nao-responda@garfeed.com.br` · **Reply-To:** `contato@garfeed.com.br`. A API do Velomail só aceita o
  endereço puro em `from` (sem nome de exibição `"Garfeed <...>"`).
- **Domínio:** `garfeed.com.br` autenticado no Velomail (DKIM `default._domainkey`, DMARC `p=none`, return-path
  `uz-mail.garfeed.com.br` com MX + SPF). Registros na zona DNS da Hostinger.
- **Código:** `apps/api/src/lib/mailer.ts` (envio), `apps/api/src/lib/emails.ts` (layout base + um template por e-mail,
  HTML e texto puro), `apps/api/src/lib/passwordTokens.ts` (links de definir senha).
- **Previews:** `pnpm --filter api emails:preview` gera `docs/emails-preview/*.html|.txt` (abra `index.html`).
- **Logo:** `apps/landing/assets/email/logo-garfeed.png`, servido em `https://garfeed.com.br/assets/email/logo-garfeed.png`
  (PNG: clientes de e-mail não renderizam SVG).

## Comportamento do envio
- Assíncrono (*fire-and-forget*): a requisição responde sem esperar o Velomail; falha de e-mail nunca derruba a requisição.
  Três tentativas (2 s e 4 s de intervalo) e log de erro. Exceção: o **e-mail de teste** espera a resposta para mostrar o resultado.
- Sem `VELOMAIL_API_KEY`: não envia. Em desenvolvimento o texto do e-mail (com o link) sai no log da API; em produção só um aviso, sem o link.
- `NODE_ENV=test`: nunca fala com o Velomail (os testes trocam `transport.deliver` por um falso que captura as mensagens).

## Implementados

| # | E-mail | Gatilho | Destinatário | Assunto | Variáveis |
|---|--------|---------|--------------|---------|-----------|
| 1 | Recuperação de senha | `POST /auth/forgot-password` (tela "Esqueci minha senha") para usuário ativo que já tem senha | Quem pediu | `Redefinir sua senha do Garfeed` | `name`, `url` (`/redefinir-senha?token=`, 1 h, uso único) |
| 2 | Convite de equipe | Dono cria a pessoa sem senha em Equipe (`POST /users`) ou reenvia (`POST /users/:id/invite`) | Pessoa convidada | `{quem convidou} convidou você para o {restaurante} no Garfeed` | `name`, `restaurantName`, `inviterName`, `role`, `url` (`/aceitar-convite?token=`, 7 dias, uso único) |
| 3 | Boas-vindas ao dono | Superadmin cria o restaurante (`POST /admin/restaurants`) | Dono do novo restaurante | `Bem-vindo ao Garfeed, {nome}!` | `name`, `restaurantName`, `url` (link de definir senha, 7 dias; ou o login, se o superadmin informou senha inicial pela API), `setPassword` |
| 3b | Boas-vindas do cadastro | O restaurante se cadastra sozinho (`POST /auth/signup`, tela `/cadastro`) | Dono que acabou de criar a conta | `Bem-vindo ao Garfeed, {nome}!` | `name`, `restaurantName`, `url` (login do painel — **sem** link de definir senha: ele já criou a dele), `trialDays` (30) |
| 4 | Senha alterada | Senha redefinida pelo link de recuperação ou trocada pelo dono em Equipe (`PATCH /users/:id`) | Dono da conta alterada | `Sua senha do Garfeed foi alterada` | `name` |
| 5 | Conta desativada | Dono desativa o acesso (`PATCH /users/:id` `active:false`) | Pessoa desativada | `Seu acesso ao {restaurante} foi desativado` | `name`, `restaurantName` |
| 6 | Conta reativada | Dono reativa o acesso (`active:true`) | Pessoa reativada | `Seu acesso ao {restaurante} foi reativado` | `name`, `restaurantName`, `loginUrl` |
| 7 | Restaurante suspenso | Superadmin muda o status para `SUSPENDED` | Donos ativos do restaurante | `O {restaurante} foi suspenso no Garfeed` | `name`, `restaurantName` |
| 8 | Restaurante reativado | Superadmin tira o restaurante de `SUSPENDED` | Donos ativos do restaurante | `O {restaurante} foi reativado no Garfeed` | `name`, `restaurantName`, `loginUrl` |
| 9 | E-mail de teste | Botão "E-mail de teste" no admin (`POST /admin/test-email`) | O próprio superadmin logado | `E-mail de teste do Garfeed` | `name` |

### Regras dos links (recuperação e convite)
- Token aleatório de 256 bits; **só o hash SHA-256** vai para o banco (`UserToken`). O link aparece uma única vez, no e-mail.
- **Uso único** (marcação atômica) e **expiração**: recuperação 1 h, convite/boas-vindas 7 dias (`LIMITS` no shared).
- **Um link válido por vez** por tipo: pedir de novo ou reenviar o convite invalida o anterior.
- Definir a senha por um link **encerra todas as sessões** do usuário (refresh tokens + access tokens já emitidos).
- `forgot-password` responde **sempre 204**, exista o e-mail ou não. Limites: 5 pedidos por IP a cada 15 min (429) e
  3 links por e-mail por hora (em silêncio). Validar/usar token: 30 tentativas por IP a cada 15 min.
- **Convite pendente** = usuário sem senha. Status em Equipe: "Convite pendente" ou "Convite expirado", com
  **Reenviar convite** e **Cancelar convite** (remove o usuário). Convite pendente não se recupera por "Esqueci minha senha".
- Avisos 4–6 não são enviados a quem ainda não aceitou o convite (não há acesso para avisar).
- Multi-tenant: reenviar/cancelar só enxergam usuários do `restaurantId` do token (outro restaurante recebe 404).

## Planejados (V2) — não implementados
| E-mail | Gatilho | Destinatário | Observação |
|--------|---------|--------------|------------|
| Resumo diário | Job no fechamento do dia | Donos (opt-in em Configurações) | Pedidos, faturamento e itens mais pedidos do dia |
| Relatório semanal/mensal | Job agendado | Donos (opt-in) | Depende da tela de Relatórios ("em breve") |
| Fim do período de teste | X dias antes de o `TRIAL` acabar | Donos | Depende de cobrança/planos |
| Cobrança (fatura, falha de pagamento) | Eventos de cobrança | Donos | Depende de cobrança |
| Aviso de novo acesso à conta | Login em aparelho novo | O próprio usuário | Exige registrar aparelhos |
| Convite aceito | Pessoa define a senha | Quem convidou | Hoje o dono vê o status mudar em Equipe |
| Troca de e-mail com confirmação | Usuário pede para trocar o e-mail | E-mail novo e antigo | Hoje o e-mail do acesso não muda |
| Webhook de entrega (bounce/falha) | Evento `email.failed` do Velomail | — (marca o e-mail como inválido em Equipe) | O Velomail já oferece webhooks; exige endpoint público novo |

E-mails para o cliente final (comprovante de pedido, marketing) **não existem e não devem existir** enquanto o cliente for anônimo.

## Variáveis de ambiente
| Variável | Padrão | Uso |
|----------|--------|-----|
| `VELOMAIL_API_KEY` | vazio (não envia) | Chave de envio do Velomail (permissão só `email:send`). **Nunca** a chave de administração/agente |
| `VELOMAIL_API_URL` | `https://www.velomail.com.br/api/emails/send` | Endpoint de envio |
| `MAIL_FROM` | `nao-responda@garfeed.com.br` | Remetente (endereço puro, do domínio verificado) |
| `MAIL_REPLY_TO` | `contato@garfeed.com.br` | Reply-To |
| `PAINEL_URL` | `http://localhost:5173` | Base dos links dos e-mails. Produção: `https://painel.garfeed.com.br` |
