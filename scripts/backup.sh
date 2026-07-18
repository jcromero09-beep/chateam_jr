#!/bin/bash
# Script de backup completo

BACKUP_DIR="./backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

echo "💾 Creando backups..."

# Base de datos
pg_dump -h localhost -U chateam chateam > $BACKUP_DIR/db_$TIMESTAMP.sql

# Redis
redis-cli SAVE

# Archivos MinIO
mc alias set local http://localhost:9000 minio minio123
mc cp -r local/chateam-files $BACKUP_DIR/files_$TIMESTAMP/

# Subir a S3 remoto
aws s3 sync $BACKUP_DIR/ s3://chateam-backups/$TIMESTAMP/

echo "✅ Backup completado: $BACKUP_DIR"