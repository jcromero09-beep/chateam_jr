#!/bin/bash
# Script de health check completo

echo "🏥 Verificando health de servicios..."

# Aplicación
if curl -f http://localhost:3000/health > /dev/null 2>&1; then
    echo "✅ Aplicación: OK"
else
    echo "❌ Aplicación: FAIL"
    exit 1
fi

# Base de datos
if docker-compose exec -T postgres pg_isready -U chateam > /dev/null 2>&1; then
    echo "✅ Base de datos: OK"
else
    echo "❌ Base de datos: FAIL"
    exit 1
fi

# Redis
if docker-compose exec -T redis redis-cli ping | grep -q PONG; then
    echo "✅ Redis: OK"
else
    echo "❌ Redis: FAIL"
    exit 1
fi

# MinIO
if curl -f http://localhost:9000/minio/health/ready > /dev/null 2>&1; then
    echo "✅ MinIO: OK"
else
    echo "❌ MinIO: FAIL"
    exit 1
fi

echo "🎉 Todos los servicios están saludables!"