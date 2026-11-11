# App Android do painel (TWA)

O app da Play Store é o **painel** (`painel.garfeed.com.br`) empacotado como Trusted Web Activity: quem roda é o Chrome,
então Web Push (VAPID), Web NFC e câmera funcionam sem código nativo e sem Firebase (decisão em `docs/DECISOES.md`).

Onde está cada coisa:
- **`apps/mobile/android/`** — o projeto Android/Gradle, **versionado e fonte da verdade**. Compila com
  `./gradlew bundleRelease` no PC e no workflow `.github/workflows/apps-nativos.yml`.
- `assetlinks.json` (esta pasta) — servido pelo nginx em `https://painel.garfeed.com.br/.well-known/assetlinks.json`
  (montado no container; editar e reiniciar o nginx, sem rebuild). **Contém um placeholder do SHA-256.**
- `twa-manifest.json` (esta pasta) — a configuração do Bubblewrap que deu origem ao projeto. Só serve para regenerar do zero.

Passo a passo completo (keystore, segredos do CI, SHA-256 da keystore de upload **e** da assinatura da Play no
`assetlinks.json`, publicação): **`docs/apps-nativos/COMPILAR-SEM-MAC.md`**.

## Mudar nome, cores ou URL inicial
Edite o bloco `twaManifest` em `apps/mobile/android/app/build.gradle`. Versão e número do build vêm das variáveis
`APP_VERSION` e `APP_BUILD_NUMBER`; a assinatura, de `ANDROID_KEYSTORE_PATH`, `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD` (sem elas o release sai sem assinatura).

## Regenerar o projeto (raro: só para atualizar o modelo do Bubblewrap)
O projeto foi gerado uma vez com `@bubblewrap/core` 1.27.0 a partir do `twa-manifest.json` e depois ajustado à mão.
Se rodar `bubblewrap update --manifest=infra/twa/twa-manifest.json` de novo, reaplique:
1. `app/build.gradle`: `versionCode`/`versionName` lidos de `APP_BUILD_NUMBER`/`APP_VERSION` e o bloco `signingConfigs` por variáveis de ambiente;
2. `build.gradle`: `mavenCentral()` no lugar de `jcenter()`;
3. ícones: `mipmap-*/ic_maskable.png` (ícone a 80% sobre marinho, para não cortar na máscara redonda) e
   `drawable-*/ic_notification_icon.png` (símbolo branco com fundo transparente — o do Bubblewrap vira um quadrado branco);
4. `app/src/main/res/raw/web_app_manifest.json` = cópia de `apps/painel/public/manifest.webmanifest`.

`minSdkVersion` é 24 (Android 7): exigência da `androidbrowserhelper` 2.7.

## Play Store
Ícone 512×512: `docs/assets/loja-e-icones/icone-app-512.png` · gráfico de destaque 1024×500:
`docs/assets/loja-e-icones/play-store-feature-1024x500.png` (regras em `docs/KIT-README.md`).
