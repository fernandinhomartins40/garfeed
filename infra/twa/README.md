# App Android do painel (TWA)

O app da Play Store é o **painel** (`painel.garfeed.com.br`) empacotado como Trusted Web Activity com
[Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) — sem código nativo (decisão em `docs/DECISOES.md`).

Arquivos:
- `twa-manifest.json` — configuração do Bubblewrap (pacote `br.com.garfeed.painel`, início em `/ao-vivo`, cores da marca).
  Os ícones são baixados de `https://painel.garfeed.com.br/icon-512.png` (cópia de `docs/assets/loja-e-icones/icone-app-512.png`).
- `assetlinks.json` — servido pelo nginx em `https://painel.garfeed.com.br/.well-known/assetlinks.json`
  (montado no container; editar e `docker compose ... restart nginx`, sem rebuild). **Contém um placeholder do SHA-256.**

## Pré-requisitos
JDK 17 e Android SDK (o Bubblewrap oferece baixar os dois no primeiro uso) e o painel já publicado em HTTPS
(o Bubblewrap baixa ícones/manifest da URL).

## Gerar o APK/AAB
```bash
npm i -g @bubblewrap/cli
cd infra/twa
# 1. chave de assinatura (uma vez; guarde o arquivo e as senhas fora do git — perder = não atualizar o app)
keytool -genkeypair -v -keystore garfeed-painel.keystore -alias garfeed -keyalg RSA -keysize 2048 -validity 10000
# 2. gera o projeto Android a partir do twa-manifest.json
bubblewrap update --manifest=./twa-manifest.json
# 3. compila e assina: app-release-signed.apk (teste) e app-release-bundle.aab (Play Store)
bubblewrap build
```

## SHA-256 no assetlinks.json
Sem isso o app abre com a barra de URL do Chrome (vira Custom Tab) em vez de tela cheia.
```bash
keytool -list -v -keystore garfeed-painel.keystore -alias garfeed | grep SHA256
# ou: bubblewrap fingerprint add <SHA256>   (atualiza o twa-manifest)
```
Troque `TROCAR:PELO:SHA256...` em `assetlinks.json` pelo valor (formato `AB:CD:...`). Se usar a **assinatura de app
da Play** (padrão), adicione também o SHA-256 da "Chave de assinatura do app" que aparece no Play Console
(Configuração → Integridade do app) — a lista aceita vários.

## Play Store
Ícone 512×512: `docs/assets/loja-e-icones/icone-app-512.png` · gráfico de destaque 1024×500:
`docs/assets/loja-e-icones/play-store-feature-1024x500.png` (regras em `docs/KIT-README.md`).
