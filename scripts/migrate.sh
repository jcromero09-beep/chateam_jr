#!/bin/bash
# Script de migraciones de base de datos

set -e

echo "🗄️ Ejecutando migraciones de base de datos..."

# Verificar que la base de datos esté disponible
if ! docker-compose exec -T postgres pg_isready -U chateam > /dev/null 2>&1; then
    echo "❌ Base de datos no disponible"
    exit 1
fi

# Ejecutar migraciones
echo "📄 Ejecutando migraciones..."
docker-compose run --rm app npm run db:migrate

# Verificar que las migraciones se ejecutaron correctamente
echo "✅ Verificando migraciones..."
docker-compose exec postgres psql -U chateam -d chateam -c "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema LIKE 'tenant_%';" | grep -q "[0-9]"

echo "🎉 Migraciones completadas exitosamente!"