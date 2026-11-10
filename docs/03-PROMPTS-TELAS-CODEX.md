# Garfeed — Prompts para o Codex criar as telas

**Como usar:**
1. Anexe a logo (`assets/logo-garfeed.png`) na conversa com o Codex.
2. Cole o **Prompt 0** (contexto + identidade visual). Ele vale para todas as telas.
3. Em seguida cole o **Prompt 1** (app do cliente) e depois o **Prompt 2** (painel web).
4. Peça uma tela por vez se o resultado vier inconsistente ("agora gere só a tela M3").

> As telas servem de referência visual para o Claude Code implementar. Guarde as imagens em `docs/telas/` no projeto com o código da tela no nome (ex.: `M3-feed.png`, `P1-ao-vivo.png`).

---

## Prompt 0 — Contexto e identidade visual (cole primeiro)

```
Aja como um Product Designer sênior (UI/UX), especialista em apps mobile de consumo e em painéis SaaS operacionais para restaurantes. Você vai desenhar as telas de um produto real, em alta fidelidade, prontas para servir de referência ao desenvolvedor.

## PRODUTO
Nome: Garfeed (garfo + feed) — garfeed.com.br — Brasil, interface em português (pt-BR).
Slogan: "Deu fome? Rolou, pediu."

O Garfeed é um cardápio digital para restaurantes, bares e cafeterias que mostra os pratos no formato de feed de vídeos curtos em tela cheia (estilo rede social): um prato por tela, com vídeo ou foto vertical, preço e botão de pedir; o cliente rola para cima para ver o próximo.

O cliente acessa encostando o celular numa plaquinha NFC na mesa ou lendo um QR Code. Não baixa app e não faz cadastro: abre no navegador, já identificado pela mesa (ex.: "Mesa 7"). Ele pode pedir, chamar o garçom e pedir a conta pelo celular.

O restaurante usa um painel web (desktop e tablet no balcão) para receber pedidos e chamados em tempo real, com som, organizado por mesa; editar o cardápio; e ativar as mesas escaneando as plaquinhas.

O Garfeed não substitui o caixa/PDV do restaurante; ele se soma à operação.

## IDENTIDADE VISUAL (siga à risca)
Logo anexada: símbolo de "play" laranja com cantos arredondados e um garfo branco vazado dentro, ao lado da palavra "Garfeed" em fonte arredondada, grossa, azul-marinho. Use a logo exatamente como está — não redesenhe.

Cores:
- Laranja Garfeed (primária, ações, destaques): #FE581D
- Laranja hover/pressed: #E54A12
- Laranja claro (fundos de destaque, chips ativos): #FFF1EA
- Azul-marinho Garfeed (texto principal, sidebar, cabeçalhos): #142433
- Marinho 80% (textos secundários): #3A4756
- Cinza texto auxiliar: #6B7480
- Bordas: #E6E8EC
- Fundo do painel: #F6F7F9
- Branco: #FFFFFF
- Sucesso: #16A34A · Atenção: #F59E0B · Erro/urgente: #DC2626 · Info: #2563EB

Tipografia:
- Títulos e números de destaque (preço, número da mesa): "Nunito" ExtraBold/Black — arredondada, combinando com a logo.
- Textos e interface: "Inter" Regular/Medium/SemiBold.

Estilo:
- Moderno, limpo, apetitoso, jovem mas confiável. Muito espaço em branco no painel; no app do cliente, a comida é a protagonista.
- Cantos arredondados: 12px em cards, 999px em chips/botões pílula, 16–20px em bottom sheets.
- Sombras suaves e curtas. Ícones de linha (estilo Lucide), 1.75px.
- Botão primário: fundo #FE581D, texto branco, pílula. Secundário: contorno #142433.
- Fotos de comida realistas, bem iluminadas, verticais 9:16 (hambúrguer artesanal, pizza, açaí, drinks, porções de bar, café).
- Nada de copiar a interface de Instagram ou TikTok literalmente: a linguagem é de feed vertical, mas a identidade é do Garfeed.
- Acessibilidade: contraste AA, alvos de toque ≥ 44px.

Dados de exemplo (use nas telas):
Restaurante "Brasa & Pão Hamburgueria", Mesa 7.
Itens: "Smash Duplo Cheddar" R$ 32,90 · "Batata Rústica com Bacon" R$ 24,90 · "Milkshake de Doce de Leite" R$ 19,90 · "Chopp Pilsen 500ml" R$ 14,90 · "Brownie com Sorvete" R$ 18,90.
Categorias: Destaques, Lanches, Porções, Bebidas, Sobremesas.

## REGRAS DE ENTREGA
- Uma imagem por tela, alta fidelidade, com o código da tela no canto (ex.: "M3").
- Mobile: frame de iPhone 390×844. Painel: desktop 1440×900 (e tablet 1180×820 quando indicado).
- Textos reais em português, sem lorem ipsum. Preços no formato R$ 32,90.
- Mantenha consistência total entre as telas (mesmos componentes, espaçamentos e cores).
- Antes de gerar, confirme em 3 linhas como vai aplicar a identidade. Depois aguarde o próximo prompt com a lista de telas.
```

---

## Prompt 1 — App do cliente (cardápio no celular)

```
Agora desenhe as telas do APP DO CLIENTE (abre no navegador do celular, sem instalar). Frame iPhone 390×844. Siga a identidade do prompt anterior.

M1 — Placa não ativada
Fundo branco, logo Garfeed no centro, ilustração simples de uma plaquinha com ondas de NFC, título "Esta mesa ainda não foi ativada", texto "Peça ajuda ao garçom. Enquanto isso, conheça o Garfeed." e link "@garfeed".

M2 — Abertura / boas-vindas (aparece 1,5 s ao abrir)
Fundo com foto desfocada de comida, logo do restaurante "Brasa & Pão" em círculo, texto "Bem-vindo! Você está na Mesa 7", botão "Ver cardápio". Rodapé discreto "powered by Garfeed" com o símbolo.

M3 — Feed (tela principal, a mais importante)
Vídeo/foto do "Smash Duplo Cheddar" ocupando a tela inteira (9:16), gradiente escuro embaixo para leitura.
Topo: chip "Mesa 7" à esquerda (abre o hub), chips de categorias roláveis no centro (Destaques ativo em laranja), ícone de grade à direita.
Lateral direita, empilhados: coração (favoritar, contador 128), botão "+" laranja grande, compartilhar.
Base: selo "🔥 Mais pedido", nome do prato em Nunito Black branco, descrição de 2 linhas ("Dois smashs de 90g, cheddar inglês, cebola caramelizada, pão brioche") com "ver mais", preço grande "R$ 32,90".
Indicador sutil de "role para cima" (seta/linha) na primeira vez.
Barra inferior flutuante: botão pílula laranja "🛒 Ver pedido · 2 itens · R$ 57,80".

M4 — Feed com item esgotado
Mesmo layout com o "Brownie com Sorvete", imagem levemente dessaturada, selo "Esgotado hoje" e botão "+" desabilitado.

M5 — Grade do cardápio
Alternativa ao feed: chips de categorias no topo, título da categoria, grade de 3 colunas de miniaturas verticais 9:16 com nome e preço sobre cada uma, selo "Esgotado" em uma delas.

M6 — Escolher opcionais (bottom sheet sobre o feed)
Sheet branco com foto pequena, nome, preço. Grupo "Ponto da carne" (obrigatório, escolha 1: Ao ponto, Bem passado). Grupo "Adicionais" (opcional: Bacon +R$ 5,00, Ovo +R$ 3,00, Cheddar extra +R$ 4,00). Campo "Alguma observação?" ("sem cebola"). Seletor de quantidade − 1 +. Botão fixo "Adicionar · R$ 37,90".

M7 — Meu pedido (carrinho)
Título "Seu pedido · Mesa 7". Lista de itens com miniatura, opcionais em cinza, observação, controle de quantidade, remover. Campo opcional "Seu nome (para o garçom te chamar)". Total grande. Botão "Enviar pedido". Aviso pequeno: "O restaurante confirma seu pedido em instantes."

M8 — Acompanhamento do pedido
Ilustração/ícone animado, título "Pedido enviado!", pedido nº 042. Linha do tempo vertical: Enviado ✓ → Confirmado (ativo, laranja) → Em preparo → Pronto → Entregue. Lista resumida dos itens. Botões "Continuar vendo o cardápio" e "Chamar garçom".

M9 — Hub da mesa (menu ao tocar no chip "Mesa 7")
Sheet com logo e nome do restaurante, status "Aberto até 23h". Três botões grandes em cards: "🙋 Chamar garçom", "🧾 Pedir a conta", "📋 Pedidos da mesa". Abaixo: Wi-Fi (rede "BrasaPao_Clientes", botão "Copiar senha"), Instagram, horário de funcionamento.

M10 — Chamado enviado
Toast/modal: "Garçom a caminho da Mesa 7 🙌", com contagem "Você pode chamar de novo em 60 s".

M11 — Pedir a conta
Título "Resumo da Mesa 7". Lista do consumo da sessão por pedido (nº 041, 042), subtotal, aviso "Valor informativo — confira com o garçom." Botão "Chamar garçom para pagar".

M12 — Pedidos da mesa
Lista dos pedidos de todos os celulares da mesa, com nome ("Ana", "Pedro"), status colorido e botão "Mais uma igual" nos itens entregues (ex.: "Chopp Pilsen 500ml").

Para cada tela, gere a imagem e escreva abaixo 3 a 5 notas de interação (gestos, animações, estados vazios/erro) para o desenvolvedor.
```

---

## Prompt 2 — Painel web do restaurante

```
Agora desenhe as telas do PAINEL WEB DO RESTAURANTE. Desktop 1440×900, salvo indicação de tablet. Siga a identidade do primeiro prompt.

Estrutura comum: sidebar fixa à esquerda em azul-marinho #142433 com a logo Garfeed (versão com texto branco) no topo, itens com ícones: Ao vivo (com badge laranja de pendências), Mesas, Cardápio, Placas, Equipe, Relatórios (selo "em breve"), Configurações. No rodapé da sidebar: nome do restaurante "Brasa & Pão", usuário "Carlos · Dono", botão de som ligado/desligado. Área de conteúdo em fundo #F6F7F9 com cards brancos.

P0 — Login
Tela dividida: à esquerda, foto vertical de hambúrguer com overlay marinho e o slogan "Deu fome? Rolou, pediu." em branco; à direita, logo, "Entrar no painel", e-mail, senha, "Esqueci minha senha", botão laranja "Entrar".

P1 — Ao vivo (tela principal de operação) — gerar em desktop E em tablet 1180×820
Topo: título "Ao vivo", indicador "● Conectado", contadores (4 novos · 3 em preparo · 2 prontos), filtro de setor (Todos / Cozinha / Bar).
Faixa de chamados no topo, cards horizontais pulsando: "Mesa 3 · Chamou o garçom · há 40 s" (botão "Atendido"), "Mesa 12 · Pediu a conta · há 2 min" (vermelho, urgente).
Três colunas tipo kanban: NOVOS · EM PREPARO · PRONTOS.
Card de pedido: número da mesa enorme em Nunito Black ("7"), pedido nº 042, "Ana", "há 1 min", itens com quantidade, opcionais em cinza e observação em destaque amarelo ("sem cebola"), total. Nos novos: botões "Aceitar" (laranja) e "Recusar" (texto). Um card com mais de 5 min sem resposta fica com borda e selo vermelho "Atrasado".
Em preparo: botão "Pronto". Prontos: botão "Entregue".

P2 — Mapa de mesas
Grade de cards de mesa por área (Salão, Varanda). Cada mesa com cor de status: Livre (cinza), Ocupada (marinho), Pedido pendente (laranja), Chamando (vermelho pulsando), Pediu conta (roxo/azul). Mostrar tempo de ocupação e total parcial. Legenda no topo. Painel lateral aberto da "Mesa 7": pedidos da sessão, total R$ 112,60, botões "Fechar mesa" e "Ver QR de emergência".

P3 — Cardápio (lista)
Abas de categorias com arrastar para reordenar (ícone de alça). Tabela/lista de itens: miniatura 9:16, nome, preço, selos, status da mídia (Pronto / Processando…), toggle grande "Esgotado hoje", toggle "Visível", menu de ações. Botões "Novo item", "Nova categoria", "Importar planilha".

P4 — Editar item
Formulário em duas colunas. Esquerda: nome, descrição (contador de caracteres), preço, preço promocional, categoria, selos (chips: Mais pedido, Novo, Vegano, Picante), grupos de opcionais vinculados (com "Adicionar grupo"). Direita: área de upload de vídeo/foto com arrastar e soltar, dicas ("vídeo vertical, até 30 s"), e PRÉVIA ao vivo dentro de um mockup de celular mostrando como o item aparece no feed (igual à tela M3). Rodapé fixo: "Cancelar" e "Salvar item".

P5 — Upload em processamento
Mesmo formulário com a mídia em estado "Processando vídeo… 62%" com barra laranja, e depois um estado "Pronto ✓" lado a lado (pode ser em uma única imagem com os dois estados).

P6 — Grupos de opcionais
Lista de grupos ("Ponto da carne" obrigatório 1/1, "Adicionais" 0/5) e modal de edição com opções e preços.

P7 — Placas e vínculo de mesa (fluxo-chave) — gerar em versão CELULAR 390×844 (o dono faz isso andando pelo salão)
Passo 1: "Vincular placa" com três opções grandes: "📷 Escanear QR da placa", "📶 Aproximar (NFC)", "⌨️ Digitar código".
Passo 2: câmera aberta com moldura de leitura laranja e texto "Aponte para o QR da plaquinha".
Passo 3: "Placa GF7K2P encontrada ✓" → lista de mesas para escolher (Mesa 7 selecionada) → botão "Vincular à Mesa 7".
Passo 4: sucesso com confete discreto: "Mesa 7 ativada! Teste encostando seu celular na placa." Botão "Vincular próxima placa".

P8 — Lista de placas (desktop)
Tabela: código, mesa vinculada, status (Ativa, Não vinculada, Bloqueada), última leitura, ações (Trocar mesa, Desvincular, Bloquear). Botão "Vincular placa" e "Imprimir QRs de emergência".

P9 — Mesas (criação em lote)
Lista de mesas por área + modal "Criar mesas em lote": prefixo "Mesa", de 1 até 20, área "Salão". Botão "Criar 20 mesas".

P10 — Equipe
Lista de usuários com papel (Dono, Gerente, Garçom, Cozinha), status, último acesso. Modal "Convidar pessoa" com nome, e-mail e papel, explicando em uma linha o que cada papel pode fazer.

P11 — Configurações
Seções em cards: Dados do restaurante (nome, logo, cor de destaque com prévia), Horário de funcionamento (por dia), Wi-Fi para clientes, Links (Instagram, avaliação no Google), Operação (toggle "Confirmar pedidos antes de enviar para a cozinha" ligado, volume do alerta, testar som), Plano atual "Pro" com botão "Gerenciar plano".

P12 — Admin Garfeed (super admin)
Sidebar com "Restaurantes", "Placas", "Planos". Tela de lotes de placas: botão "Gerar lote", modal com quantidade (50) e restaurante opcional; tabela de lotes com download CSV (código + URL g.garfeed.com.br/CODIGO). Cards de resumo: restaurantes ativos, placas ativas, pedidos hoje.

P13 — Estados vazios e alertas
Uma prancha com: Ao vivo vazio ("Tudo tranquilo por aqui ☕ — os pedidos aparecem aqui com som"), Cardápio vazio com CTA "Cadastrar primeiro item" e "Importar planilha", toast de novo pedido ("🔔 Novo pedido · Mesa 7"), banner "Sem conexão — tentando reconectar…", e permissão de notificações do navegador.

Para cada tela, gere a imagem e escreva abaixo 3 a 5 notas para o desenvolvedor (componentes shadcn/ui sugeridos, estados de hover/carregando/erro, responsividade).
```

---

## Prompt extra — se quiser as telas já em código

Se preferir que o Codex gere **código** em vez de imagens, troque a seção "REGRAS DE ENTREGA" do Prompt 0 por:

```
Gere cada tela como componente React + TypeScript + Tailwind CSS + shadcn/ui, com dados mockados, sem chamadas de API. Crie um arquivo tailwind com os tokens de cor e fontes acima. Organize em apps/cardapio/src/screens (M1–M12) e apps/painel/src/screens (P0–P13). Use lucide-react para ícones.
```
