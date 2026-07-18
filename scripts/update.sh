#!/bin/bash
# Script de actualización de la aplicación

set -e

echo "🔄 Iniciando actualización de Chateam..."

# Backup antes de actualizar
echo "💾 Creando backup..."
./scripts/backup.sh

# Actualizar código
echo "📥 Actualizando código..."
git pull origin main

# Construir nuevas imágenes
echo "🔨 Construyendo imágenes..."
docker-compose build

# Ejecutar migraciones si las hay
echo "🗄️ Verificando migraciones..."
if git diff --name-only HEAD~1 | grep -q "database/migrations"; then
    echo "📄 Nuevas migraciones detectadas, ejecutando..."
    docker-compose run --rm app npm run db:migrate
else
    echo "✅ No hay nuevas migraciones"
fi

# Desplegar con zero-downtime
echo "🚀 Desplegando actualización..."
docker-compose up -d --no-deps

# Health check
echo "🏥 Verificando health..."
sleep 30
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Actualización completada exitosamente!"
else
    echo "❌ Error en health check, verificando logs..."
    docker-compose logs --tail=50 app
    exit 1
fi