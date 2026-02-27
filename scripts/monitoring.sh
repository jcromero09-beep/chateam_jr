#!/bin/bash
# Script de monitoreo y métricas

echo "📊 Monitoreo de la plataforma Chateam..."
echo "========================================="

# Verificar servicios
echo "🔍 Verificando servicios..."
docker-compose ps

# Health checks
echo -e "\n🏥 Health checks..."
curl -f http://localhost:3000/health && echo "✅ API: OK" || echo "❌ API: FAIL"
curl -f http://localhost:8080/health && echo "✅ Audit: OK" || echo "❌ Audit: FAIL"

# Métricas de base de datos
echo -e "\n🗄️ Métricas de base de datos..."
docker-compose exec postgres psql -U chateam -d chateam -c "
SELECT
    schemaname as esquema,
    COUNT(*) as tablas,
    SUM(pg_total_relation_size(schemaname||'.'||tablename)) as tamaño_bytes
FROM pg_tables
WHERE schemaname LIKE 'tenant_%'
GROUP BY schemaname
ORDER BY tamaño_bytes DESC;
" 2>/dev/null | head -10

# Métricas de Redis
echo -e "\n🔄 Métricas de Redis..."
docker-compose exec redis redis-cli info memory | grep used_memory_human
docker-compose exec redis redis-cli info stats | grep total_commands_processed

# Espacio en disco
echo -e "\n💾 Espacio en disco..."
df -h /opt/chateam/data 2>/dev/null || df -h | grep -E "(Filesystem|/dev)"

# Jobs en cola
echo -e "\n📋 Jobs en cola..."
docker-compose exec redis redis-cli LLEN messageQueue 2>/dev/null || echo "Cola no disponible"

echo -e "\n✅ Monitoreo completado!"