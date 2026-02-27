#!/bin/bash
# Script de recuperación de desastres

set -e

BACKUP_FILE=$1

if [ -z "$BACKUP_FILE" ]; then
    echo "❌ Uso: $0 <archivo_de_backup>"
    echo "Ejemplo: $0 backups/db_20250127_120000.sql"
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    echo "❌ Archivo de backup no encontrado: $BACKUP_FILE"
    exit 1
fi

echo "🔄 Iniciando recuperación desde $BACKUP_FILE..."

# Detener aplicación
echo "⏹️ Deteniendo aplicación..."
docker-compose down

# Levantar solo base de datos
echo "🗄️ Levantando base de datos..."
docker-compose up -d postgres
sleep 30

# Verificar que la base de datos esté lista
if ! docker-compose exec postgres pg_isready -U chateam > /dev/null 2>&1; then
    echo "❌ Base de datos no está lista"
    exit 1
fi

# Restaurar backup
echo "💾 Restaurando backup..."
docker-compose exec -T postgres psql -U chateam -d chateam < "$BACKUP_FILE"

# Verificar restauración
echo "✅ Verificando restauración..."
docker-compose exec postgres psql -U chateam -d chateam -c "SELECT COUNT(*) FROM \"Companies\";" | grep -q "[1-9]"

# Levantar aplicación completa
echo "🚀 Levantando aplicación..."
docker-compose up -d

# Health check
echo "🏥 Verificando health..."
sleep 30
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Recuperación completada exitosamente!"
else
    echo "❌ Error en health check después de recuperación"
    exit 1
fi