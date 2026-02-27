#!/bin/bash
# Script de limpieza de recursos

echo "🧹 Iniciando limpieza de recursos..."

# Limpiar imágenes dangling
echo "🗑️ Limpiando imágenes Docker dangling..."
docker image prune -f

# Limpiar contenedores stopped
echo "🗑️ Limpiando contenedores stopped..."
docker container prune -f

# Limpiar volúmenes no usados
echo "🗑️ Limpiando volúmenes no usados..."
docker volume prune -f

# Limpiar logs antiguos (más de 30 días)
echo "🗑️ Limpiando logs antiguos..."
find /var/log/chateam -name "*.log" -mtime +30 -delete 2>/dev/null || echo "No se encontraron logs para limpiar"

# Limpiar backups antiguos (más de 90 días)
echo "🗑️ Limpiando backups antiguos..."
find /opt/chateam/backups -name "*.sql" -mtime +90 -delete 2>/dev/null || echo "No se encontraron backups para limpiar"

echo "✅ Limpieza completada!"