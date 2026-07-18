#!/bin/bash
# Script de carga de datos de prueba

set -e

echo "🌱 Cargando datos de prueba..."

# Verificar que la base de datos esté disponible
if ! docker-compose exec -T postgres pg_isready -U chateam > /dev/null 2>&1; then
    echo "❌ Base de datos no disponible"
    exit 1
fi

# Cargar seeds
echo "📦 Ejecutando seeds..."
docker-compose run --rm app npm run db:seed

# Verificar que los datos se cargaron correctamente
echo "✅ Verificando datos..."
docker-compose exec postgres psql -U chateam -d chateam -c "SELECT COUNT(*) FROM \"Companies\";" | grep -q "[1-9]"

echo "🎉 Datos de prueba cargados exitosamente!"