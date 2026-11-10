# Backup: pg_dump 16 + mc (cliente do MinIO) + crond (busybox). Scripts em /usr/local/bin.
FROM pgsty/minio:RELEASE.2026-08-04T00-00-00Z AS mc
FROM postgres:16-alpine
COPY --from=mc /usr/bin/mcli /usr/local/bin/mc
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
# O cron não herda o ambiente do container: grava as variáveis e agenda o backup (BACKUP_CRON, UTC).
ENTRYPOINT ["/bin/sh", "-c", "export -p > /etc/backup.env && echo \"$BACKUP_CRON . /etc/backup.env; /usr/local/bin/backup.sh > /proc/1/fd/1 2>&1\" > /etc/crontabs/root && exec crond -f -l 8"]
