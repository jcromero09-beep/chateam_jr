# Configuración Distribuida - ChatEAM JR v6.0.0

## Arquitectura General

```
                    ┌─────────────────────────────────────────┐
                    │           NGINX (Puerto 443)            │
                    │     appro.chateam.ws / chat.chateam.ws  │
                    └──────────────────┬──────────────────────┘
                                       │
                    ┌──────────────────┴──────────────────────┐
                    │           UPSTREAM backend_nodes       │
                    │              ip_hash                   │
                    │    ┌─────────────┬─────────────┐      │
                    │    │   node-1    │   node-2    │      │
                    │    │  127.0.0.1  │  127.0.0.1  │      │
                    │    │   :3001     │   :3002     │      │
                    │    └─────────────┴─────────────┘      │
                    └─────────────────────────────────────────┘
```

## Distribución de Procesos PM2

| Proceso | Puerto | Sesiones Max | Memoria |
|---------|--------|--------------|---------|
| **node-1** | 3001 | 250 | 5GB max |
| **node-2** | 3002 | 250 | 5GB max |
| **chateam-worker** | colas | 0 | 2GB max |
| **chateam-frontend** | 3000 | 0 | 1GB max |

**Total**: 2 nodos × 250 = **500 sesiones WhatsApp** capacidad máxima

---

## 1. PM2 - ecosystem.config.js

**Archivo**: `/home/deploy/chateam_jr/ecosystem.config.js`

```javascript
module.exports = {
  apps: [
    {
      name: 'node-1',
      script: 'npx tsx server-distributed.ts',
      cwd: '/home/deploy/chateam_jr',
      env: {
        NODE_ENV: 'production',
        NODE_ID: 'node-1',
        PORT: '3001',
        MAX_SESSIONS: '250',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_URL: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '5000',
        REDIS_PASSWORD: 'ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS='
      },
      max_memory_restart: '5G',
      autorestart: true,
      max_restarts: 30
    },
    {
      name: 'node-2',
      script: 'npx tsx server-distributed.ts',
      cwd: '/home/deploy/chateam_jr',
      env: {
        NODE_ENV: 'production',
        NODE_ID: 'node-2',
        PORT: '3002',
        MAX_SESSIONS: '250',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_URL: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000',
        REDIS_HOST: '127.0.0.1',
        REDIS_PORT: '5000',
        REDIS_PASSWORD: 'ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS='
      },
      max_memory_restart: '5G',
      autorestart: true,
      max_restarts: 30
    },
    {
      name: 'chateam-worker',
      script: 'npx tsx worker.ts',
      cwd: '/home/deploy/chateam_jr',
      env: {
        NODE_ENV: 'production',
        REDIS_URI: 'redis://:ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=@127.0.0.1:5000'
      },
      max_memory_restart: '2G'
    },
    {
      name: 'chateam-frontend',
      script: 'npx',
      args: 'vite preview --port 3000 --host',
      cwd: '/home/deploy/chateam_jr/frontend',
      max_memory_restart: '1G'
    }
  ]
};
```

### Comandos PM2

```bash
# Iniciar todos los servicios
pm2 start /home/deploy/chateam_jr/ecosystem.config.js

# Ver estado
pm2 list

# Ver logs de un nodo
pm2 logs node-1

# Reiniciar todos
pm2 restart all

# Guardar configuración
pm2 save
```

---

## 2. NGINX - Configuración de Upstream

**Archivo**: `/etc/nginx/sites-available/atendimento-backend`

```nginx
upstream backend_nodes {
    ip_hash;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
}

server {
  server_name appro.chateam.ws;

  location / {
    proxy_pass http://backend_nodes;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection 'upgrade';
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_cache_bypass $http_upgrade;
  }

  # Descarga de APK
  location /apk-download/ {
    alias /var/www/apk-downloads/;
    types { application/vnd.android.package-archive apk; }
    add_header Content-Disposition 'attachment';
    autoindex off;
  }

  listen 443 ssl;
  ssl_certificate /etc/letsencrypt/live/appro.chateam.ws/fullchain.pem;
  ssl_certificate_key /etc/letsencrypt/live/appro.chateam.ws/privkey.pem;
}

# Redirect HTTP a HTTPS
server {
  server_name appro.chateam.ws;
  listen 80;
  return 301 https://$host$request_uri;
}
```

### Verificar y Recargar Nginx

```bash
# Verificar configuración
nginx -t

# Recargar configuración
systemctl reload nginx
```

---

## 3. Redis - Coordinación entre Nodos

Redis acts as el coordinator central para las sesiones distribuidas.

### Keys utilizadas:

| Key | Tipo | Descripción |
|-----|------|-------------|
| `sessions:registry` | HASH | Mapa WhatsApp ID → Node ID:Port |
| `nodes:heartbeat:node-X` | STRING | Heartbeat de cada nodo (TTL 30s) |
| `sessions:{id}:creds` | STRING | Credenciales de sesión Baileys |
| `msg:pending:{wid}` | STRING | Mensajes pendientes (TTL 24h) |

### Puertos Redis:
- **Host**: 127.0.0.1
- **Puerto**: 5000
- **Password**: `ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=`

---

## 4. Servicios de Coordinación

### heartbeat.ts
- Reporta "vivo" cada 10 segundos a Redis
- TTL de 30 segundos (si no renueva, se considera muerto)
- **Ubicación**: `libs/heartbeat.ts`

### sessionRegistry.ts
- Registra qué nodo tiene cada sesión de WhatsApp
- Métodos: `register()`, `lookup()`, `unregister()`, `getNodeSessions()`
- **Ubicación**: `libs/sessionRegistry.ts`

### watchdog.ts
- Solo corre en **node-1** (primario)
- Cada 30 segundos verifica nodos muertos
- Reasigna sesiones huérfanas al nodo con menos carga
- **Ubicación**: `libs/watchdog.ts`

### interProcessRouter.ts
- Cuando un nodo no tiene una sesión local, consulta Redis y hace HTTP al nodo correcto
- **Ubicación**: `libs/interProcessRouter.ts`

---

## 5. messageRegistry.ts - Mapeo de Puertos

**Archivo**: `libs/messageRegistry.ts`

```typescript
const NODE_PORTS: Record<string, number> = {
  "node-1": 3001,
  "node-2": 3002,
};
```

Este archivo debe tener solo los nodos activos (no los 8 originales).

---

## 6. Flujo de un Mensaje

```
1. Frontend → POST /api/messages (sessionId=45)
2. Nginx → ip_hash → node-1 o node-2
3. Nodo consulta Redis: "sessions:registry" → "node-3:3004" (ejemplo)
4. Si no tiene la sesión local, hace HTTP interno al nodo correcto
5. Nodo destino llama Baileys sendMessage()
6. Respuesta de vuelta al frontend
```

---

## 7. Archivos Modificados para 2 Nodos

| Archivo | Cambio |
|---------|--------|
| `ecosystem.config.js` | Creado con 2 nodos + worker + frontend |
| `libs/messageRegistry.ts` | Reducido a solo node-1 y node-2 |
| `/etc/nginx/sites-available/atendimento-backend` | Upstream a 2 puertos |
| `config/redis.ts` | Password siempre incluida en URL |
| `utils/rateLimiterRedis.ts` | Constructor corregido |

---

## 8. Comandos de Diagnóstico

```bash
# Ver estado de PM2
pm2 list

# Ver logs de node-1
pm2 logs node-1 --lines 50

# Ver puertos escuchando
ss -tlnp | grep -E "3001|3002|3000"

# Testear CORS
curl -X OPTIONS https://appro.chateam.ws/api/auth/login \
  -H "Origin: https://chat.chateam.ws" \
  -H "Access-Control-Request-Method: POST"

# Ver sesiones en Redis (requiere password)
redis-cli -p 5000 -a "ZdG387FShYsm0SaaSoRlSAAsme09a754s1DHMSsIdS=" HGETALL sessions:registry
```

---

## 9. Capacidad y Recursos

| Recurso | Valor |
|---------|-------|
| **Sesiones WhatsApp** | 500 (250 por nodo) |
| **Memoria RAM** | ~10GB para nodos (5GB cada uno) |
| **CPU** | 20 cores disponibles (sobra) |
| **Redis clientes** | ~30 (reducido de ~107) |

**El servidor de Contabo (20 cores, 94GB RAM) tiene capacidad de sobra para 500+ sesiones.**

---

*Documento generado: 31-Marzo-2026*
*Versión: ChatEAM JR v6.0.0*