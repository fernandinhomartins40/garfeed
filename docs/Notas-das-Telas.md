# Garfeed — Notas das telas

Referências visuais conforme 03-PROMPTS-TELAS-CODEX.md. As imagens são conceitos de interface, não um aplicativo implementado. O cardápio do cliente abre no navegador sem instalação nem cadastro. Imagens móveis usam a proporção 390×844; desktop 1440×900; tablet 1180×820. Dimensões são referências de layout; a resolução de exportação pode diferir.

Tokens da especificação: #FE581D, #E54A12, #FFF1EA, #142433, #3A4756, #6B7480, #E6E8EC, #F6F7F9, #FFFFFF. Títulos: Nunito; interface: Inter. A marca usa o lettering aprovado.

## M1 — Placa não ativada

- Não oferecer pedido enquanto a placa estiver inativa; orientar a equipe e permitir nova verificação sem criar sessão indevida.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M2 — Boas-vindas

- Transição suave para o feed; o botão Ver cardápio permite avançar imediatamente, sem obrigar espera de 1,5 s.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M3 — Feed principal

- Rolagem vertical por prato; reproduzir somente a mídia visível, pausar fora da tela e abrir M6 pelo botão +.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M4 — Feed esgotado

- Item esgotado continua navegável e compartilhável; impedir inclusão também no servidor se o estoque mudar durante a navegação.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M5 — Grade do cardápio

- Alternar grade/feed preservando categoria e prato; miniaturas carregam sob demanda e itens esgotados mantêm selo textual.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M6 — Opcionais

- Validar o grupo obrigatório e recalcular total a cada adicional/quantidade; fechar o sheet não deve enviar pedido.
- Componentes: Sheet; botões e controles acessíveis; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M7 — Carrinho

- Somar opcionais por unidade; nome é opcional; usar identificador único no envio para evitar pedido duplicado.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M8 — Acompanhamento

- Atualizar a linha do tempo pelo estado confirmado do servidor; pedido recusado deve mostrar motivo e alternativa de voltar ao cardápio.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M9 — Hub da mesa

- Abrir pelo chip da mesa; copiar senha mostra confirmação; Wi-Fi e links ausentes não devem gerar linhas vazias.
- Componentes: Sheet; botões e controles acessíveis; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M10 — Chamado enviado

- Contagem regressiva vem do prazo da solicitação aceita; reabrir a tela não reinicia o bloqueio de 60 s.
- Componentes: Dialog de confirmação; botão com estado desabilitado; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M11 — Pedir a conta

- Resumo é informativo; solicitar atendimento não registra pagamento nem fecha a sessão automaticamente.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## M12 — Pedidos da mesa

- Exibir os pedidos da sessão compartilhada da mesa; Mais uma igual revalida disponibilidade, preço e opcionais antes de adicionar.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## P0 — Login

- Form de acesso com rótulos persistentes, exibir/ocultar senha e recuperação; mensagens de erro sem revelar existência do e-mail.
- Componentes sugeridos: Card, Form, Input, Button e Alert.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P1-desktop — Ao vivo desktop

- Somente pedidos e chamados no kanban; Aceitar → Em preparo, Pronto → Prontos, Entregue → histórico, com resposta confirmada do servidor.
- Componentes sugeridos: Card, Badge, Tabs e ScrollArea; atualização dos pedidos em tempo real.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P1-tablet — Ao vivo tablet

- Mesmas transições do desktop, mantendo botões de toque amplos; colunas com rolagem, sem catálogo de compra no painel.
- Componentes sugeridos: Card, Badge, Tabs e ScrollArea; atualização dos pedidos em tempo real.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P2 — Mapa de mesas

- Abrir detalhe em drawer; confirmar fechamento e impedir encerramento silencioso de sessão com pedido em andamento.
- Componentes sugeridos: Card, Badge e Sheet lateral; seleção de mesa persistente.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P3 — Lista do cardápio

- Diferenciar visibilidade e esgotamento; alternar um não muda o outro; reordenação salva com confirmação ou restauração em erro.
- Componentes sugeridos: Table, Switch, DropdownMenu e filtros.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P4 — Editar item

- Prévia deve reproduzir o feed M3; validar preço, descrição e mídia; avisar ao sair com alterações não salvas.
- Componentes sugeridos: Card, Form, Input, Button e Alert.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P5 — Processamento de mídia

- Upload e processamento são estados diferentes; prever cancelamento, repetição de envio e erro; não publicar mídia incompleta.
- Componentes sugeridos: Card, Form, Input, Button e Alert.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P6 — Grupos de opcionais

- Validar mínimo/máximo e opções existentes; reordenar com alternativa por teclado; avisar impacto do grupo vinculado a itens.
- Componentes sugeridos: Dialog, Form, Input, Select e Table.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P7-1 — Vincular placa início

- Verificar disponibilidade de câmera e NFC; manter leitura por QR e digitação como alternativas claras.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## P7-2 — Leitura do QR

- Solicitar acesso à câmera no início da leitura; oferecer digitação em caso de recusa, código inválido ou falha.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## P7-3 — Escolher mesa

- Validar placa e permissão do restaurante; impedir vínculo concorrente e exigir confirmação se já houver mesa vinculada.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## P7-4 — Mesa ativada

- Mostrar sucesso somente após persistir o vínculo; Vincular próxima placa limpa o código anterior e preserva o restaurante.
- Componentes: cards, botões, Badge e campos conforme a tela; manter áreas de toque de pelo menos 44 px.
- Preservar a mesa na sessão e ao voltar; estados de envio devem bloquear toques repetidos sem apagar o conteúdo.
- Tratar carregamento, perda de conexão e falha com mensagem curta e opção de tentar novamente; confirmar o resultado recebido do servidor.

## P8 — Lista de placas

- Exibir ações compatíveis com o status; confirmar bloqueio/desvínculo e informar resultado; QRs de emergência usam a mesa correta.
- Componentes sugeridos: Table, Switch, DropdownMenu e filtros.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P9 — Criar mesas em lote

- Validar intervalo e limite do lote; detectar nomes existentes e apresentar conflitos antes da criação.
- Componentes sugeridos: Dialog, Form, Input, Select e Table.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P10 — Equipe

- Permissões devem ser aplicadas no servidor; mostrar convite pendente, reenviar e expirar; não atribuir Dono por padrão.
- Componentes sugeridos: Dialog, Form, Input, Select e Table.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P11 — Configurações

- Salvar por seção ou com ação global claramente indicada; testar som exige gesto do usuário; ocultar senha por padrão.
- Componentes sugeridos: Card, Form, Input, Button e Alert.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P12 — Super admin

- Acesso restrito ao super admin; gerar códigos únicos e exportar CSV consistente; indicadores são dados ilustrativos nas imagens.
- Componentes sugeridos: Dialog, Form, Input, Select e Table.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

## P13 — Estados e alertas

- Estados são exemplos separados de componentes; toast pode dispensar, banner offline permanece enquanto houver falha; permissão não deve ser exigida.
- Componentes sugeridos: Card, Form, Input, Button e Alert.
- Ações de gravação: mostrar carregamento, impedir envio duplicado e preservar valores em erro; validar no servidor.
- Adaptar o layout ao tablet com alvos maiores e rolagem independente; exibir foco de teclado e estado de conexão claramente.

