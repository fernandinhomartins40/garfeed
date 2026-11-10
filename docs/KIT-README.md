# Garfeed — Kit de marca, assets e referências

## Conteúdo

- 01-marca: logo horizontal e vertical, cores, negativa, preto e branco; SVG técnico e PNG transparente. Símbolo quadrado com 2048 px.
- 02-landing-assets: hero e experiência em JPG horizontal/vertical, elementos sem fundo em PNG, imagens WebP em tamanhos responsivos, ícones SVG e PNG. Feed e painel separados para reutilização.
- 03-loja-e-icones: ícone do app, favicon ICO/SVG/PNG, apple-touch-icon e banner da Play Store, incluindo 1024×500 px sem alfa.
- 04-referencias-aprovadas: imagem anexada como aprovação final, referência em maior resolução, desktop, mobile e logo original aprovada. Propostas descartadas não foram incluídas.
- 05-telas-cliente: M1–M12, uma imagem por tela.
- 06-painel-restaurante: P0–P13, com P1 desktop/tablet e P7 em quatro etapas. 18 imagens.
- 07-manual-visual: dez pranchas da última direção limpa.
- 08-implementacao: especificação original, notas por tela, tokens de cor e exemplo de picture/srcset.

## Uso dos arquivos

As fotos foram recriadas a partir da referência aprovada, sem recortar a landing. Podem ter pequenas diferenças naturais de cena e perspectiva. As imagens de telas são referências de design; interfaces, textos, botões, menus, fundos, espaçamento e responsividade devem ser implementados em HTML/CSS, não como uma única imagem. O pacote não contém a aplicação implementada.

Para logo em qualquer tamanho, prefira SVG. Os contornos do SVG técnico foram traçados a partir do original aprovado, preservando a marca; as cores foram uniformizadas para a paleta de implementação. O garfo é um vazado nas versões transparentes. As versões raster quadradas de 2048 px foram renderizadas do vetor; fotos mantêm sua resolução nativa, registrada no inventário. Não há promessa de fotografia 4K. As versões da logo geradas que apresentaram artefatos de transparência foram substituídas pelos arquivos técnicos limpos.

Os QR Codes presentes nas fotografias são ilustrativos. Para uma placa de produção, use o QR real da aplicação.

## Paleta e fontes

Laranja #FE581D; marinho #142433; creme #FFF8F2; pêssego #FFE9DC; branco #FFFFFF. Os códigos do MD prevalecem sobre os tons aproximados mostrados em imagens do manual. Títulos: Nunito; interface/corpo: Inter. Logo: lettering preservado, não substituir por fonte digitada.

Fontes sugeridas: https://fonts.google.com/specimen/Nunito e https://fonts.google.com/specimen/Inter . Não foram incorporadas fontes de terceiros no pacote.

## Hero com contorno orgânico

Use 02-landing-assets/hero-contorno-organico.png para reproduzir a curva e o avanço lateral da imagem aprovada sem clip-path. Resolução nativa: 1448 × 1086 px, fundo transparente. Há derivados WebP. A fotografia e o contorno estão no mesmo arquivo. Na página, use width:100%;height:auto; não aplique borda ou raio adicional. A área superior esquerda permanece vazada.

## Aplicação por largura

Até 767 px: composição em uma coluna e imagens verticais. De 768 a 1199 px: notebook/tablet com imagens horizontais, títulos ajustados e colunas conforme o espaço real. A partir de 1200 px: hero e seção de experiência em duas colunas. Não esticar imagens; definir dimensões e usar object-fit apenas quando o recorte for intencional. Preferir WebP na página e JPG/PNG como fontes e fallback.

## Play Store

Banner: play-store-feature-1024x500.png ou .jpg, sem transparência. Ícone: icone-app-512.png, PNG RGBA quadrado, abaixo de 1024 KB, sem cantos arredondados externos incorporados. Master nativo adicional disponível. As telas fornecidas são referências conceituais para desenvolvimento.

Requisitos consultados em 10/11/2026:
https://support.google.com/googleplay/android-developer/answer/9866151?hl=en-AU-u-fw-mon-mu-celsius
https://developer.android.com/distribute/google-play/resources/icon-design-specifications

## Arquivos ZIP

Se houver mais de uma parte, cada ZIP é independente. Extraia todos na mesma pasta; os caminhos se completam. Cada parte tem menos de 30 MB. O inventário lista dimensões reais, transparência, bytes e hash de cada arquivo do conjunto.
