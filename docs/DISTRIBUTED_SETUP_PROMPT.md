# Prompt para Replicar Sistema Distribuido ChatEAM — 8 Nodos WhatsApp

> **Contexto**: Este prompt permite a otra IA reproducir exactamente lo que se implementó.
> Tiempo estimado: 45 minutos de trabajo.
> Dependencias externas: Node.js 20, PostgreSQL, Redis (puerto 5000), PM2, Nginx.

---

## CONTEXTO DEL PROYECTO

- **Proyecto**: ChatEAM JR — CRM omnicanal con WhatsApp (Baileys), Node.js/TypeScript
- **Ubicación**: `/home/deploy/chateam_jr/`
- **Puerto actual backend**: 4000
- **Puerto Redis**: 5000 (IORedis)
- **Puerto frontend**: 3000
- **Stack**: Express, Sequelize/PostgreSQL, Socket.IO, Baileys, Bull queues (Redis)

---

## FASE 0 — AUDITORÍA PREVIA

Antes de tocar código, leer estos archivos:

```bash
# 1. Ver archivo actual de servidor
cat /home/deploy/chateam_jr/server-simple.ts

# 2. Ver modelo WhatsApp (para conocer los campos)
head -60 /home/deploy/chateam_jr/models/Whatsapp.ts

# 3. Ver configuración Redis actual
grep REDIS /home/deploy/chateam_jr/.env

# 4. Ver ecosystem.config.js actual
cat /home/deploy/chateam_jr/ecosystem.config.js

# 5. Ver Nginx actual
cat /etc/nginx/sites-enabled/atendimento-backend

# 6. Ver estado de WhatsApps en BD
# (conectarse a PostgreSQL chateamjr como usuário atendimento)
psql -h localhost -U atendimento -d chateamjr -c "SELECT id, name, channel, status FROM \"Whatsapps\";"
```

---

## FASE 1 — Optimizaciones de Baileys (0 downtime)

**Archivo**: `libs/wbot.ts`

### Cambio 1: Reducir msgCache (líneas 43-48)

**ANTES:**
```typescript
const msgCache = new NodeCache({
  stdTTL: 3600,
  maxKeys: 5000,
  checkperiod: 600,
  useClones: false
});
```

**DESPUÉS:**
```typescript
const msgCache = new NodeCache({
  stdTTL: 600,      // 10 min en vez de 1 hora
  maxKeys: 1000,    // 1000 en vez de 5000
  checkperiod: 120, // Limpieza cada 2 min
  useClones: false
});
```

### Cambio 2: Optimizar socketConfig dentro de initWASocket()

**ANTES:**
```typescript
generateHighQualityLinkPreview: true,
emitOwnEvents: true,
fireInitQueries: true,
keepAliveIntervalMs: 30000,
```

**DESPUÉS:**
```typescript
generateHighQualityLinkPreview: false,
emitOwnEvents: false,
fireInitQueries: false,
keepAliveIntervalMs: 45000, // Ping cada 45s
```

**Verificación**: `cd /home/deploy/chateam_jr && ./node_modules/.bin/tsc --noEmit`

---

## FASE 2 — Infraestructura Multi-Proceso (backward compatible)

### PASO 2.1 — Crear `libs/sessionRegistry.ts`

```typescript
// libs/sessionRegistry.ts
// Mapea whatsappId → nodeId:port en Redis HASH "sessions:registry"
// Funciones: register, lookup, unregister, getNodeSessions, getNodeCounts,
// getLeastLoadedNode, acquireLock, releaseLock, reassign
// Importar cacheLayer desde "./cache"
// Singleton exportado como sessionRegistry
```

### PASO 2.2 — Crear `libs/heartbeat.ts`

```typescript
// libs/heartbeat.ts
// Cada nodo reporta liveness cada 10s con SETEX TTL 30s en Redis
// Key: "nodes:heartbeat:{nodeId}"
// Esperar a que Redis.status === "ready" ANTES de iniciar
// Funciones: startHeartbeat(), stopHeartbeat(), isNodeAlive(), getAliveNodes()
```

### PASO 2.3 — Crear `libs/watchdog.ts`

```typescript
// libs/watchdog.ts
// SOLO corre en node-1 (primario)
// Cada 30s verifica si nodos están vivos (keys heartbeat expiradas)
// Si un nodo murió → getLeastLoadedNode() → reassign() → HTTP POST /internal/session/:id/restart
// Funciones: startWatchdog(), stopWatchdog()
```

### PASO 2.4 — Crear `libs/interProcessRouter.ts`

```typescript
// libs/interProcessRouter.ts
// Cache local NodeCache 30s para evitar consultar Redis en cada request
// Funciones: resolveSession(whatsappId) → {isLocal, nodeId, port},
// routeRequest(whatsappId, path, body) → axios.post al nodo correcto,
// invalidateRouteCache(whatsappId)
```

### PASO 2.5 — Crear `libs/stagedConnection.ts`

```typescript
// libs/stagedConnection.ts
// Inicia sesiones en batches de 20 con delays de 3s entre batches
// Evita saturar CPU y rate-limiting de WhatsApp al arrancar muchas sesiones
// Función: stagedStart(items, startFn)
```

### PASO 2.6 — Crear `routes/internal.ts`

```typescript
// routes/internal.ts
// Endpoints localhost-only para comunicación entre procesos
// MIDDLEWARE: verificar que IP === 127.0.0.1 || ::1 || ::ffff:127.0.0.1
//
// Rutas necesarias:
// - POST /internal/send → wbot.sendMessage(whatsappId, to, message, options)
// - GET  /internal/session/:id/status → {connected, nodeId}
// - POST /internal/session/:id/restart → StartWhatsAppSession
// - GET  /internal/health → {nodeId, port, sessions, memoryMB, uptime}
```

### PASO 2.7 — Instalar dependencia

```bash
cd /home/deploy/chateam_jr
npm install @socket.io/redis-adapter
```

### PASO 2.8 — Modificar `libs/socket.ts`

Después de `io = new SocketIO(httpServer, {...})`, agregar:

```typescript
// Redis adapter para Socket.IO distribuido entre procesos
if (process.env.DISTRIBUTED_MODE === "true") {
  import("@socket.io/redis-adapter").then(async ({ createAdapter }) => {
    const { createClient } = await import("redis");
    const pubClient = createClient({ url: process.env.REDIS_URI || "redis://localhost:6379" });
    const subClient = pubClient.duplicate();
    await Promise.all([pubClient.connect(), subClient.connect()]);
    io.adapter(createAdapter(pubClient, subClient));
    logger.info("[Socket.IO] Redis adapter connected for distributed mode");
  });
}
```

**NOTA**: `REDIS_URI` del proyecto es `redis://127.0.0.1:5000` (puerto 5000, no 6379)

### PASO 2.9 — Modificar `libs/wbot.ts`

**En `initWASocket`**, dentro del bloque `if (connection === "open")`, después de `sessions.push(wsocket)`:

```typescript
// Registrar en Redis que esta sesión pertenece a este nodo
if (process.env.DISTRIBUTED_MODE === "true") {
  try {
    const { sessionRegistry } = require("./sessionRegistry");
    await sessionRegistry.register(whatsapp.id);
    logger.info(`[Registry] Session ${whatsapp.id} registered to ${sessionRegistry.getNodeId()}`);
  } catch (regError: any) {
    logger.warn(`[Registry] Could not register session: ${regError.message}`);
  }
}
```

**En `removeWbot`**, después de `sessions.splice(sessionIndex, 1)`:

```typescript
// Desregistrar de Redis
if (process.env.DISTRIBUTED_MODE === "true") {
  try {
    const { sessionRegistry } = require("./sessionRegistry");
    await sessionRegistry.unregister(whatsappId);
  } catch (e) { /* ignore */ }
}
```

### PASO 2.10 — Modificar `helpers/GetWhatsappWbot.ts`

Reemplazar para detectar sesiones en otros nodos:

```typescript
import { getWbot } from "../libs/wbot";
import { resolveSession } from "../libs/interProcessRouter";
import logger from "../utils/logger";

const GetWhatsappWbot = async (whatsapp: any) => {
  try {
    return getWbot(whatsapp.id);
  } catch (error: any) {
    if (process.env.DISTRIBUTED_MODE === "true" &&
        error.message === "ERR_WAPP_NOT_INITIALIZED") {
      const location = await resolveSession(whatsapp.id);
      if (location && !location.isLocal) {
        throw new Error(`SESSION_ON_REMOTE_NODE:${location.nodeId}:${location.port}`);
      }
    }
    throw error;
  }
};
export default GetWhatsappWbot;
```

### PASO 2.11 — Modificar `app.ts`

**ANTES:**
```typescript
import routes from "./routes/index";
```

**DESPUÉS:**
```typescript
import routes from "./routes/index";
import internalRoutes from "./routes/internal";
```

**ANTES:**
```typescript
app.use(routes);
```

**DESPUÉS:**
```typescript
app.use(internalRoutes);  // localhost-only, antes de routes
app.use(routes);
```

**NOTA**: `dotenvConfig()` YA se ejecuta ANTES de los imports en este proyecto.
El import de `internalRoutes` va después de `dotenvConfig()` y antes de `app.use(routes)`.

### Verificación Fase 2

```bash
cd /home/deploy/chateam_jr && ./node_modules/.bin/tsc --noEmit
# Debe compilar sin errores
```

---

## FASE 3 — Activar Multi-Proceso

### PASO 3.1 — Crear `server-distributed.ts`

Nuevo entry point basado en `server-simple.ts` con:

```typescript
// Importar heartbeat, watchdog, sessionRegistry, stagedStart
// Leer de env: NODE_ID, PORT, MAX_SESSIONS (default 60)
// Forzar: process.env.DISTRIBUTED_MODE = "true"
// Solo node-1 inicia: startBackendQueueProcessors() + startBackendCronJobs()
// stagedStart() para iniciar sesiones de este nodo
// sessionRegistry.register() antes de cada StartWhatsAppSession
// startHeartbeat() en todos los nodos
// startWatchdog() solo en node-1
```

### PASO 3.2 — Crear `ecosystem.config.js`

**REEMPLAZAR** el archivo completo con:

```javascript
// 8 nodos backend (puertos 3001-3008) + worker + frontend
// Cada nodo usa: npx tsx server-distributed.ts
// Variables env: PORT, NODE_ID, MAX_SESSIONS=60, DISTRIBUTED_MODE=true
// node_args: --max-old-space-size=5120
// Puerto Redis: 5000 (en REDIS_URI, NO 6379)
// chateam-worker sigue igual (worker.ts)
// chateam-frontend sigue igual
```

### PASO 3.3 — Actualizar Nginx

**ANTES:**
```nginx
location / {
    proxy_pass http://127.0.0.1:4000;
```

**DESPUÉS:**
```nginx
upstream backend_nodes {
    ip_hash;
    server 127.0.0.1:3001;
    server 127.0.0.1:3002;
    server 127.0.0.1:3003;
    server 127.0.0.1:3004;
    server 127.0.0.1:3005;
    server 127.0.0.1:3006;
    server 127.0.0.1:3007;
    server 127.0.0.1:3008;
}

location / {
    proxy_pass http://backend_nodes;
```

```bash
nginx -t && nginx -s reload
```

### PASO 3.4 — Script de migración

Crear `scripts/migrate-to-distributed.sh`:

```bash
#!/bin/bash
echo "=== Migración a Modo Distribuido (8 nodos) ==="
npx tsc
pm2 stop all
redis-cli -p 5000 DEL sessions:registry  # limpiar registry anterior
mkdir -p /home/deploy/.pm2/logs
pm2 start ecosystem.config.js
sleep 30
# Verificar
for port in 3001 3002 3003 3004 3005 3006 3007 3008; do
  curl -s http://localhost:$port/internal/health
done
redis-cli -p 5000 HGETALL sessions:registry
```

### Ejecutar migración

```bash
bash scripts/migrate-to-distributed.sh
```

---

## VERIFICACIONES POST-MIGRACIÓN

### Health check de cada nodo:
```bash
for port in 3001 3002 3003 3004 3005 3006 3007 3008; do
  curl -s http://localhost:$port/internal/health | \
    python3 -c "import sys,json; d=json.load(sys.stdin); print(f\"Port $port: sessions={d['sessions']}, memory={d['memoryMB']}MB\")"
done
```

**Esperado**: 8 nodos online, cada uno reportando sus sesiones.

### Verificar Redis:
```bash
redis-cli -p 5000 HGETALL sessions:registry
# Muestra: whatsappId → nodeId:port
redis-cli -p 5000 KEYS "nodes:heartbeat:*"
# Muestra: keys de todos los nodos vivos
```

**Esperado**: Todas las sesiones registradas, 8 keys de heartbeat.

### Verificar logs de un nodo:
```bash
pm2 logs node-1 --lines 50
```

**Buscar**: `[Heartbeat] Started`, `[Registry] Session X registered`, `[Socket.IO] Redis adapter connected`

### Test funcional:
1. Conectar una sesión WhatsApp desde el frontend
2. Verificar que aparece en `redis-cli -p 5000 HGETALL sessions:registry`
3. Enviar un mensaje desde el agente → debe llegar correctamente
4. Verificar que WhatsApp status = CONNECTED en BD

---

## CRÍTICO: Fix del Proxy IPC en `getWbot()`

Después de migrar, si un agente envía desde node-1 para una sesión en node-6, fallará con `ERR_WAPP_NOT_INITIALIZED`.

**Solución obligatoria** en `libs/wbot.ts`, función `getWbot()`:

```typescript
export const getWbot = (whatsappId: number): Session => {
  const sessionIndex = sessions.findIndex(s => s.id === whatsappId);
  if (sessionIndex === -1) {
    if (process.env.DISTRIBUTED_MODE === "true") {
      return createRemoteSessionProxy(whatsappId);  // ✅ Proxy IPC
    }
    throw new AppError("ERR_WAPP_NOT_INITIALIZED");
  }
  return sessions[sessionIndex];
};

function createRemoteSessionProxy(whatsappId: number): any {
  return {
    id: whatsappId,
    isRemoteProxy: true,
    sendMessage: async (to: string, content: any, options?: any) => {
      const axios = require("axios");
      const location = require("./sessionRegistry").sessionRegistry;
      const nodeInfo = await location.lookup(whatsappId);
      if (!nodeInfo) throw new AppError("Session not found in registry");
      if (nodeInfo.nodeId === location.getNodeId()) {
        return getWbot(whatsappId).sendMessage(to, content, options);
      }
      const url = `http://127.0.0.1:${nodeInfo.port}/internal/send`;
      const response = await axios.post(url, {
        whatsappId, to, message: content, options
      }, { timeout: 15000 });
      return response.data.result;
    }
  };
}
```

Esto permite que **cualquier nodo** pueda enviar mensajes para **cualquier sesión** sin conocer dónde está.

---

## CORRECCIÓN DEL HEARTBEAT

Si aparece error `"Stream isn't writeable and enableOfflineQueue options is false"`,
modificar `libs/heartbeat.ts` para esperar a que Redis esté `ready`:

```typescript
let redisReady = false;

const waitForRedis = () => {
  return new Promise<void>(resolve => {
    if (redis.status === "ready") { redisReady = true; resolve(); return; }
    const check = () => {
      if (redis.status === "ready") { redisReady = true; resolve(); }
      else setTimeout(check, 500);
    };
    check();
  });
};

// En beat():
if (!redisReady) return;
try {
  await redis.setex(...)
} catch (error) {
  if (error.message?.includes("Stream isn't writeable")) return; // ignorar transitorio
  logger.error(...)
}

// Iniciar con delay:
setTimeout(async () => {
  await waitForRedis();
  beat();
  heartbeatTimer = setInterval(beat, HEARTBEAT_INTERVAL);
}, 5000);
```

---

## DIAGRAMA DE FLUJO — Cómo funciona

```
MENSAJE ENTRANTE (contacto escribe)
─────────────────────────────────────
Baileys socket local (nodo X)
  → evento messages.upsert
  → crea ticket + mensaje en BD
  → Socket.IO + Redis adapter → llega a todos los nodos
  ✅ 1 mensaje = 1 ticket. Sin duplicados.

MENSAJE SALIENTE (agente envía)
─────────────────────────────────────
REQUEST → Nginx (ip_hash) → Nodo A
  → SendWhatsAppMessage → getWbot(whatsappId)
  → ¿Sesión en Nodo A? → wbot.sendMessage() local ✅
  → ¿Sesión en Nodo B? → Proxy IPC → POST /internal/send → Nodo B ✅
```

---

## LEYES DEL SISTEMA

1. **BD SAGRADA**: Nunca DELETE, DROP ni TRUNCATE datos. Solo INSERT, UPDATE, CREATE.
2. **Sesiones Baileys son locales**: Cada socket existe en UN solo nodo. Redis solo guarda el mapeo.
3. **Redis adapter de Socket.IO replica eventos**, no datos Baileys. No hay conflictividad.
4. **ip_hash en Nginx**: Cada usuario siempre vuelve al mismo nodo para requests HTTP.
5. **Proxy IPC**: Permite que CUALQUIER nodo envíe mensajes para CUALQUIER sesión.
6. **Watchdog**: Si un nodo muere, reasigna sus sesiones automáticamente en 30s.
7. **backward compatible**: Si DISTRIBUTED_MODE !== "true", todo funciona como antes (1 proceso).
