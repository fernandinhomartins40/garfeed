# Cardápio de demonstração

`produtos.json` é a fonte única: categorias, opcionais e os 18 produtos do restaurante de demonstração (Brasa & Pão),
com o nome do arquivo de foto de cada um (`foto`).

- **Fotos**: `fotos/<foto>.jpg` (ou .png/.webp), vertical **1080×1920 (9:16)**. Geradas à parte (ver o prompt do Codex).
- **Vídeos** (opcional): `videos/<foto>.mp4`, vertical, até 30 s. Sem o arquivo, os itens com `"video": true` ganham um clipe
  de 6 s com zoom lento feito a partir da foto (ffmpeg) — demonstra e testa o processamento de vídeo.

Rodar (na raiz; a senha da conta de demonstração fica fora do repositório):

```sh
DEMO_EMAIL=... DEMO_PASSWORD=... node scripts/demo/cardapio-demo.mjs --refazer-midia            # produção
DEMO_EMAIL=carlos@brasaepao.com.br DEMO_PASSWORD=garfeed123 node scripts/demo/cardapio-demo.mjs --api=http://localhost:3000   # local (seed)
```

O script usa só a API (login → upload pré-assinado para o MinIO → worker → READY) e imprime o tamanho antes/depois de cada
mídia. É idempotente: casa categorias, opcionais e itens pelo nome.
