#!/bin/bash
# Script de ejecución de tests

set -e

echo "🧪 Ejecutando tests..."

# Ejecutar tests unitarios
echo "🔍 Ejecutando tests unitarios..."
npm test

# Ejecutar tests de integración
echo "🔗 Ejecutando tests de integración..."
npm run test:integration

# Ejecutar tests E2E
echo "🌐 Ejecutando tests E2E..."
npm run test:e2e

# Ejecutar tests de performance
echo "⚡ Ejecutando tests de performance..."
npx artillery run tests/performance/load-test.yml

echo "🎉 Todos los tests pasaron exitosamente!"