# Garfeed — Modelo de Negócio

> **Garfeed** (garfo + feed) — o cardápio que dá fome.
> Domínio: **garfeed.com.br** · Slogan: *"Deu fome? Rolou, pediu."*
> Versão 1.0 · Novembro/2026

---

## 1. Resumo

O Garfeed é um cardápio digital para restaurantes, bares, lanchonetes e cafeterias que mostra os pratos **no formato de feed de vídeos curtos** (como as redes sociais): cada prato ocupa a tela inteira do celular, com vídeo ou foto, preço e botão de pedir. O cliente rola para cima para ver o próximo.

O acesso é por uma **plaquinha híbrida NFC + QR Code** em cada mesa — sem baixar aplicativo e sem cadastro. Ao abrir, o cliente já está identificado na **mesa certa** e pode **pedir, chamar o garçom ou pedir a conta** sem levantar a mão.

O restaurante recebe tudo num **painel web simples**, com alerta sonoro, organizado por mesa.

**Princípio:** o Garfeed **não substitui** nada que o restaurante já usa (caixa, PDV, garçom, comanda). Ele se soma à operação para vender mais e atender mais rápido.

---

## 2. Problema

| Para quem | Dor |
|---|---|
| **Cliente** | Cardápio em PDF/lista é chato, sem foto boa; espera o garçom para pedir, para chamar e para fechar a conta. |
| **Restaurante** | Pratos bons "escondidos" no cardápio; garçons sobrecarregados no pico; não sabe o que o cliente olha antes de pedir; poucas avaliações no Google. |
| **Cardápios digitais atuais** | Resolvem o "sem papel", mas são listas sem emoção. Não fazem a comida "entrar pelos olhos". |

## 3. Solução

1. **Feed visual em tela cheia** — vídeo/foto vertical, nome, preço, descrição curta e botão "Quero".
2. **Plaquinha híbrida NFC + QR** — funciona em qualquer celular (NFC para quem tem, QR para todos).
3. **Pedido pela mesa** — o pedido chega no painel já com o número da mesa.
4. **Botões rápidos** — "Chamar garçom", "Pedir a conta", "Mais uma igual".
5. **Painel do restaurante** — pedidos e chamados em tempo real com som, cardápio editável na hora (preço, "esgotado").
6. **Ativação em segundos** — o dono escaneia a placa pelo painel e escolhe "Mesa 7". Pronto.
7. **(V2) Avaliações inteligentes** — nota alta leva ao Google; nota baixa vai só para o dono.
8. **(V2) Dados** — pratos mais vistos, mais pedidos, tempo de atenção, horários de pico.

## 4. Proposta de valor

- **Para o dono:** *"Seu cardápio vira vitrine. Mais pedidos, menos espera, garçom livre para atender melhor."*
- **Para o cliente:** *"Viu, deu fome, pediu. Sem esperar ninguém."*

## 5. Público-alvo (ICP)

**Primário (começar por aqui):**
- Hamburguerias, pizzarias, bares/petiscarias, cafeterias, açaiterias, restaurantes casuais.
- 8 a 40 mesas, pratos visualmente apelativos, público de 18 a 45 anos.
- Dono presente na operação e ativo no Instagram.

**Secundário (depois):** restaurantes de shopping, choperias, praças de alimentação, hotéis/pousadas, eventos.

## 6. Diferenciais frente à concorrência

| | Cardápio PDF/QR | Cardápios digitais (lista) | SipFlow (Portugal) | **Garfeed** |
|---|---|---|---|---|
| Formato feed em tela cheia | ✗ | ✗ | ✓ | **✓ com vídeo** |
| NFC + QR | QR | QR | ✓ | **✓** |
| Pedido identificado pela mesa | ✗ | às vezes | ✗ | **✓** |
| Chamar garçom / pedir conta | ✗ | raro | ✗ | **✓** |
| Painel de pedidos em tempo real | ✗ | ✓ | ✗ | **✓** |
| Ativação de mesa pelo celular do dono | ✗ | ✗ | ✗ | **✓** |
| Produção de vídeo dos pratos | ✗ | ✗ | ✗ | **✓ (serviço)** |
| Atendimento local, presencial | ✗ | ✗ | ✗ | **✓** |

## 7. Fontes de receita

1. **Assinatura mensal (SaaS)** — receita recorrente principal.
2. **Kit de placas NFC + QR** — venda na ativação (margem sobre o custo do material).
3. **Produção de conteúdo** — gravação e edição dos vídeos dos pratos (forte diferencial e porta de entrada).
4. **(Futuro)** taxa por pedido pago pelo app, destaque patrocinado de bebidas/marcas, white-label para redes.

## 8. Planos e preços (sugestão inicial — validar com os primeiros clientes)

| Plano | Preço/mês | Inclui |
|---|---|---|
| **Essencial** | R$ 129 | Cardápio feed, até 15 mesas, pedidos + chamados, painel com som, 1 usuário |
| **Pro** ⭐ | R$ 199 | Mesas ilimitadas, até 5 usuários (garçons/cozinha), relatórios, avaliações (V2), cardápio em inglês/espanhol |
| **Rede** | sob consulta | Várias unidades, relatórios consolidados, integração com PDV (V3) |

- **Anual:** pague 10, leve 12.
- **Ativação:** R$ 0 se fidelidade de 6 meses; R$ 290 sem fidelidade.
- **Placas NFC + QR:** kit de 10 por R$ 349 (placas extras a R$ 39). Custo estimado por placa: R$ 12 a R$ 20 (tag NTAG213 + acrílico/PVC impresso).
- **Pacote de vídeos:** 10 pratos por R$ 590 · 20 pratos por R$ 990.
- **Piloto:** 30 dias grátis para os 3 primeiros restaurantes, em troca de depoimento + case.

> Os valores são ponto de partida. Ajuste à realidade da sua cidade depois das 5 primeiras conversas com donos.

## 9. Custos (estimativa mensal)

| Item | Custo |
|---|---|
| VPS (4 vCPU / 8 GB, Docker) — atende dezenas de restaurantes | R$ 150 – 300 |
| Backup externo + domínio | R$ 30 – 60 |
| Tags NFC e placas | custo repassado no kit |
| Equipamento de vídeo (celular bom, luz, tripé) | investimento único ~R$ 800 – 1.500 |

Toda a infraestrutura é **própria** (Docker na VPS): banco, arquivos de vídeo, notificações. Sem dependência de serviços terceiros pagos.

## 10. Metas e projeção (cenário conservador)

| Marco | Restaurantes | Ticket médio | MRR |
|---|---|---|---|
| Mês 3 | 10 | R$ 160 | R$ 1.600 |
| Mês 6 | 30 | R$ 170 | R$ 5.100 |
| Mês 12 | 80 | R$ 175 | R$ 14.000 |

Somar a isso a receita única de placas e vídeos (~R$ 600 a R$ 1.300 por restaurante novo).

## 11. Go-to-market (estratégia de entrada na cidade)

1. **Piloto vitrine:** 1 a 3 restaurantes conhecidos e "instagramáveis". Gravar os vídeos de graça.
2. **Prova social:** vídeo curto mostrando cliente usando o Garfeed na mesa → Instagram @garfeed.
3. **Venda porta a porta:** visita com celular na mão e uma plaquinha demo ("encosta aqui").
4. **Argumento matador:** "Me dá 30 dias. Se não vender mais, você não paga."
5. **Indicação:** 1 mês grátis para cada restaurante indicado que fechar.
6. **Parcerias:** fotógrafos/social medias de gastronomia locais revendendo com comissão de 20% recorrente.

## 12. Métricas que importam

- **Negócio:** MRR, churn mensal (< 4%), CAC, tempo de ativação (< 1 dia).
- **Produto:** % de mesas que abrem o cardápio, pedidos via Garfeed / total, tempo médio entre abrir e pedir, chamados atendidos em < 2 min.
- **Valor para o cliente:** aumento do ticket médio, novas avaliações no Google por mês.

## 13. Riscos e mitigação

| Risco | Mitigação |
|---|---|
| Pedidos falsos (trote) | Pedido entra "aguardando confirmação"; sessão da mesa expira; limite de pedidos por sessão |
| Dono não tem tempo de cadastrar o cardápio | Cadastro feito pela equipe Garfeed na ativação + importação por planilha |
| Internet ruim no restaurante | Feed leve (vídeo comprimido, pré-carregamento), funciona com 4G do cliente |
| Concorrente grande copiar | Velocidade, atendimento local, produção de vídeo e relacionamento |
| Cliente sem NFC | QR Code na mesma placa |

## 14. Roadmap de produto

- **V1 (MVP, 6–8 semanas):** feed, placas, ativação de mesas, pedidos com confirmação, chamados, painel com som, edição de cardápio.
- **V2:** avaliações + Google, ranking de pratos, relatórios, cardápio multi-idioma, sugestões "combina com".
- **V3:** integração com PDVs, pagamento pelo celular (Pix), multi-unidades, API pública.
