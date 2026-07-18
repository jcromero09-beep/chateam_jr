# SPEC — Cableado del sistema de almacenamiento de media (4 cables + dedup + cuota)

> ## ✅ DECISIONES DE JC (2026-07-17)
> - **B3 dedup: HECHO** — public/ 17G→4.7G (12.21 GiB), + cron nocturno 04:30 (`/etc/cron.d/chateam-dedup-media`).
> - **Módulo Integraciones: ARCHIVADO** (spec aparte).
> - **Object storage = MODELO HÍBRIDO:**
>   1. **Backend caliente = S3-compatible** (R2 o B2 — *falta elegir cuál*), que **reusa el `S3Service` ya construido** y saca los 4.7G del NAS con durabilidad offsite. Sirve la media caliente a la UI (los agentes abren adjuntos constantemente).
>   2. **Google Drive por empresa = feature OPCIONAL** encima, para backup/export/archivo en frío (ownership de datos). **NO** como backend primario: Drive no es S3-compatible (tira el código construido), tiene rate limits por-usuario, 15G gratis compartidos con Gmail, y latencia mala para servir media caliente.
> - **Gated (falta JC):** (a) elegir R2 vs B2; (b) crear bucket; (c) poner env `S3_ENDPOINT/S3_ACCESS_KEY/S3_SECRET_KEY/S3_REGION/S3_BUCKET` (.env es read-only para el agente). Hasta eso, cablear la ruta de media da endpoints que fallan al subir.
> - **⚠️ Al activar:** el runner de migraciones está DESINCRONIZADO (32/384) → NO usar `db:migrate`; aplicar solo el `up` de `20260717000001-recreate-media-table-aligned.ts` quirúrgicamente.

**Estado:** propuesta para desarrollo · **Fecha:** 2026-07-17 · **Autor:** auditoría chateam
**Regla:** todo lo que sigue está **verificado contra código, BD, docker y disco**. Cada afirmación lleva evidencia. Origen: [[reference_chateam_storage_media]].

---

## 1. Resumen ejecutivo

`public/` = **17 GB de los 19 GB del repo (89%)**: adjuntos reales de WhatsApp de clientes. El problema **no es diseñar un sistema de gestión** — ya existe entero (`FileLifecycleService`, `S3Service`, `MediaController`, `mediaRoutes`, `FileExpirationJob`, `models/Media.ts`, deps `aws-sdk`/`sharp` pagadas). **Está construido y muerto**, exactamente el patrón de [[reference_chateam_maquetas_integraciones]] y [[reference_chateam_orphan_wiring]].

Este spec conecta lo que existe y añade lo que falta, en 4 tramos:

| Tramo | Qué | Riesgo | ROI |
|---|---|---|---|
| **A — Cablear (4+1 cables)** | Reconciliar tabla `media` + `addModels` + montar ruta + registrar job | 🟠 medio | Habilita todo lo demás |
| **B — Dedup por content-hash** | Atacar el **73% de duplicados** | 🔴 alto (11 writers, no romper 14164 mediaUrl) | **El mayor ahorro inmediato** |
| **C — Cuota por empresa** | `storageQuota`/`storageUsed` (company48 = 52%) | 🟠 medio | Frena el crecimiento (~3 GB/mes) |
| **D — Object storage** | Sacar 17 GB del NAS vía S3 ya escrito | 🟠 medio | Libera el disco que limita los builds |

**Dos correcciones a lo que reporté antes** (verificadas ahora):
1. ⚠️ **`Plan.aiTokenQuota` NO existe.** Me equivoqué. El sistema real de cuota es `Company.aiTokenBalance` (saldo) + `CompanyTokenUsage` (acumulador) + `AiTokenTransaction` (ledger). Y **hay dos arquitecturas de cuota conviviendo** — hay que decidir cuál copiar (§Fase C).
2. ⚠️ **La tabla `media` ya existe pero DESALINEADA del modelo** (mismo bug que integraciones: modelo≠tabla → 500). No basta con "montar la ruta".

---

## 2. Evidencia del estado actual

### 2.1 El sistema existe (construido, sustancial)
- `services/FileLifecycleService.ts` — `generateUploadUrl`, `confirmUpload`, `uploadBuffer`, `getDownloadUrl`, `deleteFile`, `cleanupExpiredFiles`; thumbnails con `sharp` (300×300); retención vía `expires_at`; S3 con `aws-sdk` v2.
- `services/S3Service.ts` — cliente `@aws-sdk/client-s3` **v3** (distinto SDK); presigned URLs; **`calculateChecksum(buffer)` → sha256 ya escrito** (`S3Service.ts:102`) pero **sin ningún caller** (código muerto).
- `controllers/MediaController.ts` — 9 endpoints (`POST /api/media/upload-url`, `/upload`, `GET /api/media`, `/stats`, `DELETE /api/media/:id`…).
- `models/Media.ts` — tabla `'media'`, UUID PK, `company_id`, `size_bytes`, `storage_provider` (`local|s3|minio`), `storage_key`, `expires_at`, `references_count`, `is_legal_hold`, `status`. Métodos `incrementReferences`/`decrementReferences`, `getExpiredFiles`, `getCompanyStats`.
- Deps instaladas: `aws-sdk ^2.1693`, `@aws-sdk/client-s3 ^3.1007`, `sharp ^0.34.4`.

### 2.2 …y está muerto (5 cables sueltos, verificado en runtime)
1. **Ruta no montada:** `routes/mediaRoutes.ts` **no se importa** en `routes/index.ts` (solo está `mediaBackupRoutes`, que es otra cosa) → `GET /media` y `/api/media` dan **404** (probado con qa-agent).
2. **Modelo no registrado:** `Media` **no está en `addModels`** de `database/index.ts`.
3. **Job no registrado:** `FileExpirationJob` está escrito para Bull pero **no hay `new Bull("FileExpiration…")`** en `queues.ts`/`backendQueues.ts` ni cron → nunca corre.
4. **⚠️ Tabla DESALINEADA (el cable oculto):** la migración `20250101000001-create-media-table.ts` crea tabla **`'Media'` (mayúscula) con columnas camelCase** (`companyId`, `storageProvider`, `contentType`, `sizeBytes`, `expiresAt`…). El modelo espera **`'media'` (minúscula) snake_case** (`underscored:true`) y columnas que la migración **no crea** (`original_name`, `filename`, `storage_bucket`, `url`, `thumbnail_url`, `notified_at`, `metadata`, `tags`, `uploaded_by`, `mime_type`≠`contentType`). **Aunque se montara la ruta, el modelo daría 500 contra la BD real** — idéntico a `integration_providers`.
5. **Auth ausente:** `mediaRoutes.ts:14` tiene el `authMiddleware` **comentado** con "// implementar según tu sistema" y fallback `req.user?.id || 1` en el controller → sin isAuth real.

### 2.3 Además: `FileService.ts` es un TERCER sistema huérfano
`services/FileService.ts` usa `TenantManager` (schema-per-tenant, `tenants/{companyId}/media/…`) e inyecta `S3Service`. **Nadie lo instancia** (`new FileService(` sin resultados). Su `scheduleExpirationJobs` **solo hace `console.log`** ("Aquí se programaría el job con Bull"). Es una segunda implementación de lo mismo que `FileLifecycleService`, incompatible (schema-per-tenant vs `company_id` columna). **Decisión: elegir UNA, borrar la otra.** Recomendado `FileLifecycleService` (es la que usa `MediaController`).

### 2.4 Los números (los que mandan)
- **Duplicación: 161 de 220 archivos >5 MB son duplicados EXACTOS por hash (73%)** — el mismo driver de impresora reenviado N veces.
- **Concentración: 3 empresas = 91%** (company48 **8.8 GB = 52%**, company8 4.3 GB, company6 2.4 GB).
- **Antigüedad: 0 archivos >180 días; solo 1.3 GB >90 días; 5619 en los últimos 30 días** → crece ~3 GB/mes. La retención hoy libera poco; el dedup libera mucho.
- **14164 `Messages` con `mediaUrl`** → los archivos están referenciados; no se puede borrar a lo bruto.
- `public/` **ya en `.gitignore`** (0 trackeados, `.git` = 37 MB). Sin problema de git.

---

## 3. Fases

### FASE A — Cablear los 4+1 cables *(habilita todo lo demás)*

> Sin esto, `/api/media` da 404 y el modelo daría 500. Es el pre-requisito de B, C y D.

**A.1 — Reconciliar el esquema (el cable oculto, hacer PRIMERO).**
Igual que en integraciones: la tabla existe pero no coincide con el modelo. Como `public/` no está aún en la tabla (0 filas de media reales), es el momento barato.
- Escribir migración `.ts` (primer nivel de `database/migrations/`) que **elimine la tabla `Media` camelCase y cree `media` snake_case** con TODAS las columnas del modelo (`models/Media.ts:262-367`), o `ALTER` para reconciliar. Verificar con `information_schema.columns` que columna↔modelo cuadran (el diff exacto ya está mapeado).
- **Añadir la columna que falta para dedup:** `content_hash CHAR(64)` (sha256) + índice `(company_id, content_hash)`. El modelo no la tiene hoy.

**A.2 — Registrar el modelo:** `Media` en `addModels` de `database/index.ts`.

**A.3 — Montar la ruta CON auth real:** importar `mediaRoutes` en `routes/index.ts` y aplicar `isAuth` (hoy comentado). Quitar el fallback `|| 1` del controller (usa `req.user.companyId` real, multi-tenant como el resto del repo).

**A.4 — Registrar el job:** `new Bull("FileExpirationQueue", …)` en `queues.ts` + procesador en `backendQueues.ts` + un cron en `backendCronJobs.ts` que encole `{type:'cleanup'}` y `{type:'notification'}` diariamente. Hoy `FileExpirationJob` y `sendExpirationNotification` son **stubs** (solo `logInfo`) — implementar el envío real o dejar el job desactivado hasta que se necesite.

**A.5 — Unificar SDK y borrar el huérfano:** elegir `FileLifecycleService` (aws-sdk v2) **o** migrar a `@aws-sdk/client-s3` v3 (S3Service) — **no mantener los dos SDKs**. Borrar `FileService.ts` (tercer sistema huérfano) tras decidir.

**Aceptación A:** `GET /api/media` → 200 con `isAuth`; cross-tenant (cuenta no-super) → 404/403; `db:migrate` desde cero reproduce `media` alineada; `information_schema` = modelo.

---

### FASE B — Dedup por content-hash *(el mayor ahorro; el más delicado)*

**Objetivo:** un archivo físico por contenido único; N mensajes lo referencian. Ataca el 73%.

**⚠️ La trampa que NO se puede romper — `mediaUrl` (14164 mensajes):**
`Messages.mediaUrl` guarda **solo el filename** (`wbotMessageListener.ts:1856`), y el getter `Message.mediaUrlWithBaseUrl` (`models/Message.ts:59`) lo reconstruye como `…/public/company{companyId}/{mediaUrl}`. Es decir: **la URL asume que el archivo vive en `public/company{id}/{filename}`**. Cualquier dedup que MUEVA el archivo a un almacén de contenido (CAS `by-hash/ab/cd/…`) **rompe esos 14164 getters**. Tres caminos:

- **(B1) CAS + hardlink** *(recomendado como primer paso, menor riesgo):* el archivo canónico vive una vez en `by-hash/…`, y cada `public/company{id}/{filename}` es un **hardlink** al mismo inodo. El getter sigue funcionando sin tocar la BD, y el disco solo cuenta el contenido una vez (mismo filesystem, verificado: `/home` es un solo volumen). Un `find -samefile`/dedup por inodos da el ahorro sin cambiar el esquema de URLs.
- **(B2) CAS + tabla de referencias + reescritura de URLs:** el patrón "correcto" a largo plazo (usa `Media.references_count` que ya existe), pero requiere migrar los 14164 `mediaUrl` a apuntar a `media.id` y cambiar el getter → alto riesgo, hacer solo después de B1.
- **(B3) dedup offline (script):** barrer `public/` por sha256 y sustituir duplicados por hardlinks, sin tocar el flujo de escritura. **Es el arranque más seguro y libera el 73% ya** — luego B1 lo mantiene para archivos nuevos.

**Puntos de inserción para hash-on-write (11 writers, todos con el buffer en memoria salvo multer):**
- Baileys: `wbotMessageListener.ts` entre `:1520` (download→buffer) y `:1781` (writeFile).
- Meta Cloud: `metaMessageListener.ts` entre `:172` y `:184`.
- Facebook/IG: `facebookMessageListener.ts:175`, `facebookMessagePersistence.ts:76`.
- Telegram: `TelegramMessageListener.ts:361`.
- Multer manual: `config/upload.ts`, `config/uploadExt.ts`, `config/chatUpload.ts` — **diskStorage escribe por streaming**, el hash se calcula post-escritura (leyendo el archivo) o cambiando a hash-on-the-fly.
- Reusar `S3Service.calculateChecksum` (ya escrito, hoy muerto) como helper único.

**Orden recomendado de B:** B3 (script offline, gana el 73% ya) → B1 (hardlink-on-write para nuevos) → B2 solo si se quiere el CAS+refs formal.

**Aceptación B:** el script reporta cuánto libera antes de tocar nada (dry-run); tras dedup, abrir un mensaje viejo con adjunto duplicado sigue mostrando el archivo (getter intacto); `du -sh public/` baja sin que ningún `mediaUrl` dé 404.

---

### FASE C — Cuota de almacenamiento por empresa *(frena el crecimiento)*

**⚠️ Corrección: NO existe `Plan.aiTokenQuota`.** El patrón real a replicar (verificado) es:
- **Saldo/tope mutable en `Company`** (no en `Plan`): `Company.aiTokenBalance` (BIGINT). Migración modelo: `20260121000001-add-ai-token-balance-to-company.ts` (`describeTable` + `addColumn` idempotente).
- **Acumulador de uso agregado:** `CompanyTokenUsage` (por company+mes).
- **Enforcement transaccional con lock:** `TokenTrackingService.trackTokenUsage` abre `sequelize.transaction()`, bloquea la fila de Company con `LOCK.UPDATE`, valida `balance < requerido → throw`, decrementa, upsert del acumulador con `Sequelize.literal("col + n")` (evita carrera), inserta en ledger `AiTokenTransaction`. Guard previo booleano: `AIExecutionGuardService` (`balance <= 0 → block`).
- **Endpoint de consulta:** `GET /ai/subplan-purchase/token-info`.

**Réplica para storage (recomendado):**
- `Company.storageQuotaBytes` (BIGINT, límite) + `Company.storageUsedBytes` (BIGINT, acumulador) — migración idempotente igual a la de `aiTokenBalance`.
- **Incrementar `storageUsedBytes` transaccionalmente** en cada `writeFile` de los 11 writers (con `LOCK.UPDATE` como TokenTracking) y **decrementar** al borrar/expirar. **Con dedup (Fase B), solo cuenta contenido único** — si el hash ya existe para esa company, no suma.
- **Enforcement:** guard antes de escribir (`storageUsed + size > storageQuota → rechazar` con mensaje claro). El `companyId` ya está resuelto antes de cada writer (verificado).
- Endpoint `GET /media/quota` (o extender `token-info`) para que el front pinte el uso. company48 al 52% es tanto conversación de negocio como límite técnico.

**⚠️ Decisión de arquitectura pendiente:** hay **dos sistemas de cuota conviviendo** — el legacy (`Company.aiTokenBalance`+subplan, que es el que realmente enforcea) y el nuevo granular (`PlanCreditAllocation`/`AICreditBalance` por tipo de crédito, que `SyncLegacyCreditsService` describe como la dirección nueva). **Antes de elegir el patrón de storage, confirmar con el equipo cuál es el oficial.** Recomendado copiar el legacy (más simple, probado) salvo que el granular sea mandato.

**Aceptación C:** subir un archivo que exceda la cuota → rechazo con mensaje; `storageUsedBytes` de una company = suma real de sus archivos únicos; borrar un archivo lo decrementa.

---

### FASE D — Object storage (sacar 17 GB del NAS)

Con A hecho, `FileLifecycleService`/`S3Service` ya suben a S3. Falta el **backend real**:
- **Decidir destino:** MinIO propio (el `rp_minio` que corre es de **ReconcilAPlus**, no reusar), S3/R2/B2 gestionado. Env vars que el código ya espera: `S3_ENDPOINT`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_REGION`, `S3_BUCKET` (el agente **no** toca `.env`; los pone JC).
- **Migración de los 17 GB existentes:** script que suba `public/` a S3, cree las filas `media` (con hash de Fase B) y **reescriba `mediaUrl`** o ponga un proxy `/public/*` que redirija a S3. Es la parte más delicada por los 14164 getters — coordinar con B2.
- **Servir:** presigned URLs (ya implementado en ambos services) o CDN.

**Beneficio directo a nuestro problema actual:** sacar 17 GB del NAS libera el disco que hoy estrangula los builds del frontend (el motivo por el que esperábamos ventana de memoria).

---

## 4. Orden recomendado y decisiones

```
FASE A (cablear)         ── pre-requisito de todo; empezar por A.1 (reconciliar tabla)
FASE B3 (dedup offline)  ── gana el 73% YA, sin tocar el flujo de escritura  ★ mayor ROI
FASE B1 (hardlink-write) ── mantiene el dedup para archivos nuevos
FASE C (cuota)           ── frena el ~3 GB/mes; requiere decidir qué sistema copiar
FASE D (object storage)  ── saca 17 GB del NAS; la más grande, al final
```

**Decisiones que necesito de JC antes de desarrollar:**
1. **Fase A.5:** ¿unificar en `FileLifecycleService` (aws-sdk v2) o migrar a S3Service (v3)? ¿borro `FileService.ts` huérfano?
2. **Fase B:** ¿arrancamos por el script offline B3 (seguro, gana el 73% ya) o vamos directo al CAS+refs formal B2?
3. **Fase C:** ¿copiamos el patrón de cuota **legacy** (`Company.balance`, probado) o el **granular** (`PlanCreditAllocation`, dirección nueva)? — necesito saber cuál es el oficial.
4. **Fase D:** ¿destino del object storage? (MinIO propio nuevo / S3 / Cloudflare R2 / Backblaze B2). Y si se hace, tú pones las env vars.
5. ¿Empezamos solo por **A + B3** (bajo riesgo, el 73% de ahorro) y evaluamos el resto después?
