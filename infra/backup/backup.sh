#!/bin/sh
# Backup do Garfeed (roda pelo cron do container `backup`; manual: docker compose ... exec backup backup.sh)
#   /backups/pg/garfeed-AAAAMMDD-HHMMSS.dump  pg_dump formato custom, um por execução, retenção BACKUP_RETENTION_DAYS
#   /backups/minio/<bucket>/                  espelho incremental do bucket (não apaga: dumps antigos ainda acham a mídia)
# Se BACKUP_REMOTE_URL estiver definido, /backups inteiro é espelhado num S3 externo (cópia fora da VPS).
set -eu
DIR=/backups
STAMP=$(date -u +%Y%m%d-%H%M%S)
KEEP=${BACKUP_RETENTION_DAYS:-14}
mkdir -p "$DIR/pg" "$DIR/minio"

echo "[backup] $STAMP pg_dump"
pg_dump -h postgres -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc -f "$DIR/pg/garfeed-$STAMP.dump.part"
mv "$DIR/pg/garfeed-$STAMP.dump.part" "$DIR/pg/garfeed-$STAMP.dump"

echo "[backup] espelho do MinIO ($MINIO_BUCKET)"
mc alias set src http://minio:9000 "$MINIO_ROOT_USER" "$MINIO_ROOT_PASSWORD" > /dev/null
mc mirror --overwrite --quiet "src/$MINIO_BUCKET" "$DIR/minio/$MINIO_BUCKET"

echo "[backup] retenção: apagando dumps com mais de $KEEP dias"
find "$DIR/pg" -name 'garfeed-*.dump' -mtime +"$((KEEP - 1))" -print -delete

if [ -n "${BACKUP_REMOTE_URL:-}" ]; then
  echo "[backup] enviando para $BACKUP_REMOTE_URL/$BACKUP_REMOTE_BUCKET"
  mc alias set remote "$BACKUP_REMOTE_URL" "$BACKUP_REMOTE_ACCESS_KEY" "$BACKUP_REMOTE_SECRET_KEY" > /dev/null
  mc mb --ignore-existing "remote/$BACKUP_REMOTE_BUCKET" > /dev/null
  mc mirror --overwrite --remove --quiet "$DIR" "remote/$BACKUP_REMOTE_BUCKET"
fi
echo "[backup] ok: $DIR/pg/garfeed-$STAMP.dump ($(du -h "$DIR/pg/garfeed-$STAMP.dump" | cut -f1))"
