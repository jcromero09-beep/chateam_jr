import crypto from 'crypto';

/**
 * Generate secure random secrets for production environment
 */

function generateSecret(length = 64) {
  return crypto.randomBytes(length).toString('hex');
}

function generateBase64Secret(length = 32) {
  return crypto.randomBytes(length).toString('base64');
}

console.log('🔐 Generando credenciales seguras para JR Chateam v6.0.0\n');
console.log('=' .repeat(60));
console.log('\n📋 CREDENCIALES GENERADAS (Guardar en lugar seguro):\n');

console.log('# JWT Secrets (32+ caracteres requeridos)');
console.log(`JWT_SECRET=${generateSecret(32)}`);
console.log(`JWT_REFRESH_SECRET=${generateSecret(32)}`);
console.log('');

console.log('# Database Passwords');
console.log(`DB_PASSWORD=${generateSecret(24)}`);
console.log('');

console.log('# Redis Password');
console.log(`REDIS_PASSWORD=${generateSecret(24)}`);
console.log('');

console.log('# MinIO/S3 Credentials');
console.log(`S3_ACCESS_KEY=${generateSecret(20)}`);
console.log(`S3_SECRET_KEY=${generateSecret(40)}`);
console.log('');

console.log('# Session Secret');
console.log(`SESSION_SECRET=${generateSecret(32)}`);
console.log('');

console.log('# Encryption Key');
console.log(`ENCRYPTION_KEY=${generateBase64Secret(32)}`);
console.log('');

console.log('# Master Key (Emergency Access)');
console.log(`MASTER_KEY=${generateSecret(32)}`);
console.log('');

console.log('=' .repeat(60));
console.log('\n⚠️  IMPORTANTE:');
console.log('- Copiar estos valores a un gestor de contraseñas seguro');
console.log('- NO commitear archivos .env con credenciales reales');
console.log('- Rotar credenciales cada 90 días en producción');
console.log('- Usar diferentes valores para desarrollo y producción');
console.log('');
