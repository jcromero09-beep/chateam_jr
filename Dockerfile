# ==========================================
# DOCKERFILE - CHATEAM APPLICATION
# ==========================================

# Usar Node.js 20 LTS como base
FROM node:20-alpine AS base

# Instalar dependencias del sistema
RUN apk add --no-cache \
    curl \
    git \
    python3 \
    make \
    g++

WORKDIR /app

# ==========================================
# ETAPA DE DEPENDENCIAS
# ==========================================
FROM base AS deps

# Copiar archivos de dependencias
COPY package*.json ./
COPY yarn.lock* ./

# Instalar dependencias
RUN npm ci --only=production && npm cache clean --force

# ==========================================
# ETAPA DE BUILD
# ==========================================
FROM base AS builder

WORKDIR /app

# Copiar dependencias
COPY --from=deps /app/node_modules ./node_modules

# Copiar código fuente
COPY . .

# Compilar TypeScript
RUN npm run build

# ==========================================
# ETAPA DE PRODUCCIÓN
# ==========================================
FROM node:20-alpine AS production

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs
RUN adduser -S chateam -u 1001

WORKDIR /app

# Copiar dependencias de producción
COPY --from=deps --chown=chateam:nodejs /app/node_modules ./node_modules

# Copiar aplicación compilada
COPY --from=builder --chown=chateam:nodejs /app/dist ./dist
COPY --from=builder --chown=chateam:nodejs /app/public ./public
COPY --from=builder --chown=chateam:nodejs /app/package.json ./package.json

# Crear directorios necesarios
RUN mkdir -p logs uploads && chown -R chateam:nodejs logs uploads

# Cambiar a usuario no-root
USER chateam

# Exponer puerto
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Comando de inicio
CMD ["node", "dist/server.js"]