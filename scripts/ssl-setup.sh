#!/bin/bash
# Script de configuración SSL con Let's Encrypt

set -e

DOMAIN=$1

if [ -z "$DOMAIN" ]; then
    echo "❌ Uso: $0 <dominio>"
    echo "Ejemplo: $0 api.chateam.com"
    exit 1
fi

echo "🔒 Configurando SSL para $DOMAIN..."

# Instalar certbot
echo "📦 Instalando certbot..."
sudo apt update
sudo apt install certbot python3-certbot-nginx -y

# Generar certificado
echo "🔐 Generando certificado SSL..."
sudo certbot certonly --standalone -d $DOMAIN

# Verificar certificado
echo "✅ Verificando certificado..."
sudo certbot certificates

# Configurar renovación automática
echo "🔄 Configurando renovación automática..."
sudo crontab -e
# Agregar: 0 3 * * * certbot renew --quiet

echo "🎉 SSL configurado exitosamente!"
echo "📄 Certificado: /etc/letsencrypt/live/$DOMAIN/"