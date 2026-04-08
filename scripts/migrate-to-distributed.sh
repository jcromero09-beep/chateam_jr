#!/bin/bash
set -e

echo "=== JR Chateam: Migración a Modo Distribuido (8 nodos) ==="
echo "ADVERTENCIA: ~15 minutos de downtime. El frontend seguirá corriendo."
echo ""

echo "1. Compilando TypeScript..."
npx tsc

echo "2. Backup de Redis (BGSAVE en background)..."
redis-cli BGSAVE &
sleep 1

echo "3. Deteniendo servidores actuales..."
pm2 stop all 2>/dev/null || true

echo "4. Limpiando registry anterior de Redis..."
redis-cli DEL sessions:registry 2>/dev/null || true

echo "5. Asegurando que el directorio de logs existe..."
mkdir -p /home/deploy/.pm2/logs

echo "6. Iniciando modo distribuido (8 nodos + worker + frontend)..."
pm2 start ecosystem.config.js

echo "7. Esperando 30s para que los nodos se estabilicen..."
sleep 30

echo ""
echo "=== Status de los nodos ==="
pm2 list

echo ""
echo "=== Verificando health de nodos ==="
for port in 3001 3002 3003 3004 3005 3006 3007 3008; do
  echo -n "Node on port $port: "
  curl -s --connect-timeout 3 http://localhost:$port/internal/health 2>/dev/null | grep -o '"nodeId":"[^"]*"' || echo "OFFLINE"
done

echo ""
echo "=== Verificando distribución de sesiones en Redis ==="
redis-cli HLEN sessions:registry

echo ""
echo "=== Migración completada ==="
echo "Para verificar logs de un nodo específico:"
echo "  pm2 logs node-1 --lines 50"
echo ""
echo "Para rollback (si hay problemas):"
echo "  pm2 stop all && pm2 delete all"
echo "  # Luego restaurar ecosystem.config.js original y:"
echo "  # pm2 start ecosystem.config.backup.js"
