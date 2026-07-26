# Auditoría de Seguridad de Datos y Privacidad — chateam_jr

> Fecha: 2026-07-23 · Rol: Privacy Engineer + Data-Protection Auditor · Modo: **SOLO LECTURA / NO DESTRUCTIVO**
> (sin edits de código, sin builds/tests, sin `npm audit`, sin lecturas de `.env`, sin backups/restauraciones ejecutados).
> Confronta: `docs/_consolidado/product/BUSINESS-REQUIREMENTS.md` (**NFR-012** retención/particionado, **NFR-014**
> compliance PII LOPDP/RGPD) y `docs/_consolidado/spec/SPEC.md §6` (RNF).
>
> **No repite** (los referencia como contexto): RBAC/tenancy/firmas-webhook/secretos-en-reposo cubiertos en
> `audit/parts/{seguridad.md, api-inventario.md, backend-canales.md, db-esquema.md, devops.md}`. En particular:
> `seguridad.md` S-2 (secret keys Stripe/PayPal + API keys IA en claro), S-8 (`REDIS_SECRET_KEY="MULTI100"`),
> S-3 (IDOR créditos IA); `devops.md` #17 (backup.sh obsoleto), #10-13 (observabilidad rota).

## Método
Lectura directa de `config/{redis,redisCluster,database,privateFiles,upload,logger}.ts`, `libs/cache.ts`,
`helpers/useMultiFileAuthState.ts`, `app.ts` (static/CORS/helmet), `queues.ts` (payloads/retención Bull),
`meta-marketing/src/client.ts` (dump HTTP), `services/FacebookConversionService/LopdpService.ts` + `routes/lopdpRoutes.ts`,
`nginx/…padeldev.codigo.plus.conf` (leído directo de `/etc/nginx/server.d/`). Grep dirigido de logging sensible,
consentimiento, retención y CVEs. `package.json`+`package-lock.json` cruzados con los CVE citados por la SPEC
(sin ejecutar `npm audit`). Confianza declarada por hallazgo.

---

## Hallazgos por dimensión

### 1. Cifrado en tránsito (TLS)

**PR-1 · TLS en el borde (nginx) · EXISTE · confianza ALTA**
`/etc/nginx/server.d/padeldev.codigo.plus.conf`: redirect 80→443, `ssl_protocols TLSv1.2 TLSv1.3`, cert Let's Encrypt,
snippet `security-headers.conf` incluido en cada `location`. El tráfico cliente↔plataforma va cifrado.
- *Hallazgo técnico menor (BAJA):* `ssl_ciphers HIGH:!aNULL:!MD5` es una cadena amplia/heredada que aún admite suites
  CBC antiguas. El contenido real de `security-headers.conf` (¿HSTS? ¿CSP?) **no fue leído** (fuera de ruta del repo) → NO VERIFICABLE.
- *Recomendación:* fijar cipher suite Mozilla "intermediate" y confirmar `Strict-Transport-Security` en el snippet.

**PR-1b · Saltos internos node→pg / node→redis · EXISTE (aceptable) · confianza ALTA**
Postgres (`127.0.0.1:5434`) y Redis (`127.0.0.1:6390`) están **bind a loopback** (confirmado `devops.md §3.2`), no
expuestos a red. Sin TLS en esos saltos, pero al ser loopback el riesgo de intercepción es bajo. `config/database.ts:10`
declara `options.encrypt: true`, pero esa opción es de `tedious`/MSSQL y el driver `postgres` la ignora (cosmética, no
habilita TLS a PG).

**PR-1c · Llamada saliente en claro a Listmonk (LAN) · PARCIAL · confianza MEDIA**
`services/EmailMarketing/providers/ListmonkProvider.ts:47` documenta `listmonkUrl` de ejemplo `http://192.168.100.21:9000`
(HTTP sin TLS, IP privada). Si un tenant configura el hub de email por HTTP, viajan en claro por la LAN el API key de
Listmonk y PII de destinatarios. Externos de pago (Meta/Stripe/PayPal) sí son HTTPS. *Recomendación:* forzar `https://`
o validar esquema en la config de Listmonk.

### 2. Redis (auth, sesiones Baileys, datos sensibles)

**PR-2 · Credenciales de sesión Baileys en Redis EN CLARO, sin TTL y evictables · EXISTE (riesgo) · severidad ALTA · P1 · confianza ALTA**
`helpers/useMultiFileAuthState.ts:15-25,81-83` persiste el estado de autenticación de WhatsApp (creds + signal keys) con
`cacheLayer.set(\`sessions:${whatsapp.id}:${file}\`, JSON.stringify(data, BufferJSON.replacer))` — **sin cifrado** y
**sin TTL** (la firma `libs/cache.ts:28-40` acepta TTL opcional, pero aquí se llama sin él).
- Estas creds son material de **apropiación de cuenta**: quien las lea puede impersonar la conexión WhatsApp del tenant.
- Redis persiste a disco (`docker-compose.yml:93-98`: `--appendonly yes --appendfsync everysec` + `--save`) → las creds
  quedan en el volumen `redis_data` en claro.
- `docker-compose.yml:99-100`: `--maxmemory 256mb --maxmemory-policy allkeys-lru` ⇒ bajo presión de memoria Redis puede
  **evictar cualquier clave**, incluidas las creds sin TTL y los jobs Bull → doble impacto: riesgo de privacidad (dump) y
  de fiabilidad (pérdida de sesión). *Probabilidad:* MEDIA (Redis es loopback+requirepass; requiere acceso al host o al dump).
  *Impacto:* ALTO. *Recomendación:* cifrar el blob de creds en reposo (reutilizar `helpers/secretCrypto.ts`), mover a store
  dedicado con persistencia controlada y excluir de la política LRU (prefijo o instancia separada).

**PR-3 · Auth de Redis · EXISTE (fail-closed en compose) · confianza ALTA**
`docker-compose.yml:84-95`: `--requirepass ${REDIS_PASSWORD:?…}` (arranque falla sin password) + bind loopback. Bien.
- *Deuda ya reportada (no se repite, se referencia):* `config/redis.ts:22` fallback `REDIS_SECRET_KEY || "MULTI100"`
  = `seguridad.md` S-8. Además `config/redis.ts:13` y `config/redisCluster.ts:23` **default port 5000** (no el 6390 vivo):
  si `REDIS_URL/URI` no está seteado se conectaría al puerto equivocado (fail-safe: la URL explícita del `.env` manda).

### 3. Colas/jobs (Bull sobre Redis)

**PR-4 · Payloads de colas con datos personales; retención de fallidos 7 días · EXISTE · severidad MEDIA · confianza ALTA**
Las colas de envío (`queues.ts:710` `sendMessageQueue.add("SendMessage", data …)`, `:721` programados, `:744` recordatorios
de cita, campañas) transportan **número de teléfono + cuerpo del mensaje** (contenido de conversación = PII) y se
almacenan en Redis (persistido a disco, ver PR-2). Retención (`queues.ts:139-146` `CLEANUP_CONFIG`): completados
`age:1h`, **fallidos `age:7 días`** → jobs fallidos con PII permanecen 7 días. No se observaron secretos de terceros en
los payloads (los tokens se resuelven en tiempo de ejecución). *Recomendación:* minimizar retención de fallidos y no
persistir cuerpos de mensaje más allá de lo operativo.

### 4. Logs con datos sensibles

**PR-14 · Dump HTTP completo de Meta Marketing · PARCIAL (latente, apagado por defecto) · severidad MEDIA · confianza ALTA**
`meta-marketing/src/client.ts:11` `const DEBUG_HTTP = process.env.META_DEBUG_HTTP === 'true'` → **desactivado por
defecto** (fail-safe correcto). Cuando se activa (`:121-176`), los interceptores vuelcan a stdout request+response
COMPLETAS: query params (incl. `appsecret_proof`), body, y preview de 1000 chars de la respuesta — el propio comentario
reporta "~48 MB de log en 9 días". *Estado hoy:* apagado (no verificable el `.env` de prod, pero el default es OFF).
*Recomendación:* mantener OFF en prod y, si se usa, redacción de tokens antes de imprimir.

**PR-15 · Fragmentos de token / apiKey / contenido de mensaje en logs · EXISTE · severidad MEDIA-BAJA · confianza ALTA**
- `services/FacebookConversionService/SyncDatasets.ts:203,215` y `FacebookAuthHelper.ts:85` imprimen
  `accessToken.substring(0,20)…` / `tokenMeta.substring(0,20)…` → **fragmentos de tokens vivos** en logs.
- `services/WebChatWidgetServices/ProcessWebChatMessageService.ts:37` loguea `widgetApiKey` **completo** + `message.substring(0,50)`
  (credencial de widget + fragmento de mensaje del cliente = PII).
- Limpios: `AIProviderService.ts:72` (solo booleano `apiKeyEXISTS`), `config/upload.ts:52` (solo present/missing). Grep de
  `password` en logs: sin resultados. *Recomendación:* redactar tokens/apiKey por completo y no loguear contenido de mensajes.

### 5. Archivos / media (`public/`)

**PR-5 · Media servida SIN autenticación y SIN scope de tenant, con URLs adivinables · AUSENTE (control de acceso) · severidad CRÍTICA · P0 · confianza ALTA**
`app.ts:136-155` monta `/public` con `express.static(uploadConfig.directory)` **sin ningún middleware de auth ni de
tenant**. Los archivos viven en `public/company{N}/<tipo>/<archivo>` (`config/upload.ts:80`). Medido: `public/` = **4.8 GB**
(el encargo estima ~17 GB), con carpetas `company1..company53`.
- **Nombres adivinables:** `config/upload.ts:110` y `config/privateFiles.ts:17` generan nombres por timestamp epoch en ms
  (`1783632078718_1783632078718.jpeg`); `companyId` es entero pequeño (1-53). El espacio de búsqueda (companyId enumerable
  × ventana temporal) hace **factible la adivinación/enumeración** de URLs de otro tenant.
- **Datos expuestos:** media de conversaciones WhatsApp, `receipts`/`comprobante` de pago, PDFs, audio, imágenes de
  distintas empresas → **fuga cross-tenant de datos personales/financieros sin autenticar**.
- `routes/mediaRoutes.ts` SÍ define `tenantMiddleware`+`requireTenant` (`:11-12`) pero **NO está montado** (confirmado grep:
  `routes/index.ts` solo importa `mediaBackupRoutes`; concuerda con `seguridad.md §Multi-tenant`) → es código muerto; la
  ruta viva es la `express.static` sin control. `express.static` no lista directorios (mitiga enumeración masiva) pero no
  impide adivinar rutas. *Recomendación:* servir media tras `isAuth` + verificación `companyId`, o URLs firmadas con
  expiración; mover a `private/` con control de acceso.

### 6. Backups y restauración (protección de datos)

**PR-6 · Sin backup funcional/cifrado del stack vivo · AUSENTE · severidad ALTA · P1 · confianza ALTA**
Confrontado con `devops.md §3.8` (NO re-auditado, referenciado): `scripts/backup.sh` apunta a DB/redis/MinIO/S3 inexistentes
(nombres/puertos erróneos) → **no hay evidencia de un backup automatizado funcional**. Desde protección de datos: sin
backup verificado, el **RPO/RTO es indefinido** y hay riesgo real de pérdida permanente (viola el principio de
disponibilidad/integridad). No se observó **cifrado de backups** (el script apuntaba a `pg_dump | gz` + S3 en claro).
No se ejecutó ningún backup (modo no destructivo). *Recomendación:* implementar backup cifrado (pg_dump + AOF de Redis)
probado contra la infra real (`chateamjr@5434`, `chateam-redis@6390`), con prueba de restauración periódica.

### 7. Retención / exportación / eliminación

**PR-7 · Sin política de retención en tablas de PII · AUSENTE · severidad MEDIA · confianza ALTA (NFR-012)**
SPEC §6 y `NFR-012` confirman: `Messages` (79.025), `Contacts` (11.406), `LogTickets` (225.613), `InboundEventLedger`
(77.310) **sin TTL, partición ni purga**. El único TTL-like es la retención de jobs Bull fallidos (7d, PR-4). *Asunto
jurídico por validar (ver abajo):* plazos de conservación bajo LOPDP/RGPD.

**PR-8 · "Derecho al olvido" PARCIAL (supresión lógica, no borrado) · PARCIAL · severidad MEDIA · confianza ALTA**
`routes/lopdpRoutes.ts` monta (montado en `routes/index.ts:386`) `POST /lopdp/contacts/:id/erase` (`isAuth`, tenant-scoped
por `req.user.companyId`). Pero `LopdpService.eraseContact` (`:44-63`) **solo**: (a) purga eventos Meta CAPI pendientes/fallidos,
(b) marca `marketingConsent="denied"` + `erasedAt`. **NO borra** la PII del `Contact` (nombre/teléfono), ni `Messages`, ni
tickets, ni la media de `public/`. Es una **supresión lógica/flag**, no una eliminación. Los eventos ya enviados a Meta son
irreversibles (documentado). *Hallazgo técnico:* la supresión no cumple un borrado efectivo de datos personales.

**PR-9 · Sin exportación / portabilidad de datos por titular · AUSENTE · severidad MEDIA · confianza ALTA**
Grep sin resultados de endpoint de exportación de datos de un contacto/titular. Existe import/export Excel de listas CRM
(`ContactListController`), pero es funcionalidad de negocio, **no** un derecho de portabilidad del titular.

**PR-11 · Consentimiento de marketing NO aplicado en los emisores de campañas · PARCIAL · severidad MEDIA · confianza MEDIA**
`hasMarketingConsent` / `marketingConsent="denied"` / `erasedAt` **solo** se consultan en el pipeline Meta CAPI
(`KanbanCustomConversionDispatchService.ts:168-173`). No se halló gating de consentimiento en los emisores de **campañas
WhatsApp** (`services/CampaignService`, `WbotServices`) ni de email → un contacto con consentimiento denegado o suprimido
**aún podría recibir campañas WhatsApp**. El comentario LOPDP asume "opt-in de mensajería = consentimiento implícito".

### 8. Consentimiento (T&C, opt-in, unsubscribe, cookies)

**PR-10 · Aceptación de T&C + Política de Privacidad · EXISTE · confianza ALTA**
`services/SettingServices/TermsConditionsService.ts` (modelo `UserTermsAcceptance` + `Setting` con
`terms_conditions_requires_acceptance`/`privacy_policy_requires_acceptance="true"`), endpoint `SettingController.acceptTerms:329`.
Aceptación persistida **por usuario de la plataforma** (agentes/operadores), no del contacto final de WhatsApp.

**PR-12 · Unsubscribe de email · EXISTE · confianza ALTA (cruza H-09)**
`GET /tracking/unsubscribe/:recipientId` (`routes/emailTrackingRoutes.ts:41`, `EmailTrackingController.trackUnsubscribe:164`)
+ manejo de webhooks `unsubscribe`/`group_unsubscribe`/`unsubscribed` (`EmailWebhookController.ts:147-149,312-313`). Listas
con `unsubscribeNotification`/`subscribeConfirmation` (`ContactListController.ts:46,83`). Mecanismo de baja funcional.

**PR-13 · Cookie consent · AUSENTE · severidad BAJA · confianza MEDIA**
Sin banner/aviso de cookies en `frontend/src` (grep solo devuelve un label `'gdpr'` no relacionado en `AIAgents.tsx:301`).
La app usa cookies (`cookieParser`, auth) sin UI de consentimiento. *Asunto jurídico según ámbito (ePrivacy/RGPD).*

### 9. Dependencias vulnerables

**PR-16 · `xlsx` (CVE de la SPEC) · OBSOLETO / remediado · confianza ALTA**
La SPEC (§ deuda deps, C-3/P0) cita `xlsx@0.18.5` con CVE sin fix. **HOY ya está actualizado:** `package.json:134` y
`package-lock.json:99,17815` usan `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (build oficial SheetJS que corrige
CVE-2023-30533 prototype pollution y CVE-2024-22363 ReDoS). El premisa del encargo/SPEC está **desactualizada**; ese P0 de
dependencia está resuelto. Sin rastro de 0.18.5 en el lock.

**PR-17 · `whatsapp-rust-bridge@0.5.4` fuera de `package.json` · NO VERIFICABLE · confianza ALTA**
Confirmado: **0 apariciones** como dependencia directa en `package.json`; resuelto en `node_modules/whatsapp-rust-bridge`
(v0.5.4) como **transitivo de `baileys`**. Es un binario nativo Rust (superficie de supply-chain) **no fijado ni auditado**
en el manifiesto. Su estado CVE = **NO VERIFICABLE** sin `npm audit` (prohibido en este encargo). *Recomendación:* fijarlo
explícitamente y revisarlo en la ventana de auditoría de deps.

**PR-18 · `baileys@7.0.0-rc13` (release candidate) en producción · EXISTE (riesgo) · severidad BAJA · confianza ALTA**
`package.json:70` usa una versión **RC** (no estable) de una librería **no oficial** de WhatsApp. Riesgo de estabilidad +
riesgo contractual (ToS de WhatsApp/Meta → posible baneo). Es asunto de negocio/legal-contractual, no CVE.

**PR-19 · Barrido CVE transitivo completo · NO VERIFICABLE**
Versiones directas revisadas por lectura sin flag de vulnerabilidad evidente: `axios ^1.7.4`, `lodash 4.17.21`,
`moment 2.30.1`, `jsonwebtoken 9.0.2`, `form-data 4.0.4`. El árbol transitivo completo requiere `npm audit` → **NO VERIFICABLE**.

### 10. Almacenamiento móvil

**PR-20 · App móvil · N/A (no existe) · confianza ALTA**
Sin `pubspec.yaml` ni proyecto Flutter/React-Native en el repo (grep). El cliente es SPA React/Vite
(`frontend/dist`). No hay almacenamiento local móvil que auditar → **N/A explícito**.

---

## Tabla resumen

| ID | Dimensión | Hallazgo | Clasif. | Severidad | Evidencia | Confianza |
|----|-----------|----------|---------|-----------|-----------|-----------|
| PR-1 | 1 TLS | nginx TLS 1.2/1.3, LE, redirect 443 (cipher amplio) | EXISTE | BAJA | `nginx…padeldev.conf` | ALTA |
| PR-1b | 1 TLS | pg/redis loopback sin TLS (aceptable) | EXISTE | — | `devops.md §3.2` | ALTA |
| PR-1c | 1 TLS | Listmonk `http://` LAN (PII+apikey en claro) | PARCIAL | BAJA | `ListmonkProvider.ts:47` | MEDIA |
| PR-2 | 2 Redis | Creds Baileys en Redis, claro, sin TTL, evictable (LRU) | EXISTE | ALTA · **P1** | `useMultiFileAuthState.ts:15-25`; `cache.ts:28`; `docker-compose.yml:93-100` | ALTA |
| PR-3 | 2 Redis | `requirepass` fail-closed + loopback (fallback `MULTI100` = S-8) | EXISTE | — | `docker-compose.yml:84-95`; `config/redis.ts:22` | ALTA |
| PR-4 | 3 Colas | Payloads con teléfono+mensaje (PII); fallidos 7d | EXISTE | MEDIA | `queues.ts:710,139-146` | ALTA |
| PR-14 | 4 Logs | Dump HTTP Meta completo (OFF por defecto) | PARCIAL | MEDIA | `meta-marketing/src/client.ts:11,121-176` | ALTA |
| PR-15 | 4 Logs | Fragmentos de token + `widgetApiKey` + msg en logs | EXISTE | MEDIA-BAJA | `SyncDatasets.ts:203,215`; `ProcessWebChatMessageService.ts:37` | ALTA |
| PR-5 | 5 Media | `/public` sin auth ni tenant, URLs adivinables (cross-tenant) | AUSENTE | **CRÍTICA · P0** | `app.ts:136-155`; `upload.ts:80,110` | ALTA |
| PR-6 | 6 Backup | Sin backup funcional/cifrado del stack vivo | AUSENTE | ALTA · **P1** | `devops.md §3.8` | ALTA |
| PR-7 | 7 Retención | Messages/Contacts/LogTickets sin TTL/partición | AUSENTE | MEDIA | SPEC §6 NFR-012 | ALTA |
| PR-8 | 7 Olvido | `/lopdp/…/erase` = supresión lógica, no borrado de PII | PARCIAL | MEDIA | `LopdpService.ts:44-63`; `lopdpRoutes.ts` | ALTA |
| PR-9 | 7 Export | Sin exportación/portabilidad por titular | AUSENTE | MEDIA | grep vacío | ALTA |
| PR-11 | 7/8 Consent | Consentimiento solo en Meta CAPI, no en campañas WA/email | PARCIAL | MEDIA | `KanbanCustom…:168-173` | MEDIA |
| PR-10 | 8 Consent | T&C + Privacy Policy aceptación persistida (por usuario) | EXISTE | — | `TermsConditionsService.ts`; `SettingController.ts:329` | ALTA |
| PR-12 | 8 Consent | Unsubscribe email (H-09) | EXISTE | — | `emailTrackingRoutes.ts:41` | ALTA |
| PR-13 | 8 Consent | Cookie consent ausente | AUSENTE | BAJA | grep `frontend/src` | MEDIA |
| PR-16 | 9 Deps | `xlsx` ya en 0.20.3 (CVE remediado) | OBSOLETO | — | `package.json:134`; lock:99 | ALTA |
| PR-17 | 9 Deps | `whatsapp-rust-bridge@0.5.4` transitivo, no fijado | NO VERIFICABLE | — | `node_modules/…`; `package.json` (0 refs) | ALTA |
| PR-18 | 9 Deps | `baileys@7.0.0-rc13` (RC, no oficial) en prod | EXISTE | BAJA | `package.json:70` | ALTA |
| PR-19 | 9 Deps | Barrido CVE transitivo | NO VERIFICABLE | — | (requiere `npm audit`) | — |
| PR-20 | 10 Móvil | Sin app móvil | N/A | — | grep `pubspec.yaml` vacío | ALTA |

**Conteo por clasificación:** EXISTE 8 (PR-1, 1b, 2, 3, 4, 10, 12, 15, 18 → nota: 9 filas EXISTE) · PARCIAL 4 (PR-1c, 8, 11, 14)
· AUSENTE 5 (PR-5, 6, 7, 9, 13) · OBSOLETO 1 (PR-16) · NO VERIFICABLE 2 (PR-17, 19) · MOCK 0 · N/A 1 (PR-20).

## Recomendaciones de seguridad (priorizadas)
1. **P0 — PR-5:** servir `/public` tras `isAuth`+verificación `companyId` o URLs firmadas con expiración; montar/usar la
   ruta con `tenantMiddleware` ya existente (hoy muerta) o mover media a `private/`.
2. **P1 — PR-2:** cifrar en reposo el blob de creds Baileys (`secretCrypto.ts`), sacarlas de la política LRU, TTL/rotación.
3. **P1 — PR-6:** backup cifrado y probado (restore drill) contra la infra real; definir RPO/RTO.
4. **MEDIA:** política de retención/purga NFR-012 (PR-7); borrado efectivo en `erase` (PR-8); export de titular (PR-9);
   gating de consentimiento en emisores de campañas (PR-11); redactar tokens/apiKey/mensajes en logs (PR-14, PR-15).
5. **BAJA:** cookie consent (PR-13); cipher suite nginx + HSTS (PR-1); Listmonk sobre HTTPS (PR-1c); fijar `whatsapp-rust-bridge`
   y salir de `baileys` RC (PR-17/18).

## Asuntos jurídicos por validar (LOPDP Ecuador / RGPD — NO se declara cumplimiento legal)
1. **Aplicabilidad** de LOPDP Ecuador / RGPD al tratamiento de datos de contactos WhatsApp (SPEC NFR-014 marcado **[SUPUESTO]**, requiere legal).
2. **Base de licitud** para campañas WhatsApp/email sin opt-in explícito verificable (consentimiento vs. interés legítimo) — PR-11.
3. **Suficiencia del "derecho de supresión"** actual (flag lógico sin borrar `Messages`/`Contacts`/media) frente al derecho de eliminación LOPDP/RGPD — PR-8.
4. **Derecho de portabilidad/acceso** ausente (sin exportación de datos del titular) — PR-9.
5. **Plazos de retención** de `Messages`/`Contacts`/`LogTickets` — requieren definición legal (NFR-012) — PR-7.
6. **Transferencia de PII a Meta (CAPI)** — base de licitud + deber de información al titular (el hashing SHA-256 mitiga, no exime).
7. **Conservación de comprobantes de pago / posibles documentos de identidad** (`receipts`) sin control de acceso — posible dato financiero/sensible — PR-5.
8. **Uso de Baileys (API no oficial de WhatsApp)** — cumplimiento de los Términos de WhatsApp/Meta (jurídico-contractual) — PR-18.
9. **Cookie consent** ausente — ePrivacy/RGPD según ámbito de usuarios — PR-13.

---

## Resumen ejecutivo (<200 palabras)
Auditadas 10 dimensiones de protección de datos en modo solo-lectura, sin repetir RBAC/secretos-en-reposo (ya en
`seguridad.md`/`devops.md`). **P0:** la media de `/public` (~4.8 GB medidos) se sirve con `express.static` **sin
autenticación ni scope de tenant** y con nombres adivinables (`company{N}/<epoch>.ext`) → fuga cross-tenant no autenticada
de imágenes, PDFs y comprobantes de pago (PR-5; la ruta con `tenantMiddleware` existe pero está muerta). **P1:** las
credenciales de sesión Baileys se guardan en Redis en claro, sin TTL y evictables por LRU (PR-2), y no hay backup funcional
ni cifrado del stack vivo (PR-6). TLS de borde correcto (TLS 1.2/1.3); pg/redis en loopback con `requirepass`. Bull
transporta teléfono+mensaje (PII) con retención de fallidos de 7 días. Existe módulo LOPDP, pero el "olvido" es supresión
lógica (no borra `Messages`/`Contacts`/media), sin retención ni exportación; el consentimiento solo se honra en Meta CAPI,
no en campañas WhatsApp. T&C/privacidad y unsubscribe de email SÍ existen; falta cookie consent. El CVE de `xlsx` de la SPEC
está **remediado** (0.20.3). `META_DEBUG_HTTP` está OFF por defecto. Sin app móvil (N/A).

**Conteo:** EXISTE 9 · PARCIAL 4 · AUSENTE 5 · OBSOLETO 1 · NO VERIFICABLE 2 · MOCK 0 · N/A 1.
**P0:** PR-5 (media sin auth cross-tenant). **P1:** PR-2 (creds Baileys en Redis), PR-6 (sin backup funcional/cifrado).
**Asuntos jurídicos por validar:** 9 (ver lista — aplicabilidad LOPDP/RGPD, base de licitud de campañas, suficiencia del
borrado, portabilidad, retención, transferencia a Meta, comprobantes sin control, Baileys/ToS, cookies).
