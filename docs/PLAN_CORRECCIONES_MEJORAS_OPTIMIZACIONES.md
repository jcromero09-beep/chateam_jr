# ChatEAM JR — Plan Maestro de Correcciones, Mejoras, Optimizaciones e Integraciones

> **Fecha:** 27 de Febrero de 2026
> **Versión:** 1.0
> **Estado actual del sistema:** Producción Activa
> **Readiness Score:** 4.2/10 → **Objetivo: 9/10**
> **Tiempo estimado total:** 8-12 semanas (4 fases)

---

## Tabla de Contenidos

1. [Resumen Ejecutivo de Hallazgos](#1-resumen-ejecutivo-de-hallazgos)
2. [Fase 1 — Crítico: Seguridad y Estabilidad (Semana 1-2)](#fase-1--crítico-seguridad-y-estabilidad-semana-1-2)
3. [Fase 2 — Alto: Rendimiento y Calidad (Semana 3-5)](#fase-2--alto-rendimiento-y-calidad-semana-3-5)
4. [Fase 3 — Medio: Optimizaciones y UX (Semana 6-8)](#fase-3--medio-optimizaciones-y-ux-semana-6-8)
5. [Fase 4 — Integraciones y Evolución (Semana 9-12)](#fase-4--integraciones-y-evolución-semana-9-12)
6. [Matriz de Riesgo Completa](#5-matriz-de-riesgo-completa)
7. [Métricas de Éxito](#6-métricas-de-éxito)

---

## 1. Resumen Ejecutivo de Hallazgos

### Auditoría realizada sobre:
- **Backend:** 400+ archivos TypeScript (controllers, services, models, routes, jobs, middleware)
- **Frontend:** 115+ archivos React/TSX (75+ páginas, 40+ componentes, 11 hooks)
- **Infraestructura:** Docker, NGINX, Redis, PostgreSQL, PM2, Monitoreo
- **Integraciones:** WhatsApp Baileys/Cloud API, Facebook, Telegram, WebChat, IA

### Hallazgos por Severidad

| Severidad | Backend | Frontend | Infra/Seguridad | Total |
|-----------|---------|----------|-----------------|-------|
| 🔴 **Crítico** | 5 | 4 | 8 | **17** |
| 🟠 **Alto** | 6 | 5 | 7 | **18** |
| 🟡 **Medio** | 8 | 7 | 5 | **20** |
| 🟢 **Bajo** | 4 | 5 | 3 | **12** |
| **Total** | **23** | **21** | **23** | **67** |

### Top 5 Riesgos Inmediatos

| # | Riesgo | Impacto | Dónde |
|---|--------|---------|-------|
| 1 | Secretos expuestos en `.env` (DB, Redis, JWT, Stripe, FB, OpenAI) | Breach total de datos | `.env` líneas 20-145 |
| 2 | `DISABLE_RATE_LIMIT=true` en producción | Ban de WhatsApp + DDoS vulnerable | `.env` línea 143 |
| 3 | Tokens de auth en `console.log` de producción | Exposición de sesiones | `middleware/tokenAuth.ts` |
| 4 | Headers de seguridad NGINX faltantes (HSTS, CSP, X-Frame) | XSS, Clickjacking, MIME sniffing | `nginx/conf.d/default.conf` |
| 5 | Pool de BD en 500 vs PostgreSQL max 100 | Agotamiento de conexiones → crash | `.env` + `config/database.ts` |

---

## FASE 1 — Crítico: Seguridad y Estabilidad (Semana 1-2)

> **Objetivo:** Cerrar todas las vulnerabilidades críticas de seguridad y estabilizar la producción.
> **Impacto esperado:** Readiness Score 4.2 → 6.5

---

### 1.1 🔴 Secretos Expuestos — Rotación Inmediata

**Problema:** Todos los secretos están en texto plano en `.env` dentro del repositorio.

**Archivos afectados:**
- `.env` — DB_PASSWORD, REDIS_PASSWORD, JWT_SECRET, JWT_REFRESH_SECRET, STRIPE_PRIVATE, FB_ACCESS_TOKEN, IG_APP_SECRET, FACEBOOK_APP_SECRET, OPENAI_API_KEY, MAIL_PASS

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.1.1 | Rotar **TODOS** los tokens/passwords expuestos (DB, Redis, JWT, Stripe, Facebook, Instagram, OpenAI, SMTP) | P0 | 2h |
| 1.1.2 | Mover secretos a gestor seguro (AWS Secrets Manager, HashiCorp Vault, o como mínimo variables de entorno del host) | P0 | 4h |
| 1.1.3 | Agregar `.env` a `.gitignore` (verificar que no esté ya trackeado) | P0 | 15min |
| 1.1.4 | Crear `.env.example` con placeholders documentados | P0 | 1h |
| 1.1.5 | Auditar git history para commits con secretos (usar `git filter-branch` o BFG) | P0 | 2h |

---

### 1.2 🔴 Tokens Logueados en Producción

**Problema:** `middleware/tokenAuth.ts` imprime tokens JWT en console.log.

**Evidencia:**
```typescript
// middleware/tokenAuth.ts líneas 19, 25, 29
console.log('token enviado:', token);        // ❌ Token expuesto
console.log('token base chat:', getToken);   // ❌ Token expuesto
console.log('token enviado ee:', token);     // ❌ Token expuesto
```

**Archivos afectados:**
- `middleware/tokenAuth.ts` — 3 líneas con tokens
- `controllers/WebHookController.ts:32` — Body completo logueado
- `config/Gn.ts:1` — Config logueada

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.2.1 | Eliminar los 3 `console.log` de tokens en `tokenAuth.ts` | P0 | 10min |
| 1.2.2 | Eliminar `console.log` de body en `WebHookController.ts:32` | P0 | 10min |
| 1.2.3 | Eliminar `console.log` en `config/Gn.ts:1` | P0 | 5min |
| 1.2.4 | Implementar regla ESLint `no-console` para prevenir futuros | P0 | 30min |
| 1.2.5 | Auditar y limpiar los **1,286 console.log** restantes del backend | P1 | 4h |
| 1.2.6 | Auditar y limpiar los **386 console.log** del frontend | P1 | 3h |

---

### 1.3 🔴 Rate Limiting Deshabilitado

**Problema:** `DISABLE_RATE_LIMIT=true` desactiva TODA protección anti-abuso y anti-ban de WhatsApp.

**Evidencia:**
```env
# .env línea 143
DISABLE_RATE_LIMIT=true   # ❌ SIN PROTECCIÓN
```

**Además hay un typo:** `REGIS_OPT_LIMITER_DURATION` en vez de `REDIS_OPT_LIMITER_DURATION`

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.3.1 | Cambiar `DISABLE_RATE_LIMIT=false` | P0 | 5min |
| 1.3.2 | Corregir typo `REGIS_OPT_LIMITER_DURATION` → `REDIS_OPT_LIMITER_DURATION` | P0 | 5min |
| 1.3.3 | Verificar que rate limiting funciona correctamente después de activar | P0 | 1h |
| 1.3.4 | Configurar rate limiting por usuario autenticado (no solo por IP) | P1 | 3h |

---

### 1.4 🔴 NGINX — Headers de Seguridad Faltantes

**Problema:** Zero headers de seguridad HTTP configurados.

**Faltantes en `nginx/conf.d/default.conf`:**
- `Strict-Transport-Security` (HSTS)
- `X-Frame-Options`
- `X-Content-Type-Options`
- `Content-Security-Policy`
- `X-XSS-Protection`
- `Referrer-Policy`

**Problemas adicionales:**
- HTTP sin redirección a HTTPS
- GZIP no habilitado (desperdicio de 60-70% bandwidth)
- Upstreams sin health check (`max_fails`/`fail_timeout`)
- Archivo `nginx.prod.conf` referenciado en docker-compose pero NO EXISTE

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.4.1 | Agregar headers de seguridad HTTP completos | P0 | 1h |
| 1.4.2 | Configurar redirect HTTP → HTTPS | P0 | 30min |
| 1.4.3 | Habilitar GZIP para JSON, JS, CSS, HTML | P0 | 30min |
| 1.4.4 | Agregar `max_fails=3 fail_timeout=30s` a upstreams | P1 | 30min |
| 1.4.5 | Crear `nginx.prod.conf` referenciado en docker-compose.production.yml | P1 | 1h |

**Configuración recomendada:**
```nginx
# Security Headers
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
add_header X-Frame-Options "DENY" always;
add_header X-Content-Type-Options "nosniff" always;
add_header X-XSS-Protection "1; mode=block" always;
add_header Referrer-Policy "strict-origin-when-cross-origin" always;
add_header Content-Security-Policy "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; connect-src 'self' wss: https:;" always;

# Compression
gzip on;
gzip_vary on;
gzip_min_length 1000;
gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
```

---

### 1.5 🔴 Base de Datos — Pool y SSL

**Problema 1:** Pool max=500 pero PostgreSQL por defecto permite max_connections=100.
**Problema 2:** `DB_SSL=false` en producción — datos viajan sin encriptar.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.5.1 | Reducir `DB_POOL_MAX` de 500 a 80 (con 3 replicas = 240 total, bajo el límite de 100 por réplica) | P0 | 15min |
| 1.5.2 | Reducir `DB_POOL_IDLE` de 300000ms (5min) a 60000ms (1min) | P0 | 5min |
| 1.5.3 | Habilitar `DB_SSL=true` con certificados | P0 | 2h |
| 1.5.4 | Instalar PgBouncer como connection pooler | P1 | 4h |
| 1.5.5 | Configurar `max_connections=300` en PostgreSQL | P1 | 30min |

---

### 1.6 🔴 Frontend — Tokens en localStorage

**Problema:** Tokens JWT almacenados en `localStorage` — vulnerables a XSS.

**Evidencia:**
```typescript
// services/authService.ts líneas 35, 41
localStorage.setItem('token', data.token)
localStorage.setItem('refreshToken', data.refreshToken)
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.6.1 | Migrar access token a HttpOnly cookie (backend ya lo soporta) | P0 | 4h |
| 1.6.2 | Migrar refresh token a HttpOnly cookie con path `/api/auth/refresh` | P0 | 2h |
| 1.6.3 | Eliminar tokens de localStorage | P0 | 1h |
| 1.6.4 | Sanitizar `dangerouslySetInnerHTML` en `EmailMarketingPlantillas.tsx` con DOMPurify | P0 | 1h |

---

### 1.7 🔴 Backup y Disaster Recovery

**Problema:** Script de backup incompleto, sin validación, sin compresión, sin rotación.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.7.1 | Reescribir `scripts/backup.sh` con validación, compresión gzip, verificación de integridad | P0 | 3h |
| 1.7.2 | Agregar backup de MinIO (actualmente no incluido) | P0 | 1h |
| 1.7.3 | Usar `BGSAVE` en Redis en vez de `SAVE` (bloqueante) | P0 | 15min |
| 1.7.4 | Implementar rotación automática de backups (mantener últimos 30 días) | P1 | 2h |
| 1.7.5 | Configurar backup automático diario vía cron | P1 | 1h |
| 1.7.6 | Implementar test de restore mensual automatizado | P2 | 4h |

---

### 1.8 🔴 Docker — Imágenes sin Pin de Versión

**Problema:** 8 servicios en docker-compose.production.yml usan `:latest`.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 1.8.1 | Pinear todas las imágenes: `minio/minio:RELEASE.2024-XX-XX`, `prom/prometheus:v2.50.0`, `grafana/grafana:10.3.1`, etc. | P0 | 1h |
| 1.8.2 | Corregir `depends_on: condition: service_started` → `service_healthy` en scheduler | P1 | 15min |
| 1.8.3 | Cerrar puerto 9001 de MinIO (consola web expuesta innecesariamente) | P1 | 15min |

---

## FASE 2 — Alto: Rendimiento y Calidad (Semana 3-5)

> **Objetivo:** Eliminar cuellos de botella de rendimiento y mejorar calidad del código.
> **Impacto esperado:** Readiness Score 6.5 → 7.8

---

### 2.1 🟠 N+1 Queries y Queries sin Límite

**Problema:** Múltiples `findAll()` sin LIMIT que pueden devolver miles de registros + queries dentro de loops.

**Evidencia concreta:**

| Archivo | Problema | Impacto |
|---------|----------|---------|
| `services/CampaignService/FindAllService.ts:4` | `Campaign.findAll()` sin limit | Miles de campañas en memoria |
| `controllers/ApiController.ts:968,1062,1109` | 3 queries `ApiUsages.findAll()` sin limit | Memory explosion |
| `controllers/CampaignController.ts:88-91` | 2 queries secuenciales (ContactTag + Contact) sin JOIN | N+1 |
| `services/CampaignMessageServices/ImportSalesFromExcelService.ts:165-189` | 3 `findAll()` sin limit para importación | OOM en datasets grandes |
| `services/TicketServices/ListTicketsService.ts:175-245` | 4 queries grandes sin LIMIT/OFFSET | Timeout en BD |

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.1.1 | Agregar `limit: 1000` y paginación a TODOS los `findAll()` sin limit (8+ casos identificados) | P0 | 4h |
| 2.1.2 | Refactorizar `ListTicketsService.ts` — reemplazar 4 queries con 1 query con JOIN | P1 | 6h |
| 2.1.3 | Reemplazar queries secuenciales en `CampaignController.ts` con `include` (eager loading) | P1 | 2h |
| 2.1.4 | Agregar `include` (eager loading) en WhatsAppTemplateServices y otros servicios detectados (14+ queries) | P1 | 4h |
| 2.1.5 | Implementar DataLoader pattern para resolvers frecuentes | P2 | 8h |

---

### 2.2 🟠 Error Handling Deficiente en Backend

**Problema:** Controllers sin try/catch, promesas flotantes (async map sin await), errores silenciados.

**Evidencia:**

| Archivo | Problema |
|---------|----------|
| `controllers/DashbardController.ts:45-62` | Sin try/catch → crash si falla |
| `services/TicketServices/FindOrCreateTicketService.ts:22-100` | Múltiples await sin error handling |
| `libs/wbot.ts:133-138` | `whatsapps.map(async...)` sin await → promesas flotantes |
| `services/FileServices/UpdateService.ts:49,57` | `options.map(async...)` sin await |
| `services/QueueService/UpdateQueueService.ts:88,94` | `chatbots.map(async...)` sin await |

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.2.1 | Agregar try/catch en `DashbardController.ts` y todos los controllers sin error handling (15+ funciones) | P0 | 3h |
| 2.2.2 | Reemplazar todos los `array.map(async...)` con `await Promise.all(array.map(async...))` (6 casos) | P0 | 2h |
| 2.2.3 | Agregar error handling en `FindOrCreateTicketService.ts` | P1 | 1h |
| 2.2.4 | Implementar middleware global de error handling para Express | P1 | 3h |
| 2.2.5 | Agregar `.catch()` en todas las promesas del listener de wbot.ts | P1 | 2h |

---

### 2.3 🟠 Frontend — Sin Lazy Loading (75+ páginas)

**Problema:** TODAS las páginas se cargan en el bundle inicial. Solo 3 usos de `React.lazy` en todo el proyecto.

**Impacto:** Bundle inicial ~400KB+ minificado. TTI > 3.5s en 3G.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.3.1 | Implementar `React.lazy()` + `Suspense` para TODAS las páginas en App.tsx/routes | P0 | 4h |
| 2.3.2 | Crear componente `LoadingFallback.tsx` atractivo para Suspense | P1 | 1h |
| 2.3.3 | Implementar prefetching para rutas frecuentes (Dashboard, Tickets, Contacts) | P2 | 2h |

**Ejemplo de implementación:**
```typescript
// App.tsx
const Dashboard = lazy(() => import('./pages/Dashboard'))
const Tickets = lazy(() => import('./pages/Tickets'))
const Contacts = lazy(() => import('./pages/Contacts'))

<Suspense fallback={<LoadingFallback />}>
  <Routes>
    <Route path="/" element={<Dashboard />} />
    <Route path="/tickets" element={<Tickets />} />
    ...
  </Routes>
</Suspense>
```

---

### 2.4 🟠 Frontend — Componentes sin Memoización

**Problema:** 112+ componentes sin `React.memo`, `useMemo`, `useCallback` donde deberían tenerlos.

**Componentes más críticos:**

| Componente | LOC | Problema |
|-----------|-----|----------|
| `Tickets.tsx` | 2,134 | 0 `useMemo/useCallback`, crea objetos nuevos en cada render |
| `Dashboard.tsx` | 718 | Renderiza 30+ componentes sin optimización |
| `Contacts.tsx` | 450+ | Filter en cada render sin memoización |
| `ContactSegmentation.tsx` | 800+ | Lógica de gráficos sin `useMemo` |

**Problemas adicionales:**
- `key={index}` en listas (anti-pattern) en Dashboard.tsx línea 340
- Funciones lookup (`getActivityIcon`, `getActivityColor`) recreadas en cada render

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.4.1 | Memoizar `Tickets.tsx` — `useMemo` para listas, `useCallback` para handlers | P1 | 4h |
| 2.4.2 | Memoizar `Dashboard.tsx` — `useMemo` para statCards y datos de gráficos | P1 | 2h |
| 2.4.3 | Reemplazar `key={index}` por `key={item.id}` en todos los mapeos | P1 | 1h |
| 2.4.4 | Extraer lookup maps estáticos fuera del componente (`ACTIVITY_CONFIG`) | P2 | 1h |
| 2.4.5 | Aplicar `React.memo` a componentes puros de presentación (StatCard, MessageBubble, etc.) | P2 | 3h |

---

### 2.5 🟠 Frontend — Dependencias Duplicadas

**Problema:** Material-UI v4 + v7 coexistiendo. Dos librerías de toast. Bundle ~30% más pesado.

**Evidencia:**
```json
"@material-ui/core": "^4.12.4",     // DEPRECATED
"@material-ui/icons": "^4.11.3",    // DEPRECATED
"@mui/material": "^7.3.5",          // ACTUAL
"@mui/icons-material": "^7.3.4",    // ACTUAL
"@mui/joy": "^5.0.0-beta.52",       // ACTUAL
"react-toastify": "^11.0.5",        // USADO (11 archivos)
"sonner": "^2.0.7"                   // NUNCA USADO
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.5.1 | Migrar imports de `@material-ui/*` a `@mui/*` en todos los archivos afectados | P1 | 6h |
| 2.5.2 | Eliminar `@material-ui/core` y `@material-ui/icons` de package.json | P1 | 15min |
| 2.5.3 | Eliminar `sonner` de dependencias (0 usos) | P1 | 5min |
| 2.5.4 | Consolidar logging backend: elegir entre Winston y Pino (mantener Pino, eliminar Winston) | P2 | 4h |
| 2.5.5 | Consolidar date libs: elegir entre moment y date-fns (mantener date-fns, eliminar moment) | P2 | 3h |

---

### 2.6 🟠 Memory Leaks — WhatsApp Sessions

**Problema:** Maps globales en `wbot.ts` que acumulan entradas sin limpieza.

**Evidencia:**
```typescript
// libs/wbot.ts línea 58-66
const sessions: Session[] = [];                    // Nunca se limpian desconectados
const retriesQrCodeMap = new Map<number, number>(); // Acumula entries
const reconnectionAttemptsMap = new Map<number, number>(); // Acumula entries
const initializingSessions = new Map<number, number>(); // TTL manual de 5min
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.6.1 | Implementar cleanup automático de sessions desconectadas en `wbot.ts` | P1 | 3h |
| 2.6.2 | Agregar TTL y limpieza periódica a `retriesQrCodeMap` y `reconnectionAttemptsMap` | P1 | 2h |
| 2.6.3 | Implementar exponential backoff para reconexiones (actualmente no existe) | P1 | 3h |
| 2.6.4 | Agregar métricas de memoria de sessions para monitoreo | P2 | 2h |

---

### 2.7 🟠 Monitoreo — Configuración Incorrecta

**Problema:** Prometheus apunta a targets incorrectos.

**Evidencia:**
```yaml
# monitoring/prometheus.yml
- targets: ['host.docker.internal:9100']  # ❌ No funciona en Linux
- targets: ['postgres:5432']              # ❌ PostgreSQL no expone métricas en 5432
```

**Alertas faltantes:** Disk IOPS, Network bandwidth, File descriptors, TLS cert expiration, Backup failures, Redis persistence failures.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.7.1 | Corregir target node-exporter: `host.docker.internal:9100` → `node-exporter:9100` | P0 | 15min |
| 2.7.2 | Corregir target postgres: `postgres:5432` → `postgres-exporter:9187` | P0 | 15min |
| 2.7.3 | Agregar alertas de TLS certificate expiration | P1 | 1h |
| 2.7.4 | Agregar alertas de backup job failures | P1 | 1h |
| 2.7.5 | Agregar alertas de Redis persistence (RDB/AOF) failures | P2 | 1h |

---

### 2.8 🟠 Redis — Configuración Subóptima

**Problema:** Keys sin TTL garantizado + bug en `incr()`.

**Evidencia:**
```typescript
// config/redisCluster.ts línea 154
async incr(key: string, ttl?: number): Promise<number> {
  const value = await redisCluster.incr(this.getKey(key));
  if (ttl && value === 1) {  // ← BUG: Solo setea TTL si value==1
    await redisCluster.expire(this.getKey(key), ttl);
  }
  // Si key ya existe y se incrementa, NUNCA renueva el TTL
}
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 2.8.1 | Corregir bug de `incr()` — siempre renovar TTL en cada incremento | P0 | 30min |
| 2.8.2 | Configurar `maxmemory-policy=allkeys-lru` explícitamente en Redis | P1 | 30min |
| 2.8.3 | Auditar todas las keys sin TTL y agregar TTL apropiado | P1 | 2h |
| 2.8.4 | Habilitar AOF persistence (`appendonly yes`) en Redis de producción | P1 | 1h |

---

## FASE 3 — Medio: Optimizaciones y UX (Semana 6-8)

> **Objetivo:** Mejorar experiencia de usuario, type-safety, y mantenibilidad.
> **Impacto esperado:** Readiness Score 7.8 → 8.5

---

### 3.1 🟡 TypeScript — Eliminar `any` y `as any`

**Backend:** 25+ ocurrencias de `any`/`as any` en middleware, models, services.
**Frontend:** 30+ archivos con `any`, 15 archivos `.jsx` sin tipos, 15 archivos con `@ts-ignore`.

**Evidencia:**

```typescript
// Backend
(req as any).user = { ... }                  // middleware/isAuth.ts
const decoded = jwt.decode(token) as any;     // middleware/tenantMiddleware.ts
schedules: any[];                             // models/Whatsapp.ts, Queue.ts

// Frontend
quotedMsg?: any                               // pages/Tickets.tsx:79
user: any                                     // hooks/useSocketListeners.ts:27
// @ts-ignore                                 // 15 imports en FlowbuilderEditor.tsx
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.1.1 | Crear interfaz `AuthenticatedRequest extends Request` para eliminar `(req as any).user` | P1 | 2h |
| 3.1.2 | Tipar `schedules` en modelos: `Schedule[]` en vez de `any[]` (15+ campos) | P1 | 3h |
| 3.1.3 | Migrar 15 archivos `.jsx` de FlowBuilder a `.tsx` con tipos | P2 | 8h |
| 3.1.4 | Crear `/src/types/entities.ts` centralizado (Contact, Ticket, Message, etc.) para eliminar interfaces duplicadas en 5+ páginas | P2 | 4h |
| 3.1.5 | Habilitar `strict: true` en tsconfig.json (gradualmente) | P3 | 8h |

---

### 3.2 🟡 Naming — Corregir Typos

**Evidencia:**

| Archivo Actual | Correcto | Tipo |
|----------------|----------|------|
| `DashbardController.ts` | `DashboardController.ts` | Typo en nombre |
| `FindOrCreateATicketTrakingService.ts` | `...TrackingService.ts` | Typo "Traking" |
| `ChekIntegrations.ts` | `CheckIntegrations.ts` | Typo "Chek" |
| `TicketTraking.ts` (model) | `TicketTracking.ts` | Typo "Traking" |
| `REGIS_OPT_LIMITER_DURATION` (.env) | `REDIS_OPT_LIMITER_DURATION` | Typo "REGIS" |

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.2.1 | Renombrar archivos con typos y actualizar todos los imports | P2 | 3h |
| 3.2.2 | Corregir variable de entorno `REGIS` → `REDIS` | P1 | 15min |

---

### 3.3 🟡 Frontend — Accesibilidad (a11y)

**Problema:** Solo 3 atributos `aria-*` en 112+ componentes. 75% de imágenes sin `alt`.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.3.1 | Agregar `aria-label` a todos los IconButton (search, refresh, close, delete, etc.) | P1 | 3h |
| 3.3.2 | Agregar `alt` a todas las imágenes y avatares | P1 | 1h |
| 3.3.3 | Agregar `role` y `aria-*` a elementos interactivos custom | P2 | 3h |
| 3.3.4 | Implementar navegación con teclado en Kanban y FlowBuilder | P3 | 6h |
| 3.3.5 | Auditar con Lighthouse Accessibility y alcanzar score >85 | P2 | 4h |

---

### 3.4 🟡 Frontend — i18n Incompleto

**Problema:** i18next v25 instalado pero apenas se usa. 200+ strings hardcodeados en español.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.4.1 | Crear archivos de traducción completos: `es.json`, `pt.json`, `en.json` | P2 | 8h |
| 3.4.2 | Reemplazar strings hardcodeados por claves i18n (200+ strings) | P2 | 12h |
| 3.4.3 | Configurar i18next correctamente con `react-i18next` y `useTranslation` hook | P2 | 2h |
| 3.4.4 | Agregar selector de idioma en Settings | P3 | 3h |

---

### 3.5 🟡 Frontend — State Management

**Problema:** Prop drilling excesivo en Tickets.tsx (15+ props pasadas por 5 niveles). Estados que deberían estar en Context.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.5.1 | Crear `TicketContext` para eliminar prop drilling en Tickets.tsx | P1 | 4h |
| 3.5.2 | Mover modo oscuro/claro al ThemeContext existente (actualmente duplicado en 20+ componentes) | P2 | 2h |
| 3.5.3 | Crear `NotificationContext` para centralizar notificaciones | P2 | 3h |
| 3.5.4 | Evaluar migración a Zustand o Jotai para estado complejo | P3 | Evaluación |

---

### 3.6 🟡 Frontend — Validación de Formularios

**Problema:** Formik/Yup instalados pero apenas usados (4 usos vs 75+ páginas con formularios).

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.6.1 | Implementar Yup schemas para Login, SignUp, Contact creation, Ticket creation | P1 | 4h |
| 3.6.2 | Agregar confirmación Dialog para acciones destructivas (delete contact, close ticket, delete tag, delete plan) | P1 | 3h |
| 3.6.3 | Agregar feedback de loading en todos los botones de submit | P2 | 3h |

---

### 3.7 🟡 Archivos Muertos y Deuda Técnica

**Backend:**

| Archivo | Problema |
|---------|----------|
| `.backup-fase1-20260227-112501/` | 8 archivos de backup huérfanos |
| `helpers/Mustache_old.ts` | Versión antigua, nunca importada |
| `services/TicketServices/FindOrCreateTicketService_backup.ts` | Backup sin uso |

**Frontend:**
| Archivo | Problema |
|---------|----------|
| `pages/Tickets copy.tsx` | Copia de Tickets.tsx (1,397 líneas) |
| `sonner` dependency | 0 usos |

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.7.1 | Eliminar directorio `.backup-fase1-*` | P2 | 10min |
| 3.7.2 | Eliminar `Mustache_old.ts` y `FindOrCreateTicketService_backup.ts` | P2 | 10min |
| 3.7.3 | Auditar y eliminar `Tickets copy.tsx` del frontend | P2 | 30min |
| 3.7.4 | Ejecutar `depcheck` para encontrar dependencias no usadas en ambos package.json | P2 | 1h |

---

### 3.8 🟡 Índices de Base de Datos Faltantes

**Problema:** Queries lentas por falta de índices en tablas frecuentes.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.8.1 | Agregar índice compuesto en `Messages(ticketId, createdAt)` | P1 | 30min |
| 3.8.2 | Agregar índice en `Tickets(whatsappId, companyId)` | P1 | 30min |
| 3.8.3 | Agregar índice en `Tickets(status, companyId)` para ListTicketsService | P1 | 30min |
| 3.8.4 | Revisar `EXPLAIN ANALYZE` de las 10 queries más frecuentes | P2 | 3h |
| 3.8.5 | Agregar error handling en migraciones (algunas ignoran errores con `catch(console.log)`) | P2 | 2h |

---

### 3.9 🟡 Frontend — Promise.all sin Validación

**Problema:** 10+ instancias de `Promise.all` sin verificar respuestas.

**Evidencia:**
```typescript
// hooks/useFilterOptions.ts
const [usersRes, queuesRes, whatsappsRes] = await Promise.all([...])
// Nunca verifica si alguno falló
```

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 3.9.1 | Reemplazar `Promise.all` con `Promise.allSettled` en llamadas no críticas | P1 | 3h |
| 3.9.2 | Agregar validación de respuestas después de cada `Promise.all` | P1 | 2h |
| 3.9.3 | Implementar componente `ErrorBoundary` global para catches no controlados | P2 | 2h |

---

## FASE 4 — Integraciones y Evolución (Semana 9-12)

> **Objetivo:** Activar integraciones dormidas, expandir capacidades, futuro.
> **Impacto esperado:** Readiness Score 8.5 → 9.0+

---

### 4.1 🔵 WhatsApp Cloud API — Activación

**Estado actual:** 90% construido, 0% productivo. Archivos listos:
- `services/WhatsAppCloudAPI/CloudAPIService.ts` (12KB)
- `services/WhatsAppAdapter/HybridWhatsAppService.ts` (15KB)
- `services/WhatsAppAdapter/DualAdapter.ts` (15KB)
- `services/WhatsAppAdapter/IntelligentLoadBalancer.ts` (15KB)

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.1.1 | Obtener y configurar credenciales de Meta Business (Phone Number ID, Access Token, Business Account ID) | P1 | 2h |
| 4.1.2 | Configurar webhook de Meta Business Platform para recibir mensajes entrantes | P1 | 3h |
| 4.1.3 | Testear envío de mensajes vía Cloud API en sandbox | P1 | 2h |
| 4.1.4 | Habilitar `WHATSAPP_CLOUD_API_ENABLED=true` con modo `baileys_first` (Baileys principal + Cloud API fallback) | P1 | 1h |
| 4.1.5 | Monitorear coexistencia durante 2 semanas antes de cambiar a `auto` | P2 | Continuo |
| 4.1.6 | Documentar plan de migración gradual de números de Baileys a Cloud API | P2 | 4h |

---

### 4.2 🔵 Audit Service — Productivización

**Estado actual:** Microservicio construido con OpenAI pero sin integración activa con el sistema principal.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.2.1 | Conectar Audit Service a PostgreSQL para persistir resultados de auditorías | P1 | 4h |
| 4.2.2 | Integrar con Bull Queue para procesar auditorías en background | P1 | 3h |
| 4.2.3 | Agregar webhook/evento Socket.IO cuando una auditoría finaliza | P2 | 2h |
| 4.2.4 | Crear vista en frontend para ver resultados de auditorías | P2 | 6h |
| 4.2.5 | Implementar programación automática de auditorías semanales | P2 | 2h |

---

### 4.3 🔵 Meta Marketing API — Completar

**Estado actual:** Token presente, SDK parcialmente integrado, dashboard no implementado.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.3.1 | Implementar refresh automático de Long-Lived Token de Facebook (expira en 60 días) | P1 | 3h |
| 4.3.2 | Completar dashboard de insights de campañas en frontend (CampaignsInsights.tsx) | P2 | 8h |
| 4.3.3 | Conectar Facebook Conversion API con sistema de atribución existente | P2 | 6h |
| 4.3.4 | Implementar sincronización bidireccional de audiencias (Custom Audiences) | P3 | 8h |

---

### 4.4 🔵 Email Marketing — Maduración

**Estado actual:** Páginas creadas, SMTP configurado, pero funcionalidad básica.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.4.1 | Implementar editor de templates visual (drag & drop) | P2 | 16h |
| 4.4.2 | Agregar tracking de opens y clicks con pixel tracking | P2 | 6h |
| 4.4.3 | Implementar bounce handling y gestión de reputación | P2 | 4h |
| 4.4.4 | Agregar segmentación avanzada para campañas email | P3 | 8h |
| 4.4.5 | Evaluar migración a servicio transaccional (SendGrid, Mailgun) para deliverability | P3 | Evaluación |

---

### 4.5 🔵 WebChat — Mejoras

**Estado actual:** Widget funcional básico.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.5.1 | Agregar personalización visual del widget (colores, posición, avatar) | P2 | 4h |
| 4.5.2 | Implementar pre-chat form (nombre, email antes de chatear) | P2 | 3h |
| 4.5.3 | Agregar soporte para file uploads en WebChat | P2 | 4h |
| 4.5.4 | Implementar chatbot de bienvenida automático | P3 | 6h |

---

### 4.6 🔵 Integraciones Externas — Expansión

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.6.1 | Completar integración con Zapier (webhook bidireccional) | P2 | 8h |
| 4.6.2 | Implementar API REST pública documentada con Swagger/OpenAPI | P1 | 8h |
| 4.6.3 | Agregar integración con Google Calendar para sistema de citas | P2 | 6h |
| 4.6.4 | Implementar SSO (Single Sign-On) con OAuth2/SAML | P3 | 12h |

---

### 4.7 🔵 IA — Evolución

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.7.1 | Implementar RAG (Retrieval Augmented Generation) con ChromaDB para base de conocimiento del chatbot | P2 | 12h |
| 4.7.2 | Agregar análisis de sentimiento automático en mensajes entrantes | P2 | 6h |
| 4.7.3 | Implementar auto-clasificación de tickets por IA | P2 | 8h |
| 4.7.4 | Crear respuestas sugeridas por IA para agentes | P2 | 6h |
| 4.7.5 | Implementar resumen automático de conversaciones al cerrar ticket | P3 | 4h |

---

### 4.8 🔵 Testing — Implementar Suite

**Estado actual:** Directorio `tests/` existe pero con mínimo contenido.

**Acciones:**

| # | Acción | Prioridad | Esfuerzo |
|---|--------|-----------|----------|
| 4.8.1 | Configurar Jest para backend con coverage mínimo 60% | P1 | 4h |
| 4.8.2 | Escribir tests unitarios para servicios críticos (Auth, Ticket, Contact, Campaign) | P1 | 16h |
| 4.8.3 | Configurar Playwright para E2E tests del frontend | P2 | 4h |
| 4.8.4 | Escribir E2E tests para flujos críticos (login, crear ticket, enviar mensaje) | P2 | 8h |
| 4.8.5 | Integrar tests en CI/CD pipeline (GitHub Actions) | P2 | 3h |
| 4.8.6 | Configurar load testing con Artillery para endpoints críticos | P3 | 4h |

---

## 5. Matriz de Riesgo Completa

### 🔴 CRÍTICOS — Hacer YA (Semana 1-2)

| ID | Problema | Archivo | Esfuerzo |
|----|----------|---------|----------|
| C01 | Secretos en .env expuestos | `.env` | 8h |
| C02 | Tokens logueados en producción | `middleware/tokenAuth.ts` | 30min |
| C03 | Rate limiting deshabilitado | `.env` | 15min |
| C04 | Headers seguridad NGINX | `nginx/conf.d/default.conf` | 2h |
| C05 | Pool BD 500 vs max 100 | `.env` + `config/database.ts` | 30min |
| C06 | Tokens en localStorage (XSS) | `services/authService.ts` | 7h |
| C07 | Backup sin validación | `scripts/backup.sh` | 4h |
| C08 | Docker imágenes `:latest` | `docker-compose.production.yml` | 1h |
| C09 | DB_SSL=false en producción | `.env` | 2h |
| C10 | dangerouslySetInnerHTML sin sanitizar | `EmailMarketingPlantillas.tsx` | 1h |
| C11 | HTTP sin redirect a HTTPS | `nginx/conf.d/default.conf` | 30min |
| C12 | Prometheus targets incorrectos | `monitoring/prometheus.yml` | 30min |

**Total Fase 1: ~27 horas**

### 🟠 ALTOS — Semana 3-5

| ID | Problema | Esfuerzo |
|----|----------|----------|
| A01 | N+1 queries + findAll sin limit | 16h |
| A02 | Error handling deficiente (controllers + async map) | 11h |
| A03 | Frontend sin lazy loading | 7h |
| A04 | Componentes sin memoización | 11h |
| A05 | Dependencias duplicadas (MUI v4+v7, sonner) | 10h |
| A06 | Memory leaks en wbot.ts | 10h |
| A07 | Redis bug incr() + config | 4h |
| A08 | 1,672 console.log en producción | 7h |

**Total Fase 2: ~76 horas**

### 🟡 MEDIOS — Semana 6-8

| ID | Problema | Esfuerzo |
|----|----------|----------|
| M01 | TypeScript any/as any | 25h |
| M02 | Typos en naming | 3h |
| M03 | Accesibilidad (a11y) | 17h |
| M04 | i18n incompleto | 25h |
| M05 | State management (prop drilling) | 9h |
| M06 | Validación formularios | 10h |
| M07 | Archivos muertos | 2h |
| M08 | Índices BD faltantes | 7h |
| M09 | Promise.all sin validación | 7h |

**Total Fase 3: ~105 horas**

### 🔵 INTEGRACIONES — Semana 9-12

| ID | Integración | Esfuerzo |
|----|-------------|----------|
| I01 | WhatsApp Cloud API activación | 12h |
| I02 | Audit Service productivización | 17h |
| I03 | Meta Marketing completar | 25h |
| I04 | Email Marketing maduración | 38h |
| I05 | WebChat mejoras | 17h |
| I06 | Integraciones externas (Zapier, API pública, Google Cal) | 34h |
| I07 | IA evolución (RAG, sentimiento, auto-clasificación) | 36h |
| I08 | Testing suite | 39h |

**Total Fase 4: ~218 horas**

---

## 6. Métricas de Éxito

### Por Fase

| Fase | Métrica | Antes | Objetivo |
|------|---------|-------|----------|
| **F1** | Vulnerabilidades críticas | 12 | 0 |
| **F1** | Security headers score (securityheaders.com) | F | A+ |
| **F2** | Tiempo de respuesta P95 | >3s | <500ms |
| **F2** | Bundle size frontend | ~400KB | <200KB |
| **F2** | Console.log en producción | 1,672 | 0 |
| **F3** | Lighthouse Accessibility | ~40 | >85 |
| **F3** | TypeScript strict errors | N/A | 0 |
| **F3** | Cobertura i18n | ~10% | >80% |
| **F4** | Test coverage | ~0% | >60% |
| **F4** | WhatsApp Cloud API | Deshabilitado | Activo (dual) |
| **F4** | Canales de comunicación activos | 3 | 6+ |

### Readiness Score Proyectado

```
Actual:     ████░░░░░░  4.2/10
Fase 1:     ██████░░░░  6.5/10  (+2.3)
Fase 2:     ████████░░  7.8/10  (+1.3)
Fase 3:     █████████░  8.5/10  (+0.7)
Fase 4:     █████████▓  9.0/10  (+0.5)
```

### Dashboard de Progreso

```
┌──────────────────────────────────────────────────────────┐
│                   PROGRESO POR FASE                       │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  FASE 1 (Seguridad)    [ ] ░░░░░░░░░░░░░░░░░░░░  0%    │
│  FASE 2 (Rendimiento)  [ ] ░░░░░░░░░░░░░░░░░░░░  0%    │
│  FASE 3 (Optimización) [ ] ░░░░░░░░░░░░░░░░░░░░  0%    │
│  FASE 4 (Integraciones)[ ] ░░░░░░░░░░░░░░░░░░░░  0%    │
│                                                          │
│  TOTAL                  [ ] ░░░░░░░░░░░░░░░░░░░░  0%    │
│                                                          │
│  Horas estimadas: 426h                                   │
│  Horas invertidas: 0h                                    │
│  Items completados: 0/67                                 │
│                                                          │
└──────────────────────────────────────────────────────────┘
```

---

## Anexo A — Comandos de Auditoría Rápida

```bash
# Verificar console.log en backend
grep -rn "console.log" --include="*.ts" services/ controllers/ middleware/ | wc -l

# Verificar console.log en frontend
grep -rn "console.log" --include="*.tsx" --include="*.ts" frontend/src/ | wc -l

# Buscar 'any' en TypeScript
grep -rn ": any" --include="*.ts" --include="*.tsx" | wc -l

# Buscar findAll sin limit
grep -rn "findAll(" --include="*.ts" services/ | grep -v "limit"

# Verificar dependencias no usadas (frontend)
cd frontend && npx depcheck

# Lighthouse audit
npx lighthouse https://chat.chateam.ws --output=json

# Security headers check
curl -I https://appro.chateam.ws | grep -i "strict\|x-frame\|x-content\|csp"

# Redis keys sin TTL
redis-cli -p 5000 --no-auth-warning -a $REDIS_PASSWORD DBSIZE
```

---

## Anexo B — Priorización Visual

```
                    URGENCIA
           Alta ◄──────────────► Baja
     ┌─────────────────┬──────────────────┐
Alta │  C01-C12         │  I01-I02         │
     │  HACER YA        │  PLANIFICAR      │
     │  Secretos, NGINX │  Cloud API,      │
I    │  Rate Limit, SSL │  Audit Service   │
M    │                  │                  │
P    ├─────────────────┼──────────────────┤
A    │  A01-A08         │  M01-M09         │
C    │  PRIORIZAR       │  MEJORA          │
T    │  N+1, Lazy Load  │  TypeScript,     │
O    │  Memoización,    │  a11y, i18n,     │
     │  Memory Leaks    │  State Mgmt      │
Baja │                  │                  │
     └─────────────────┴──────────────────┘
```

---

> **Nota:** Este plan debe revisarse semanalmente. Marcar items completados y ajustar prioridades según descubrimientos durante la implementación.
>
> Documento generado por auditoría exhaustiva del código fuente.
> Última actualización: 27 de Febrero de 2026
