#!/bin/bash
# Script para hacer ejecutables todos los scripts

echo "🔧 Haciendo ejecutables todos los scripts..."

chmod +x scripts/*.sh

echo "✅ Todos los scripts son ahora ejecutables!"
echo "📋 Lista de scripts disponibles:"
ls -la scripts/*.sh