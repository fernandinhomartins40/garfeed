#!/usr/bin/env bash
# Preparação ÚNICA da VPS compartilhada para o Garfeed. Roda NA VPS, como root, depois de copiar para /root:
#   garfeed-deploy  nginx-host.conf  garfeed_deploy.pub  (ver README, "Deploy na VPS compartilhada")
#   bash /root/preparar-vps.sh
# Idempotente: não recria .env nem certificado que já existam. Não toca nos outros sites do nginx.
set -euo pipefail
cd /root

install -m 755 garfeed-deploy /usr/local/bin/garfeed-deploy
sed -i 's/\r$//' /usr/local/bin/garfeed-deploy

# Chave do GitHub Actions: só consegue rodar o script de deploy
if ! grep -q "github-actions deploy garfeed" /root/.ssh/authorized_keys; then
  echo "command=\"/usr/local/bin/garfeed-deploy\",no-port-forwarding,no-X11-forwarding,no-agent-forwarding,no-pty $(cat garfeed_deploy.pub)" >> /root/.ssh/authorized_keys
fi

mkdir -p /opt/garfeed /opt/garfeed-backups
cd /opt/garfeed
[ -d .git ] || git init -q -b main
if [ ! -f .env ]; then
  umask 077
  r() { openssl rand -hex "$1"; }
  VAPID=$(docker run --rm node:20-alpine node -e "const c=require('crypto');const e=c.createECDH('prime256v1');e.generateKeys();const b=x=>x.toString('base64url');console.log(b(e.getPublicKey())+' '+b(e.getPrivateKey()))")
  cat > .env <<EOF
# Produção do Garfeed nesta VPS. Gerado em $(date +%F). Não commitar.
DOMAIN=garfeed.com.br
GARFEED_PORT=3140
POSTGRES_USER=garfeed
POSTGRES_PASSWORD=$(r 24)
POSTGRES_DB=garfeed
MINIO_ROOT_USER=garfeed
MINIO_ROOT_PASSWORD=$(r 24)
MINIO_BUCKET=garfeed-media
MEDIA_PUBLIC_URL=https://midia.garfeed.com.br/garfeed-media
CORS_ORIGINS=https://painel.garfeed.com.br,https://g.garfeed.com.br
COOKIE_DOMAIN=
JWT_ACCESS_SECRET=$(r 32)
GUEST_TOKEN_SECRET=$(r 32)
TAG_BASE_URL=https://g.garfeed.com.br
VAPID_PUBLIC_KEY=${VAPID% *}
VAPID_PRIVATE_KEY=${VAPID#* }
VAPID_SUBJECT=mailto:contato@garfeed.com.br
BACKUP_DIR=/opt/garfeed-backups
BACKUP_CRON="0 6 * * *"
BACKUP_RETENTION_DAYS=14
# senha do superadmin (admin@garfeed.com.br), usada só no comando de criação
SEED_PASSWORD=$(r 12)
RELEASE=latest
EOF
  echo ".env criado em /opt/garfeed/.env"
else
  echo ".env já existia, mantido"
fi

# nginx do host: primeiro só HTTP (desafio do certificado), depois HTTPS
SITE=/etc/nginx/sites-available/garfeed
if [ ! -f /etc/letsencrypt/live/garfeed.com.br/fullchain.pem ]; then
  awk '/^server \{/{n++} n<2' /root/nginx-host.conf > "$SITE"
  ln -sf "$SITE" /etc/nginx/sites-enabled/garfeed
  if nginx -t; then systemctl reload nginx; else rm -f /etc/nginx/sites-enabled/garfeed; echo "nginx -t falhou; site removido"; exit 1; fi
  certbot certonly -n --agree-tos --webroot -w /var/www/html --cert-name garfeed.com.br \
    -d garfeed.com.br -d www.garfeed.com.br -d g.garfeed.com.br -d painel.garfeed.com.br -d api.garfeed.com.br -d midia.garfeed.com.br
fi
cp "$SITE" /root/garfeed-nginx.bak 2>/dev/null || true
cp /root/nginx-host.conf "$SITE"
ln -sf "$SITE" /etc/nginx/sites-enabled/garfeed
if nginx -t; then
  systemctl reload nginx && echo "OK: nginx do host servindo garfeed.com.br em HTTPS (502 até o primeiro deploy)"
else
  cp /root/garfeed-nginx.bak "$SITE"; nginx -t && systemctl reload nginx
  echo "config HTTPS falhou; voltei para a anterior"; exit 1
fi
