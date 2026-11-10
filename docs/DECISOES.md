# Decisões

## 2026-11-10 — "App nativo" no MVP
O PRD deixa app nativo fora do MVP (V3), mas o kit traz assets de Play Store (`docs/assets/loja-e-icones`).
Decisão: o cliente final continua sem app (PWA no navegador). Para a Play Store, empacotamos o **painel** (dono/garçom)
como **TWA** (Trusted Web Activity via Bubblewrap) apontando para `painel.garfeed.com.br`, com `assetlinks.json` servido pelo Nginx.
Sem código nativo próprio; app nativo de verdade continua V3.

## 2026-11-10 — Landing estática
`apps/landing` é HTML/CSS puro (sem framework), servido pelo Nginx em `garfeed.com.br`, seguindo `docs/referencias/landing-*.png`
e as regras de breakpoint de `docs/KIT-README.md`.
