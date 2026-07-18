#!/bin/bash
# Script de configuración inicial

set -e

echo "🚀 Configurando Chateam..."

# Instalar dependencias
echo "📦 Instalando dependencias..."
npm install

# Configurar base de datos
echo "🗄️ Configurando base de datos..."
npm run db:create
npm run db:migrate
npm run db:seed

# Construir frontend
echo "⚛️ Construyendo frontend..."
npm run build:frontend

# Configurar MinIO
echo "📁 Configurando MinIO..."
docker-compose up -d minio createbuckets

# Verificar configuración
echo "✅ Verificando configuración..."
npm run health:check

echo "🎉 Configuración completada!"
echo "🌐 Aplicación: http://localhost:3000"
echo "📊 MinIO Console: http://localhost:9001"
echo "🔍 Audit Service: http://localhost:8080"