#!/bin/bash
# Script de análisis de logs

SERVICE=${1:-app}
LINES=${2:-100}

echo "📋 Mostrando últimos $LINES logs de $SERVICE..."
echo "==============================================="

if [ "$SERVICE" = "all" ]; then
    echo "📄 Logs de aplicación:"
    docker-compose logs --tail=$LINES app
    echo -e "\n📄 Logs de worker:"
    docker-compose logs --tail=$LINES worker
    echo -e "\n📄 Logs de audit service:"
    docker-compose logs --tail=$LINES audit-service
else
    docker-compose logs --tail=$LINES $SERVICE
fi

echo -e "\n🔍 Análisis de errores..."
docker-compose logs --tail=1000 $SERVICE | grep -i error | wc -l

echo -e "\n⚡ Análisis de performance..."
docker-compose logs --tail=1000 $SERVICE | grep -E "(slow|timeout|delay)" | wc -l