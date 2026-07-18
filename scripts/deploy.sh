#!/bin/bash
# Script de despliegue automático

set -e

echo "🚀 Iniciando despliegue..."

# Backup de base de datos
echo "💾 Creando backup..."
pg_dump -h localhost -U chateam chateam > backup_$(date +%Y%m%d_%H%M%S).sql

# Construir imágenes
echo "🔨 Construyendo imágenes..."
docker-compose build

# Ejecutar migraciones
echo "🗄️ Ejecutando migraciones..."
docker-compose run --rm app npm run db:migrate

# Desplegar
echo "📦 Desplegando..."
docker-compose up -d

# Health check
echo "🏥 Verificando health..."
sleep 30
curl -f http://localhost:3000/health || exit 1

echo "✅ Despliegue completado exitosamente!"