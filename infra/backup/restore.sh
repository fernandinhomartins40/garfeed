#!/bin/sh
# Restaura um backup do Garfeed (banco + mídia). Passo a passo no README ("Backup e restauração"):
#   docker compose --env-file .env -f infra/docker-compose.yml stop api worker
#   docker compose --env-file .env -f infra/docker-compose.yml exec backup restore.sh /backups/pg/garfeed-AAAAMMDD-HHMMSS.dump
#   docker compose --env-file .env -f infra/docker-compose.yml exec redis redis-cli FLUSHALL   # cache/filas antigos
#   docker compose --env-file .env -f infra/docker-compose.yml start api worker
# Sem argumento: usa o dump mais recente. ATENÇÃO: substitui o banco atual.
set -eu
DUMP=${1:-$(ls -1 /backups/pg/garfeed-*.dump | sort | tail -n 1)}
[ -f "$DUMP" ] || { echo "dump não encontrado: $DUMP" >&2; exit 1; }

echo "[restore] banco <- $DUMP"
pg_restore -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction "$DUMP"

echo "[restore] mídia <- /backups/minio/$MINIO_BUCKET"
mc alias set dst http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null
mc mb --ignore-existing "dst/$MINIO_BUCKET" > /dev/null
mc anonymous set download "dst/$MINIO_BUCKET" > /dev/null
mc mirror --overwrite --quiet "/backups/minio/$MINIO_BUCKET" "dst/$MINIO_BUCKET"
echo "[restore] ok"
