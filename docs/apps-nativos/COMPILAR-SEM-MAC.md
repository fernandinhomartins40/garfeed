# Apps nativos do painel — compilar e publicar sem Mac

O app das lojas é o **painel do restaurante** (`https://painel.garfeed.com.br`) — dono, gerente, garçom e cozinha.
O cliente final continua sem instalar nada: abre o cardápio no navegador.

| | Android (Google Play) | iOS (App Store) |
|---|---|---|
| Tecnologia | TWA (o Chrome roda o painel em tela cheia) | Capacitor 8 (WKWebView) + push e NFC nativos |
| Projeto | `apps/mobile/android` | `apps/mobile` (config) e `apps/mobile/ios` (Xcode) |
| Identificador | `br.com.garfeed.painel` | `br.com.garfeed.painel` |
| Push | Web Push (VAPID), o mesmo do navegador | APNs direto da nossa API (sem Firebase) |
| NFC "Vincular placa" | Web NFC do Chrome | plugin nativo (`@capgo/capacitor-nfc`) |
| Onde compila | GitHub Actions (Linux) ou no seu PC | **só** no GitHub Actions (máquina macOS) |

Tudo é compilado pelo workflow **Apps nativos** (`.github/workflows/apps-nativos.yml`), que só roda quando você manda.
Atualizações de tela do painel **não** precisam de nova versão nas lojas: os apps carregam o site. Só publique versão
nova quando mudar algo nativo (ícone, permissões, plugins, versão do Capacitor).

---

## 1. Contas necessárias

| Conta | Custo | Observações |
|---|---|---|
| [Google Play Console](https://play.google.com/console/signup) | US$ 25 (uma vez) | Conta **pessoal** nova precisa de um teste fechado com 12 testadores por 14 dias antes de liberar produção. Conta de **organização** (CNPJ + D-U-N-S) não tem essa exigência. |
| [Apple Developer Program](https://developer.apple.com/programs/enroll/) | US$ 99 por ano | Como empresa (aparece o nome da empresa na loja) exige número D-U-N-S, gratuito, leva alguns dias. Como pessoa física aparece o seu nome. |
| GitHub | — | É onde o repositório já está. Repositório privado consome minutos do plano; **macOS conta 10x** (um build iOS leva ~10 a 15 min). |

Ferramentas no seu Windows: **Git Bash** (já vem com `openssl` e `base64`) e o **JDK 17** (traz o `keytool`).
Todos os comandos abaixo são para o Git Bash. Faça-os numa pasta **fora do repositório** (ex.: `C:\garfeed-chaves`)
e guarde essa pasta num lugar seguro (gerenciador de senhas / cofre). Nada disso vai para o git.

Onde cadastrar os segredos: GitHub → repositório → **Settings → Secrets and variables → Actions → New repository secret**.

---

## 2. Android

### 2.1 Criar a keystore de upload (uma vez)

```bash
keytool -genkeypair -v -keystore garfeed-upload.keystore -alias garfeed \
  -keyalg RSA -keysize 2048 -validity 10000
```

Ele pergunta uma senha e seus dados. **Guarde o arquivo e a senha**: é com ela que você envia atualizações.
(Se perder, dá para pedir a troca da chave de upload ao suporte da Play — desde que use a "Assinatura de apps do Google Play",
que é o padrão.)

### 2.2 Segredos do Android

| Segredo | Valor |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | saída de `base64 -w0 garfeed-upload.keystore` |
| `ANDROID_KEYSTORE_PASSWORD` | senha da keystore |
| `ANDROID_KEY_ALIAS` | `garfeed` |
| `ANDROID_KEY_PASSWORD` | senha da chave (a mesma da keystore, se você só apertou Enter) |

Sem esses segredos o workflow ainda gera um AAB **sem assinatura**, só para provar que compila.

### 2.3 Ligar o app ao site (`assetlinks.json`) — obrigatório

Sem isso o app abre com a barra de endereço do Chrome em vez de tela cheia.
O arquivo `infra/twa/assetlinks.json` precisa ter **dois** SHA-256:

1. **Da sua keystore de upload** (vale para APKs instalados à mão):
   ```bash
   keytool -list -v -keystore garfeed-upload.keystore -alias garfeed | grep SHA256
   ```
2. **Da chave de assinatura da Play** (é a que chega no celular de quem baixa da loja): Play Console → seu app →
   **Testar e lançar → Configuração → Assinatura de apps** → "Certificado da chave de assinatura do app" → SHA-256.
   Só aparece depois do primeiro envio de AAB.

Edite o arquivo trocando o texto `TROCAR:...` (formato `AB:CD:...`, maiúsculas, separado por dois-pontos):

```json
"sha256_cert_fingerprints": ["SHA256_DA_KEYSTORE_DE_UPLOAD", "SHA256_DA_ASSINATURA_DA_PLAY"]
```

Publique (o nginx serve em `https://painel.garfeed.com.br/.well-known/assetlinks.json`; basta reiniciar o nginx) e confira
abrindo essa URL no navegador. O Android guarda a verificação em cache: depois de corrigir, desinstale e instale o app de novo.

### 2.4 Compilar no seu PC (opcional)

```bash
cd apps/mobile/android
./gradlew assembleDebug        # APK de teste: app/build/outputs/apk/debug/app-debug.apk
./gradlew bundleRelease        # AAB: app/build/outputs/bundle/release/app-release.aab (sem assinatura)
```

Para assinar localmente, defina antes `ANDROID_KEYSTORE_PATH` (caminho completo da keystore), `ANDROID_KEYSTORE_PASSWORD`,
`ANDROID_KEY_ALIAS` e `ANDROID_KEY_PASSWORD`. Precisa de `apps/mobile/android/local.properties` com
`sdk.dir=C:/Users/SEU_USUARIO/AppData/Local/Android/Sdk` (ou a variável `ANDROID_HOME`).

---

## 3. iOS (tudo pelo site da Apple, sem Mac)

Entre em <https://developer.apple.com/account>. O **Team ID** (10 caracteres) aparece em *Membership details*.

### 3.1 App ID com Push e NFC

*Certificates, Identifiers & Profiles → Identifiers → +* → **App IDs → App** →
Description `Garfeed Painel`, Bundle ID **Explicit** `br.com.garfeed.painel` → marque **Push Notifications** e
**NFC Tag Reading** → Continue → Register.

### 3.2 Certificado de distribuição (.p12) com openssl

```bash
# 1) chave privada e pedido de certificado (CSR)
openssl genrsa -out ios-dist.key 2048
openssl req -new -key ios-dist.key -out ios-dist.csr -subj "//CN=Garfeed\emailAddress=SEU_EMAIL\C=BR"
```

(O `//` e as barras invertidas são manha do Git Bash no Windows. Em Linux/macOS use `-subj "/CN=Garfeed/emailAddress=SEU_EMAIL/C=BR"`.)

No site: *Certificates → +* → **Apple Distribution** → envie o `ios-dist.csr` → baixe o `distribution.cer`.

```bash
# 2) juntar certificado + chave num .p12 protegido por senha
openssl x509 -inform DER -in distribution.cer -out ios-dist.pem
openssl pkcs12 -export -legacy -inkey ios-dist.key -in ios-dist.pem -name "Apple Distribution" -out ios-dist.p12
```

Ele pede uma senha de exportação — é o segredo `IOS_DIST_CERT_PASSWORD`.
O `-legacy` é necessário: o macOS do GitHub não lê o formato novo do OpenSSL 3. Se o seu openssl reclamar do `-legacy`,
troque por `-certpbe PBE-SHA1-3DES -keypbe PBE-SHA1-3DES -macalg sha1`.
O certificado vale 1 ano; quando vencer, repita 3.2 e 3.3 (apps já publicados continuam funcionando).

### 3.3 Perfil de provisionamento App Store

*Profiles → +* → **App Store Connect** (em *Distribution*) → App ID `br.com.garfeed.painel` → selecione o certificado
criado acima → nome `Garfeed Painel App Store` → baixe o `.mobileprovision`.
Se depois você mudar as capacidades do App ID, gere o perfil de novo.

### 3.4 Chave do APNs (.p8) — é da API, não do GitHub

*Keys → +* → nome `Garfeed APNs` → marque **Apple Push Notifications service (APNs)** → Configure: ambiente
**Sandbox & Production**, restrição *Team Scoped* → Register → **baixe o `AuthKey_XXXXXXXXXX.p8` (só dá para baixar uma vez)**
e anote o **Key ID**.

Essa chave vai no `.env` da **API em produção** (não nos segredos do GitHub):

```env
APNS_KEY_ID=XXXXXXXXXX
APNS_TEAM_ID=SEU_TEAM_ID
APNS_KEY_P8=<saída de: base64 -w0 AuthKey_XXXXXXXXXX.p8>
APNS_BUNDLE_ID=br.com.garfeed.painel
APNS_PRODUCTION=true
```

Reinicie a API. Sem essas variáveis o push do iPhone fica desligado e o resto funciona normalmente.
`APNS_PRODUCTION=true` vale para TestFlight e App Store.

### 3.5 Chave da API do App Store Connect

<https://appstoreconnect.apple.com> → **Usuários e acesso → Integrações → API do App Store Connect → +** →
nome `GitHub Actions`, acesso **Gerente de apps (App Manager)** → baixe o `AuthKey_YYYYYYYYYY.p8` (uma vez só).
Anote o **Key ID** da linha e o **Issuer ID** no topo da página.

### 3.6 Criar o registro do app

App Store Connect → **Apps → + → Novo app** → plataforma iOS, nome `Garfeed Painel` (o nome precisa estar livre na loja),
idioma Português (Brasil), Bundle ID `br.com.garfeed.painel`, SKU `garfeed-painel`. Sem esse registro o envio do build falha.

### 3.7 Segredos do iOS

| Segredo | Valor |
|---|---|
| `IOS_DIST_CERT_P12_BASE64` | `base64 -w0 ios-dist.p12` |
| `IOS_DIST_CERT_PASSWORD` | senha de exportação do .p12 |
| `IOS_PROFILE_BASE64` | `base64 -w0 Garfeed_Painel_App_Store.mobileprovision` |
| `APPLE_TEAM_ID` | Team ID (10 caracteres) |
| `ASC_API_KEY_P8` | conteúdo do `AuthKey_YYYYYYYYYY.p8` (cole o texto inteiro, ou o `base64 -w0` dele) |
| `ASC_API_KEY_ID` | Key ID da chave do App Store Connect |
| `ASC_API_ISSUER_ID` | Issuer ID |

Faltando **qualquer um**, o job do iOS compila sem assinatura (só valida o projeto) e mostra um aviso amarelo.

---

## 4. Rodar o workflow

1. GitHub → aba **Actions** → **Apps nativos (Android + iOS)** → **Run workflow**.
2. `plataforma`: `ambos`, `android` ou `ios`. `versao`: a versão que aparece na loja (ex.: `1.0.0`).
   O número interno do build (versionCode / CFBundleVersion) é o número da execução e sobe sozinho.
3. **Android:** ao terminar, abra a execução → seção **Artifacts** → baixe `garfeed-painel-<versão>-<build>-aab` (zip com o
   `.aab`, guardado por 30 dias). Envie em Play Console → **Testar e lançar → Teste interno → Criar nova versão**.
4. **iOS:** o próprio workflow envia o build à Apple. Em 5 a 30 minutos ele aparece em App Store Connect → seu app →
   **TestFlight**. Adicione-se como testador interno e instale pelo app **TestFlight** no iPhone. Quando estiver bom,
   na aba **Distribuição** escolha esse build e envie para revisão.

Para uma versão nova nas lojas, aumente `versao` (ex.: `1.0.1`). Na Apple, a mesma `versao` aceita vários builds enquanto
não for aprovada.

---

## 5. Checklist de publicação

### As duas lojas
- [ ] Painel no ar em `https://painel.garfeed.com.br` e política de privacidade em <https://garfeed.com.br/privacidade/>.
- [ ] **Conta de demonstração**: um restaurante de teste com cardápio, mesas e uma placa já vinculada, e um usuário DONO
      (e-mail + senha) só para os revisores. Deixe um pedido de exemplo chegando para a tela não ficar vazia.
- [ ] Textos da ficha (pt-BR): nome, descrição curta e completa, e-mail de suporte.
- [ ] Capturas de tela nos tamanhos da seção 6 — telas reais do app, sem moldura obrigatória.

### Google Play
- [ ] Ficha: ícone 512, gráfico de destaque 1024×500, pelo menos 2 capturas, descrição curta (80 caracteres) e completa (4000).
- [ ] **Conteúdo do app**: política de privacidade (URL acima), acesso ao app (informe o login de demonstração),
      anúncios (não), classificação de conteúdo (questionário — tende a "Livre"), público-alvo (18+, uso profissional),
      **Segurança dos dados** (coleta e-mail e nome do funcionário para login; identificador de notificação; dados
      criptografados em trânsito; sem compartilhamento com terceiros).
- [ ] Categoria: **Negócios**.
- [ ] `assetlinks.json` com os dois SHA-256 (seção 2.3) — teste instalando pelo teste interno: tem de abrir sem barra de endereço.
- [ ] Conta pessoal nova: teste fechado com 12 testadores por 14 dias antes de pedir produção.

### App Store
- [ ] **Privacidade do app** (App Store Connect → Privacidade): Informações de contato (nome, e-mail) e Identificadores
      (ID do dispositivo, por causa do token de push) — vinculados ao usuário, para funcionalidade do app, **sem rastreamento**.
- [ ] Classificação etária (questionário → 4+), categoria **Negócios** (secundária: Comida e bebida), preço gratuito.
- [ ] **Informações para a revisão**: login de demonstração e uma nota como esta:
      > App de uso profissional para a equipe de restaurantes clientes do Garfeed. As contas são criadas pelo dono do
      > restaurante; não há cadastro nem compra dentro do app. Recursos nativos: notificações push de novos pedidos e
      > chamados; leitura NFC e câmera (QR) em "Placas → Vincular placa", para associar a placa física da mesa.
      > Sem a placa em mãos, o mesmo fluxo aceita o código digitado (ex.: GF0001).
      Se puder, anexe um vídeo curto do NFC lendo uma placa de verdade (o revisor não tem a placa).
- [ ] Criptografia: já declarado no app (`ITSAppUsesNonExemptEncryption = false`, só HTTPS padrão).
- [ ] Textos de permissão já estão no app (câmera: ler o QR da placa; NFC: ler a placa). O push pede permissão só
      quando o usuário toca em "Ativar notificações".
- [ ] O app roda em iPad, então a Apple **exige** capturas de iPad 13".

---

## 6. Tamanhos das artes (conferido nas páginas oficiais em 11/11/2026)

### Google Play — [fonte](https://support.google.com/googleplay/android-developer/answer/9866151)

| Arte | Tamanho | Formato | Obrigatório | Temos? |
|---|---|---|---|---|
| Ícone do app | 512 × 512 px | PNG 32 bits (com alfa), até 1024 KB | sim | `docs/assets/loja-e-icones/icone-app-512.png` |
| Gráfico de destaque | 1024 × 500 px | JPEG ou PNG 24 bits, sem alfa | sim | `docs/assets/loja-e-icones/play-store-feature-1024x500.png` |
| Capturas — telefone | lado entre 320 e 3840 px; lado maior no máx. 2× o menor. Recomendado 1080 × 1920 (9:16) | JPEG ou PNG 24 bits, sem alfa | mín. 2 no total, máx. 8 por tipo (4+ com 1080 px para aparecer em destaques) | a fazer |
| Capturas — tablet 7" e 10" | 1080 a 7680 px, 9:16 ou 16:9 (ex.: 1200 × 1920 e 1600 × 2560) | idem | recomendado (até 8 cada) | a fazer |
| Vídeo | link do YouTube | — | opcional | — |

### App Store — [fonte](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

De 1 a 10 capturas por tamanho, `.png` ou `.jpg`, **sem transparência**. A Apple reduz sozinha para as telas menores.

| Arte | Tamanho (retrato; paisagem = invertido) | Obrigatório |
|---|---|---|
| iPhone 6,9" (Dynamic Island, tela grande) | 1320 × 2868, 1290 × 2796 ou 1260 × 2736 | **sim, na prática**: sem ele a Apple exige o de 6,5" |
| iPhone 6,5" (Face ID, tela grande) | 1284 × 2778 ou 1242 × 2688 | só se não houver 6,9" |
| iPhone 6,3" (Dynamic Island, tela média) | 1206 × 2622 ou 1179 × 2556 | a seção "Required device sizes" pede ao menos uma; a mesma página diz que, sem ela, usa a de tela grande reduzida. **Envie 6,9" e 6,3"** para não depender disso |
| iPad 13" | 2064 × 2752 ou 2048 × 2732 | **sim** (o app roda em iPad) |
| iPad 11" / 12,9" | 1668 × 2420, 1668 × 2388, 1640 × 2360 / 2048 × 2732 | não (usa a de 13") |
| Ícone do app | 1024 × 1024 px, PNG **sem alfa**, cantos retos | sim — já vai dentro do build (`AppIcon`), não se envia à parte |

Jeito simples de tirar as capturas sem ter todos os aparelhos: no Chrome do PC, abra o painel, `F12` → modo dispositivo →
defina o tamanho exato em pixels com DPR 1 (ex.: 1320 × 2868) → menu ⋮ do modo dispositivo → *Capture screenshot*.

---

## 7. Problemas comuns

| Sintoma | Causa provável |
|---|---|
| Android abre com barra de endereço | `assetlinks.json` sem o SHA-256 certo (seção 2.3) ou site fora do ar na primeira abertura |
| Play recusa o AAB: "código de versão já usado" | rode o workflow de novo (o número sobe a cada execução) |
| iOS: `No signing certificate "Apple Distribution" found` | .p12 gerado sem `-legacy`, senha errada ou certificado de outro time |
| iOS: `Provisioning profile ... doesn't include the ... entitlement` | App ID sem Push ou NFC marcado; marque e **gere o perfil de novo** |
| iOS: envio falha com erro de autenticação | `ASC_API_KEY_ID` / `ASC_API_ISSUER_ID` trocados ou chave sem papel App Manager |
| iPhone não recebe push | variáveis `APNS_*` ausentes na API, ou notificações negadas em Ajustes → Garfeed |
| App iOS mostra "Sem conexão" | sem internet ou painel fora do ar; o botão tenta de novo |
