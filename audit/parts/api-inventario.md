# Auditoría senior — Dominio: INVENTARIO DE APIs (chateam_jr)

**Fecha:** 2026-07-23 · **Modo:** READ-ONLY · **Base:** `audit/_data/endpoints.tsv` (891 filas)
**Runtime auditado:** PM2 `chateam-node` (pid 3948697), Node 22 + Express, `*:3010`, `NODE_ENV=production`
**Exposición pública verificada:** `https://padeldev.codigo.plus/be/*` → `proxy_pass http://127.0.0.1:3010/` (`/etc/nginx/server.d/padeldev.codigo.plus.conf:38-46`)

---

## 1. Alcance revisado

| Artefacto | Qué se revisó |
|---|---|
| `audit/_data/endpoints.tsv` | 891 filas (file, line, method, path, auth, permiso, handlers) |
| `routes/index.ts` (480 líneas) | Orden de montaje real de 130+ routers, prefijos, stubs inline |
| `app.ts` (215 líneas) | Middleware global: helmet, CORS, body-parser, static, error handler |
| `routes/*.ts` + `routes/api/*.ts` | 134 archivos de rutas; verificación de declaraciones vs TSV |
| `middleware/` | `isAuth`, `isSuper`, `isAuthCompany`, `tokenAuth`, `envTokenAuth`, `rateLimiter`, `validateChatAccess` |
| Controllers clave | Subscription, Paypal, MercadoPago, AICost, FalWebhook, MetaWebhook, FBPageWebhook, Integration, Telegram, EmailPlan, EmailTracking, Version, Plan, Company, Role, User, Api, WebChatWidget, Appointment, DriveBackup |
| `/etc/nginx/server.d/padeldev.codigo.plus.conf` | Vhost público que expone el backend |
| `routes_no_montadas.txt`, `models_no_registrados.txt`, `mounts.json` | Insumos del extractor |

**Fuera de alcance de este informe:** lógica de negocio interna, multi-tenancy a nivel de servicio (salvo cuando el endpoint lo evidencia), frontend (salvo para probar enforcement de permisos), colas BullMQ, sockets.

---

## 2. Método

1. **Reconstrucción del orden real de resolución de Express.** Se parseó `routes/index.ts` para obtener el orden de `routes.use(...)` y su prefijo, y se combinó con el número de línea de cada endpoint dentro de su archivo. Con ese orden global (850 endpoints montados) se ejecutó un matcher segmento-a-segmento (`:param` vs literal, con soporte de `:param?` opcional) para detectar **duplicados exactos** y **sombreados**. Script: `scratchpad/shadow.py`.
2. **Clasificación de `auth=NO`.** Se separó primero lo que pertenece a routers **no montados** (código muerto, riesgo 0 en runtime) del resto, y sobre los realmente expuestos se leyó el controller para decidir *público legítimo* vs *desprotegido*, buscando evidencia de verificación alternativa (firma HMAC, token de proveedor, re-consulta al API del proveedor, validación de origen).
3. **Verificación empírica no intrusiva.** Sólo peticiones **GET idempotentes** contra el host público, para confirmar exposición. No se emitió ningún POST/PUT/DELETE, no se tocó BD, PM2, Docker ni `.env`.
4. **Cobertura del inventario.** Se contrastó, archivo por archivo, el número de declaraciones `.get|.post|.put|.delete|.patch(` contra las filas presentes en el TSV para medir el *gap* del extractor.
5. **Paginación.** Script `scratchpad/pag.py`: para cada `GET` cuyo handler es `index|list|listAll|getAll|all` y cuyo path no termina en `:param`, se localizó la función exportada en `controllers/**` y se buscó `page|limit|offset|perPage|pageSize`. Los positivos se re-verificaron a mano en la capa de servicio (varios ya tienen tope: p.ej. `SimpleListService` limita a 500).

---

## 3. Resumen ejecutivo

El TSV declara 891 endpoints, pero **el inventario está incompleto y contaminado a la vez**: 41 filas pertenecen a routers que nunca se montan (código muerto) y **34 archivos de rutas con ~302 endpoints reales no aparecen en absoluto** en el TSV. La superficie efectiva es ≈1.150 rutas, no 891.

Sobre esa superficie hay **cero control de permisos finos**: `permiso` está vacío en las 891 filas y sólo 41 rutas (4,6%) usan `isSuper`/`isSuperAdmin`. Existe un modelo `Role` con allow-list `permissions`, pero **el backend nunca lo evalúa**: se sirve al cliente y se aplica únicamente en `frontend/src/hooks/usePermissions.ts`. Cualquier usuario autenticado puede invocar directamente las 792 rutas `isAuth`.

Tres agujeros son de explotación directa e inmediata: `/internal/*` (guard de localhost anulado por el reverse-proxy, **verificado 200 desde Internet**), `POST /plans` + `PUT /companies/:id` (auto-upgrade de plan y créditos), y `POST /email-plans/provision` (créditos de email a cualquier `companyId`, sin auth).

---

## 4. Hallazgos

### HALLAZGO H-01 — `/internal/*` accesible desde Internet: el guard "solo localhost" se anula tras nginx
**Severidad: CRÍTICO · Confianza: ALTA (verificado empíricamente)**

`routes/internal.ts:109-116` autoriza por `req.ip`:
```ts
const ip = req.ip || req.connection.remoteAddress;
if (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1") return next();
```
La app **nunca ejecuta `app.set("trust proxy", ...)`** (grep sin resultados en todo el repo excluyendo `node_modules`), por lo que `req.ip` es la IP del socket. nginx hace `proxy_pass http://127.0.0.1:3010/` desde el mismo host → el socket siempre viene de `127.0.0.1` → **el guard aprueba a todo el mundo**.

Verificación (GET idempotente, sin efectos):
```
$ curl -s https://padeldev.codigo.plus/be/internal/health
{"nodeId":"node-1","port":3010,"sessions":21,"memoryMB":244,"uptime":35470.3}
→ HTTP 200
```

**Evidencia:**
- `routes/internal.ts:109-116` (middleware de IP)
- `routes/internal.ts:310-345` `POST /internal/wbot-call` → `wbot[method](...hydratedArgs)`
- `routes/internal.ts:119-130` `POST /internal/send`; `:211` `POST /internal/session/:id/restart`; `:363` `delete-message`; `:399` `edit-message`
- `app.ts:105-108` — `bodyParser.json({limit:'300mb'})` para `/internal` justificado con "estas rutas son localhost-only"
- `/etc/nginx/server.d/padeldev.codigo.plus.conf:38-46`
- Ausencia de `trust proxy`: `grep -rn "trust proxy" --include=*.ts --include=*.cjs` → 0 resultados fuera de `node_modules`

**Riesgo:** `POST /be/internal/wbot-call` permite ejecutar **cualquier método del socket Baileys** de **cualquier `whatsappId`** (21 sesiones activas, sin filtro de `companyId`): enviar mensajes suplantando a cualquier cliente, borrar/editar mensajes, cerrar sesión, exfiltrar. Además `POST /internal/send-media` acepta 300 MB por request → DoS de memoria trivial. Es cross-tenant total y sin autenticación.

**Recomendación:** (a) inmediato, en nginx: `location ~ ^/be/internal/ { return 404; }` antes de `location /be/`; (b) `app.set("trust proxy", 1)` + validar `X-Forwarded-For` real; (c) sustituir el guard por HMAC/secret compartido entre nodos (`X-Internal-Token` con `crypto.timingSafeEqual`); (d) escuchar en `127.0.0.1:3010` en vez de `*:3010`.
**Esfuerzo:** 1 h (a+d) / 4 h (c).

---

### HALLAZGO H-02 — Escalada de privilegios de facturación: `POST /plans` sin `isSuper` + `PUT /companies/:id` acepta `planId`
**Severidad: CRÍTICO · Confianza: ALTA**

`routes/planRoutes.ts:12` monta `POST /plans` con **sólo `isAuth`**, y `controllers/PlanController.ts:119-142` (`store`) no verifica `req.user.super` ni `profile` — sólo valida con Yup que `name` exista y llama a `CreatePlanService(newPlan)`. Contrasta con `store` de compañías, donde ya se detectó y cerró el mismo patrón (`routes/companyRoutes.ts:16-20`, comentario "[Sonda super-admin 2026-07]").

Encadenado: `routes/companyRoutes.ts:21` `PUT /companies/:id` con sólo `isAuth`; `controllers/CompanyController.ts:237-242` permite la rama `else` cuando `companyData.id === id && companyId === id` (o sea, el usuario editando **su propia** empresa) y llama a `UpdateCompanyService({id, ...companyData})`, cuyo `CompanyData` (`services/CompanyService/UpdateCompanyService.ts:8-33`) acepta `planId`, `dueDate`, `aiTokenBalance`, `emailCreditsTotal`, `activeAISubplanId`, `activeEmailPlanId`.

**Evidencia:** `routes/planRoutes.ts:12`; `controllers/PlanController.ts:119-142`; `routes/companyRoutes.ts:21`; `controllers/CompanyController.ts:234-242`; `services/CompanyService/UpdateCompanyService.ts:8-33,45,66-67`

**Riesgo:** Cualquier usuario autenticado (incluido un agente sin privilegios) crea un plan `{users:9999, connections:9999, useOpenAi:true, amount:0}` y se lo auto-asigna junto con `dueDate:'2099-01-01'` y saldos de IA/email arbitrarios. Pérdida directa de ingresos y de los límites que sostienen el coste de OpenAI.

**Recomendación:** añadir `isSuper` a `POST /plans`, `PUT /plans/:id`, `DELETE /plans/:id`; y en `UpdateCompanyService` aplicar allow-list de campos según `req.user.super` (un no-super sólo debería tocar `name`, `phone`, `email`, `document`, `schedules`).
**Esfuerzo:** 3 h.

---

### HALLAZGO H-03 — `POST /email-plans/provision` otorga créditos de email sin autenticación
**Severidad: CRÍTICO · Confianza: ALTA**

`routes/emailPlanRoutes.ts:51` monta la ruta **sin ningún middleware** (el propio comentario de la línea 12 dice "interno — provisionar créditos"). `controllers/EmailPlanController.ts:282-296` toma `companyId`, `emailPlanId` y `mode` **directamente del body** y llama a `EmailPlanService.provisionEmailCredits(...)`.

**Evidencia:** `routes/emailPlanRoutes.ts:51`; `controllers/EmailPlanController.ts:282-296`; ruta montada en `routes/index.ts:426-427`

**Riesgo:** `POST /be/email-plans/provision {"companyId":N,"emailPlanId":M,"mode":"initialize"}` desde Internet asigna el plan de email más caro a cualquier tenant, sin pago. También sirve para *resetear* créditos de un competidor (`mode` controlado por el atacante). No hay `TRUSTED_WEBHOOK_IPS` ni firma.

**Recomendación:** eliminar la ruta HTTP y llamar al servicio en proceso desde `SubscriptionController`; si debe seguir siendo HTTP, exigir `isAuth + isSuper` o un secreto interno con `timingSafeEqual`.
**Esfuerzo:** 1 h.

---

### HALLAZGO H-04 — RBAC declarado pero no aplicado: 0/891 endpoints con permiso fino; los permisos sólo se evalúan en el frontend
**Severidad: ALTO · Confianza: ALTA**

La columna `permiso` de `audit/_data/endpoints.tsv` está **vacía en las 891 filas** (`awk -F'\t' 'NR>1 && $6!=""' | wc -l` → 0). El reparto de middleware es:

| Middleware | Endpoints | % |
|---|---:|---:|
| `isAuth` | 746 | 83,7% |
| `isSuper` / `isSuperAdmin` | 38 / 3 | 4,6% |
| `isAuthCompany` (token estático) | 31 | 3,5% |
| `validateChatAccess` | 14 | 1,6% |
| `tokenAuth` (token de Whatsapp) | 5 | 0,6% |
| `envTokenAuth` | 1 | 0,1% |
| sin auth | 99 (58 montados) | 11,1% |

Existe `models/Role` con `unrestricted` y `permissions` (allow-list JSON) y la tabla `Roles` en BD (`audit/_data/db_tables.tsv`), pero **ningún middleware ni servicio de backend lee `role.permissions` para autorizar**: las únicas referencias son de *lectura para el cliente* (`services/AuthServices/LoginSessionService.ts:127`, `services/UserServices/ShowUserService.ts:25`) y el CRUD del propio rol (`controllers/RoleController.ts`). El enforcement real vive en `frontend/src/hooks/usePermissions.ts:72,79,125`.

**Evidencia:** `audit/_data/endpoints.tsv` (columna 6 vacía); `frontend/src/hooks/usePermissions.ts:64-125`; `services/AuthServices/LoginSessionService.ts:127`; `services/UserServices/ShowUserService.ts:25`; grep de `\.permissions` en `middleware/`+`services/`+`controllers/` sin ninguna comprobación de autorización

**Riesgo:** OWASP A01. Un usuario con rol restringido (p.ej. agente de soporte sin módulo "Campañas" ni "Financiero") accede a `GET /financial/summary`, `POST /campaigns`, `DELETE /contacts/:id`… simplemente llamando la API con su token válido. Las autorizaciones que sí existen son *ad-hoc dentro de algunos controllers* (`RoleController.ts:10,36,66,88`, `CompanyController.ts:234`), lo que produce cobertura irregular e impredecible.

**Recomendación:** introducir `requirePermission("modulo:accion")` que lea `req.user.roleId → Role.permissions` y cablearlo por familia de rutas; empezar por las familias con impacto financiero/PII (`/financial`, `/plans`, `/companies`, `/invoices`, `/contacts`, `/ai/*`). Añadir un test de contrato que falle si una ruta nueva no declara permiso.
**Esfuerzo:** 3-5 días.

---

### HALLAZGO H-05 — El inventario está incompleto: 34 archivos de rutas (~302 endpoints) no aparecen en `endpoints.tsv`
**Severidad: ALTO · Confianza: ALTA**

El extractor sólo capturó las declaraciones en una línea. Los routers escritos en estilo multilínea quedaron fuera **por completo**. Conteo con un grep tolerante sobre `routes/*.ts` + `routes/api/*.ts`: **1.193 declaraciones**, frente a 891 filas del TSV.

Archivos totalmente ausentes (declaraciones detectadas):

| Archivo | Decl. | Archivo | Decl. |
|---|---:|---|---:|
| `routes/campaignAuditRoutes.ts` | 17 | `routes/ugcCampaignRoutes.ts` | 10 |
| `routes/facebookConversionRoutes.ts` | 16 | `routes/campaignRuleRoutes.ts` | 10 |
| `routes/whatsappCoexistenceRoutes.ts` | 15 | `routes/ticketFlowRoutes.ts` | 9 |
| `routes/ugcCreatorRoutes.ts` | 9 | `routes/whatsappMonitorRoutes.ts` | 8 |
| `routes/agentDeviceRoutes.ts` | 7 | `routes/agentIdentityRoutes.ts` | 7 |
| `routes/aiImageGenerationRoutes.ts` | 7 | `routes/aiVideoGenerationRoutes.ts` | 7 |
| `routes/campaignMessageRoutes.ts` | 7 | `routes/whatsappTemplateRoutes.ts` | 7 |
| `routes/emailTrackingRoutes.ts` | 6 | `routes/emailProviderConfigRoutes.ts` | 6 |
| `routes/customerOriginRoutes.ts` | 6 | `routes/ugcOptimizationRoutes.ts` | 6 |
| `routes/coexistenceDispatchRoutes.ts` | 6 | `routes/agentInteractionRoutes.ts` | 5 |
| `routes/attributionRoutes.ts` | 5 | `routes/ugcSocialRoutes.ts` | 5 |
| `routes/aiAgentAssignmentRoutes.ts` | 4 | `routes/kanbanLeadConversionRoutes.ts` | 4 |
| `routes/contactTemperatureRoutes.ts` | 4 | `routes/ugcVideoRoutes.ts` | 4 |
| `routes/whatsappSessionRoutes.ts` | 4 | `routes/aiTokenUsageAdminRoutes.ts` | 2 |
| `routes/emailAnalyticsRoutes.ts` | 2 | `routes/statisticsRoutes.ts` | 2 |
| `routes/falModelsRoutes.ts` | 1 | `routes/whatsappMetaDashboardRoutes.ts` | 1 |
| `routes/debugRoutes.ts` | 1 | `routes/index.ts` (stubs inline) | 3 |

**Evidencia:** comparación por archivo `grep -c "^\s*[A-Za-z_]*\.\(get\|post\|put\|delete\|patch\)(" <file>` vs `grep -c "^<file>\t" audit/_data/endpoints.tsv`; `routes/emailTrackingRoutes.ts:28-66` (6 rutas públicas ausentes del TSV); `routes/whatsappCoexistenceRoutes.ts` (15 rutas, 0 filas en TSV)

**Riesgo:** Toda conclusión de seguridad basada en el TSV (incluida la cifra "99 sin auth") **subestima el riesgo real**. En concreto, las 6 rutas públicas de `emailTrackingRoutes.ts` (ver H-08/H-09) nunca fueron contabilizadas como `auth=NO`.

**Recomendación:** reescribir el extractor usando el AST (`ts-morph`) o instrumentar `app._router.stack` en un arranque de sólo-listado; regenerar `endpoints.tsv` antes de cerrar la auditoría.
**Esfuerzo:** 1 día.

---

### HALLAZGO H-06 — `GET /api/users/:email` expone usuarios cross-tenant (incluido `passwordHash`) tras un token estático global
**Severidad: ALTO · Confianza: ALTA**

`routes/api/apiCompanyRoutes.ts:97` protege la ruta con `isAuthCompany`, que (`middleware/isAuthCompany.ts:19-26`) compara el header contra **un único `process.env.COMPANY_TOKEN`** global: sin identidad, sin `companyId`, sin caducidad, sin rotación, y **sin poblar `req.user`**. El handler `UserController.showEmail` (`controllers/UserController.ts:309-315`) delega en `APIShowEmailUserService(email)` (`services/UserServices/APIShowEmailUserService.ts:7-40`) que hace `User.findOne({ where: { email } })` **sin filtrar por `companyId` y sin `attributes`**. `models/User.ts:47-48` declara `passwordHash` como columna normal y el modelo **no tiene `defaultScope` que la excluya**.

**Evidencia:** `routes/api/apiCompanyRoutes.ts:97`; `middleware/isAuthCompany.ts:10-32`; `controllers/UserController.ts:309-315`; `services/UserServices/APIShowEmailUserService.ts:7-44`; `models/User.ts:47-48`

**Riesgo:** con un único secreto (compartido por 31 endpoints y presumiblemente embebido en integraciones de clientes) se enumeran usuarios de **todas** las empresas y se obtiene el hash bcrypt, el `document` fiscal de la compañía, `dueDate` y el plan. Fuga de PII (LOPDP) + material para cracking offline.

**Recomendación:** (1) `attributes` explícitos en el servicio y `defaultScope: { attributes: { exclude: ["passwordHash", "tokenVersion"] } }` en `models/User`; (2) filtrar por `companyId`; (3) reemplazar `isAuthCompany` por credenciales por-tenant (API key con `companyId`, hash en BD, rotable).
**Esfuerzo:** 1 día.

---

### HALLAZGO H-07 — `POST /api/login` y `POST /api/signup` evaden por completo el rate limiting de autenticación
**Severidad: ALTO · Confianza: ALTA**

`routes/authRoutes.ts:17,21,23` añadió `signupLimiter`/`authLimiter` tras verificar que el login no tenía protección anti-fuerza-bruta (comentario "[Ola 2 seguridad]", líneas 8-13). Pero **existe un segundo juego de rutas equivalente sin limitador**: `routes/api/apiCompanyRoutes.ts:105-108` monta `POST /api/signup → UserController.store`, `POST /api/login → SessionController.store`, `POST /api/refresh_token → SessionController.update`, todas sin middleware.

Además, sin `trust proxy` (ver H-01) el `keyGenerator` degrada: `authLimiter` usa `${req.ip}:${email}` (`middleware/rateLimiter.ts:109-113`) → siempre `127.0.0.1:<email>` (sigue siendo por email, tolerable), pero `signupLimiter` (`:128-145`) usa el generador por IP por defecto → **todos los registros del planeta comparten un único cubo de 3/hora**: cualquiera puede dejar el alta de clientes fuera de servicio con 3 peticiones.

**Evidencia:** `routes/api/apiCompanyRoutes.ts:105-108`; `routes/authRoutes.ts:8-24`; `middleware/rateLimiter.ts:99-145`; ausencia de `trust proxy`

**Riesgo:** fuerza bruta y *password spraying* ilimitados vía `/be/api/login`; DoS del registro con 3 requests; `/api/auth/refresh_token`, `/api/auth/reset-password` y `/api/auth/google/verify` tampoco tienen limitador.
**Recomendación:** aplicar `authLimiter`/`signupLimiter` a las rutas de `apiCompanyRoutes`, o mejor deprecarlas y dejar un único punto de autenticación; `app.set("trust proxy", 1)`; añadir limitador a `refresh_token` y `reset-password`.
**Esfuerzo:** 3 h.

---

### HALLAZGO H-08 — Open redirect público en `GET /tracking/click/:recipientId`
**Severidad: ALTO · Confianza: ALTA**

`controllers/EmailTrackingController.ts:110-158`. La "validación anti open redirect" comprueba **únicamente el esquema**:
```ts
if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) { res.status(400)... }
...
res.redirect(302, decodedUrl);
```
No hay allow-list de dominios, ni firma que ate `recipientId` ↔ `url`. El bloque `catch` (`:147-157`) redirige a `req.query.url` **sin ninguna validación**, así que incluso el filtro de esquema se puede saltar forzando una excepción previa.

**Evidencia:** `controllers/EmailTrackingController.ts:113,120-126,146,151-153`; ruta pública en `routes/emailTrackingRoutes.ts:34-37`, montada en `routes/index.ts:407`

**Riesgo:** `https://<dominio-cliente>/be/tracking/click/1?url=https%3A%2F%2Fphishing.tld` da a un ataque de phishing la reputación del dominio del cliente y evade filtros de correo/proxies. Adicionalmente, sin binding `recipientId↔url` se puede envenenar la analítica de clics de cualquier campaña.

**Recomendación:** firmar el par (`recipientId`,`url`) con HMAC en el momento de generar el email y verificarlo en el redirect; o resolver la URL desde BD por índice, nunca desde el query. Eliminar el fallback del `catch`.
**Esfuerzo:** 4 h.

---

### HALLAZGO H-09 — `GET /tracking/unsubscribe/:recipientId`: mutación por GET con ID secuencial y sin token
**Severidad: MEDIO · Confianza: ALTA**

`routes/emailTrackingRoutes.ts:40-43` + `controllers/EmailTrackingController.ts:164-174`: un `GET` sin autenticación ejecuta `await TrackingService.trackUnsubscribe(recipientId)` con `recipientId = Number(req.params.recipientId)` — entero secuencial, sin token de un solo uso.

**Evidencia:** `controllers/EmailTrackingController.ts:164-174`; `routes/emailTrackingRoutes.ts:40-43`

**Riesgo:** (a) enumerar `1..N` desuscribe masivamente a los destinatarios de todos los tenants; (b) los escáneres de enlaces de Gmail/Outlook/Defender siguen los `GET` de los correos → **desuscripciones falsas automáticas**, degradando la entregabilidad del producto de email marketing sin que nadie lo note.

**Recomendación:** token HMAC de un solo uso en la URL; página de confirmación `GET` + acción real por `POST` (o cabecera `List-Unsubscribe-Post: List-Unsubscribe=One-Click` según RFC 8058).
**Esfuerzo:** 4 h.

---

### HALLAZGO H-10 — Callbacks OAuth sin `state` firmado: secuestro de vinculación + open redirect
**Severidad: ALTO · Confianza: ALTA**

**Google Calendar** — `controllers/AppointmentController.ts:664-695`: `state` es base64 de un JSON **sin firma** con `companyId`, `userId`, `redirectUri` y `frontendUrl`; se decodifica y se usa tal cual (`:677-689`), y `frontendUrl` alimenta el `res.redirect()` final (`:678,691`) → open redirect adicional.

**Google Drive** — `controllers/DriveBackupController.ts:65-92`: `state` es directamente `parseInt(stateParam)` = el `companyId`; además `redirectUri` se acepta desde el query (`:69-71`).

**Evidencia:** `routes/appointmentRoutes.ts:58`; `controllers/AppointmentController.ts:667-691`; `routes/driveBackupRoutes.ts:10`; `controllers/DriveBackupController.ts:67-88`

**Riesgo:** el `state` es el único anti-CSRF de OAuth. Al no estar firmado: (a) un atacante enlaza **su** cuenta de Google al `companyId` de la víctima (o al revés, robando el refresh token de la víctima para su propio tenant); (b) `frontendUrl` arbitrario convierte el callback en redirector abierto bajo el dominio del cliente.
**Recomendación:** `state` = nonce aleatorio persistido en Redis con TTL, atado a la sesión del usuario que inició el flujo; nunca transportar `companyId`/`userId`/`redirectUri` en el `state`; validar `frontendUrl` contra `FRONTEND_URL`.
**Esfuerzo:** 1 día.

---

### HALLAZGO H-11 — `POST /version` sin autenticación permite alterar la versión global del frontend
**Severidad: MEDIO · Confianza: ALTA**

`routes/versionRoutes.ts:8` monta `POST /version` sin middleware; `controllers/VersionController.ts:11-22` escribe `req.body.version` en `Version` id=1 y lo persiste. `GET /version` está confirmado público (`curl https://padeldev.codigo.plus/be/version` → `{"version":"6.0.0"}`).

**Evidencia:** `routes/versionRoutes.ts:7-8`; `controllers/VersionController.ts:11-22`; montado en `routes/index.ts:310`

**Riesgo:** el valor es global (no por tenant) y el frontend lo usa para detectar versión obsoleta; escribirlo desde Internet provoca recargas forzadas / banners de "actualiza" para **todos** los tenants, o congela la detección de despliegues. Escritura no autenticada sobre estado compartido.
**Recomendación:** `isAuth + isSuper`, o mover el valor a build-time.
**Esfuerzo:** 30 min.

---

### HALLAZGO H-12 — Rutas duplicadas y sombreadas por orden de registro
**Severidad: MEDIO · Confianza: ALTA**

Análisis sobre los 850 endpoints montados en su orden real de resolución:

| Tipo | Método + path | Gana (activo) | Pierde (código muerto / alcance alterado) |
|---|---|---|---|
| Duplicado exacto | `GET /contacts` | `routes/contactRoutes.ts:15` → `ContactController.index` | `routes/contactRoutes.ts:24` → `ContactController.getContactVcard` |
| Duplicado exacto | `GET /api/users/:email` | `routes/api/apiCompanyRoutes.ts:97` → `isAuthCompany` + `showEmail` | `routes/api/apiCompanyRoutes.ts:137` (`/api/users/:userId`, `isAuth` + `show`) |
| Duplicado exacto | `GET /api/contacts` | `routes/api/apiCompanyRoutes.ts:128` → `isAuth` + `index` | `routes/api/apiContactRoutes.ts:8` → `isAuthCompany` + `show` |
| Sombreado `:param` | `GET /settings/terms` | `routes/settingRoutes.ts:20` `/settings/:settingKey` → `showOne` | `routes/settingRoutes.ts:51` `getTermsSettings` **nunca se ejecuta** |
| Doble montaje | 15 rutas de coexistencia | `routes.use("/whatsapp", …)` (`routes/index.ts:330`) | también en `routes.use("/webhook/meta", …)` (`routes/index.ts:331`) → 15 alias duplicados no inventariados |

Casos notables por su impacto funcional:
- **`GET /api/users/:userId` es inalcanzable**: toda petición cae en `:email` con `isAuthCompany`. El endpoint "normal" con `isAuth` que el frontend esperaría **no existe en runtime**, y en su lugar responde el que filtra cross-tenant (H-06).
- **`GET /settings/terms`** devuelve el `Setting` cuya clave literal es `"terms"` en vez de la configuración de términos; el panel de administración de T&C queda roto silenciosamente.
- **`/webhook/meta/*`**: el router de coexistencia aplica `whatsappCoexistenceRoutes.use(isAuth)` (línea 12), por lo que el alias montado como "Embedded Signup callback" **exige JWT** — un callback de Meta nunca lo trae. Duplica superficie sin cumplir su propósito declarado.

**Evidencia:** `scratchpad/shadow.py` sobre el orden de `routes/index.ts:243-477`; ficheros y líneas de la tabla; `routes/whatsappCoexistenceRoutes.ts:12`
**Recomendación:** borrar los duplicados muertos; mover `/settings/:settingKey` **después** de todas las rutas literales `/settings/*`; decidir un único montaje para el router de coexistencia y un handler dedicado (sin `isAuth`) para el callback de Meta; añadir un test que falle ante `method+path` repetidos.
**Esfuerzo:** 4 h.

---

### HALLAZGO H-13 — 41 endpoints en routers nunca montados: incluye el rate limiter global y todo el observability
**Severidad: MEDIO · Confianza: ALTA**

`audit/_data/routes_no_montadas.txt` lista 7 archivos; 5 de ellos aportan las 41 filas `(NO-MONTADO)` del TSV, y 2 más (`debugRoutes`, `contactTemperatureRoutes`) ni siquiera fueron parseados:

| Router | Endpoints | Consecuencia verificada |
|---|---:|---|
| `routes/webchatRoutes.ts` | 17 | Módulo WebChat "core" muerto. **Además es el único consumidor de `apiLimiter`** (`:4,10`) |
| `routes/mediaRoutes.ts` | 9 | Módulo Media muerto; único `PATCH` del sistema (`:89`); modelo `Media` sin registrar |
| `routes/billingRoutes.ts` | 9 | Módulo de facturación Stripe duplicado y muerto; modelos `Invoice`, `Refund`, `CompanyBilling`, `ApplePurchase` sin registrar. `frontend/src/pages/Billing.tsx:120-179` usa `/subscription/*` e `/invoices/all`, no estas rutas |
| `routes/healthRoutes.ts` | 4 | `/ready`, `/live`, `/metrics` inexistentes. `prometheus/prometheus.yml:12,17` y `monitoring/prometheus.yml:43` scrapean `/metrics` → **monitorización ciega**. Sólo existe el `/health` inline de `routes/index.ts:246-253`, que no comprueba BD ni Redis |
| `routes/webhookWebchatRoutes.ts` | 2 | Único consumidor de `webhookLimiter` (`:3,8`) |
| `routes/contactTemperatureRoutes.ts` | 4 | Feature completa inaccesible (sin referencias en `frontend/src`) |
| `routes/debugRoutes.ts` | 1 | Ruta de diagnóstico ("BORRAR DESPUÉS", `:1`) que dumpea `WebChatWidgets` por `apiKey`; no montada — riesgo latente si alguien la monta |

**Evidencia:** `audit/_data/routes_no_montadas.txt`; `routes/index.ts` (sin `import`/`use` de esos módulos); `routes/webchatRoutes.ts:4,10`; `routes/webhookWebchatRoutes.ts:3,8`; `middleware/rateLimiter.ts:38-94,168-182`; `prometheus/prometheus.yml:12,17`; `routes/index.ts:246-253`
**Riesgo:** el rate limiting general del producto **no está activo en ninguna ruta** (sólo los limitadores puntuales de `authRoutes` y de generación IA); `/health` responde 200 aunque Postgres o Redis estén caídos; ~40 endpoints de código muerto confunden auditorías y despliegues.
**Recomendación:** decidir por módulo (montar o mover a `_cuarentena/`); cablear `apiLimiter` global en `app.ts` **después** de `app.set("trust proxy")`; montar `healthRoutes` para restablecer `/ready`, `/live` y `/metrics`.
**Esfuerzo:** 1 día.

---

### HALLAZGO H-14 — Webhooks de pago y de canal sin autenticación de origen ni verificación (Coingate, MercadoPago, Telegram, `/webhook/`)
**Severidad: MEDIO · Confianza: ALTA**

Estado real de verificación por webhook público:

| Endpoint | Ruta | Verificación | Veredicto |
|---|---|---|---|
| `POST /subscription/stripewebhook/:type?` | `subScriptionRoutes.ts:12` | HMAC `constructEvent`, **fail-closed** en los 3 caminos (`SubscriptionController.ts:769-783`) | OK |
| `POST /paypal/webhook` | `paypalRoutes.ts:23` | Verificación remota vía API PayPal (`PaypalController.ts:25-53,215`) | OK |
| `POST /api/fal/webhook` | `falWebhookRoutes.ts:6` | Ed25519 + ventana temporal (`FalWebhookController.ts:48-99`) | OK |
| `GET/POST /webhook/metaws`, `/webhook/facebook` | `webHookRoutes.ts:12,13,17,18` | HMAC `X-Hub-Signature-256` (`MetaWebhookController.ts:55-69`, `FBPageWebhookController.ts:53-59`) | OK |
| `POST /integrations/webhooks/:providerId` | `integrationRoutes.ts:61` | HMAC por conexión (`IntegrationController.ts:308-317`) | OK |
| `POST /ai/coingate/webhook` | `aiCostRoutes.ts:13` | **Ninguna**; `CoingateService.processWebhook` (`:133-152`) sólo loguea y devuelve un objeto | Sin firma **y sin efecto** |
| `POST /ai/mercadopago/webhook` | `aiMercadoPagoRoutes.ts:13` | **Ninguna**; `MercadoPagoService.processWebhook` (`:143-159`) re-consulta el pago pero **no acredita nada** | Sin firma **y sin efecto** |
| `POST /telegram/webhook/:telegramId` | `telegramRoutes.ts:15` | Sólo validación de esquema Yup (`TelegramController.ts:486-526`); **sin `X-Telegram-Bot-Api-Secret-Token`** | Desprotegido |
| `GET/POST /webhook/` | `webHookRoutes.ts:9-10` | Ninguna (`controllers/WebHookController.ts`) | Desprotegido |
| `POST /subscription/webhook[/pix]/:type?`, `/subscription/create/webhook` | `subScriptionRoutes.ts:18-20` | Sin firma; mitigado porque re-consulta el `txid` en Gerencianet (`SubscriptionController.ts:540-568`) | Aceptable con reservas |

**Riesgo:** en Telegram, `telegramId` es un entero secuencial → cualquiera inyecta mensajes entrantes falsos en el flujo de tickets/IA de cualquier tenant (envenenamiento de conversaciones, consumo de créditos IA, disparo de automatizaciones). En Coingate/MercadoPago el hallazgo es doble: falta firma **y** el flujo de acreditación está incompleto — los pagos cripto/MP no otorgan créditos.
**Recomendación:** `secret_token` en `setWebhook` de Telegram y comparación con `timingSafeEqual`; firma HMAC + idempotencia (`eventId` único) en Coingate/MercadoPago antes de completar la acreditación; auditar o eliminar `/webhook/`.
**Esfuerzo:** 1-2 días.

---

### HALLAZGO H-15 — `envTokenAuth` acepta el secreto por query string
**Severidad: MEDIO · Confianza: ALTA**

`middleware/envTokenAuth.ts:16,21-23`: acepta `?token=<ENV_TOKEN>` además del body, y además hace `console.log("|=== | middleware | ===|", req.query)` (`:18`) — **imprime el token en los logs de la aplicación**. Usado por `GET /public-settings/:settingKey` (`routes/settingRoutes.ts:30`).

**Evidencia:** `middleware/envTokenAuth.ts:16-27`, especialmente `:18` y `:21-23`; `routes/settingRoutes.ts:30`
**Riesgo:** el secreto queda registrado en `access_log` de nginx, en el historial del navegador, en cabeceras `Referer` hacia terceros y en `logs/` de PM2. `ENV_TOKEN` es global (no por tenant) y no rota.
**Recomendación:** exigir cabecera `Authorization`; eliminar el `console.log`; rotar `ENV_TOKEN`.
**Esfuerzo:** 1 h.

---

### HALLAZGO H-16 — CORS global depende de `FRONTEND_URL` y `PlanController.update` puede colgar la petición
**Severidad: BAJO · Confianza: MEDIA**

(a) `app.ts:70-85`: el `origin` callback devuelve `process.env.FRONTEND_URL` (valor único). Si esa variable faltara, `cors` cae en la rama "sin origin configurado" y emite `Access-Control-Allow-Origin: *`, incompatible con `credentials:true` → login roto. En el proceso vivo `FRONTEND_URL=https://padeldev.codigo.plus`, así que hoy funciona, pero es una configuración frágil de un solo dominio (no soporta staging + producción, ni el widget WebChat embebido salvo por la excepción explícita `/webchat/public/`).

(b) `controllers/PlanController.ts:208-240`: si el usuario **no** es super y `PlanCompany.toString() === id`, ninguna rama devuelve respuesta → la función retorna `undefined`, no se envía nada y **la petición queda colgada** hasta el timeout de nginx (`proxy_read_timeout 300s`).

**Evidencia:** `app.ts:70-85`; `controllers/PlanController.ts:208-240`; `/proc/3948697/environ` → `FRONTEND_URL=https://padeldev.codigo.plus`
**Riesgo:** (a) fragilidad de despliegue; (b) sockets retenidos 300 s por petición → vector de agotamiento de conexiones barato en un NAS de 4 cores.
**Recomendación:** allow-list de orígenes desde una lista separada por comas; cerrar la rama faltante con `403`.
**Esfuerzo:** 2 h.


---

## 5. Tablas del inventario

### 5.1 Distribución global

| Métrica | Valor | Fuente |
|---|---:|---|
| Filas en `endpoints.tsv` | 891 | `wc -l` − cabecera |
| En routers **no montados** | 41 | filtro `(NO-MONTADO)` |
| **Endpoints efectivos inventariados** | **850** | 891 − 41 |
| Declaraciones reales en `routes/` (grep multilínea) | 1.193 | ver H-05 |
| **Gap del extractor** | **≈ 302** | 1.193 − 891 |
| `auth=SI` | 792 (88,9%) | col. 5 |
| `auth=NO` | 99 (11,1%) → **58 montados** | col. 5 |
| Con permiso fino declarado | **0 (0,0%)** | col. 6 |

**Métodos HTTP:** GET 398 (44,7%) · POST 328 (36,8%) · PUT 87 (9,8%) · DELETE 77 (8,6%) · PATCH 1 (0,1%, y está en un router no montado).

### 5.2 Resumen por familia de rutas (sobre 850 montados, 133 familias)

| # | Familia | Endpoints | `auth=NO` | Observación |
|---:|---|---:|---:|---|
| 1 | `/ai/*` | 178 | 2 | 20,9% de la API; sólo 16 con `isSuper`; sin permisos finos |
| 2 | `/appointments/*` | 43 | 1 | El `auth=NO` es el callback OAuth de Google (H-10) |
| 3 | `/integrations/*` | 19 | 1 | Webhook con HMAC por conexión (OK) |
| 4 | `/comment-autoreply/*` | 17 | 0 | |
| 5 | `/contacts/*` | 17 | 0 | Contiene 1 duplicado exacto (H-12) |
| 6 | `/companies/*` | 16 | 0 | `PUT /companies/:id` acepta `planId` (H-02) |
| 7 | `/api/messages/*` | 14 | 5 | Los 5 usan `tokenAuth` (token de Whatsapp) — legítimo |
| 8 | `/chats/*` | 14 | 0 | Únicos usuarios de `validateChatAccess` |
| 9 | `/tiktok/*` | 14 | 1 | Callback OAuth |
| 10 | `/messages/*` | 13 | 0 | |
| 11 | `/email-templates/*` | 12 | 0 | |
| 12 | `/social-comments/*` | 12 | 0 | |
| 13 | `/affiliates/*` | 11 | 0 | 7 con `isSuper` |
| 14 | `/api/auth/*` | 11 | 7 | Login/signup/recuperación — público por diseño |
| 15 | `/email-campaigns/*` | 11 | 0 | |
| 16 | `/settings/*` | 11 | 1 | Sombreado `/settings/terms` (H-12) |
| 17 | `/campaigns/*` | 10 | 0 | |
| 18 | **`/internal/*`** | **10** | **10** | **Todos expuestos a Internet (H-01)** |
| 19 | `/meta-marketing/*` | 10 | 0 | |
| 20 | `/announcements/*` | 9 | 0 | |
| 21 | `/plans/*` | 9 | 1 | `POST /plans` sin `isSuper` (H-02) |
| 22 | `/subscription/*` | 9 | 4 | Stripe fail-closed OK; PIX sin firma |
| 23 | `/tags/*` | 9 | 0 | |
| 24 | `/tickets/*` | 9 | 0 | |
| 25 | `/webchat/*` | 9 | 3 | Públicos validan `origin` contra dominios del widget |
| 26 | `/whatsapp/*` | 9 | 0 | +15 de coexistencia no inventariadas |
| 27 | `/webhook/*` | 7 | 6 | 4 con HMAC Meta; `/webhook/` sin verificación (H-14) |
| 28 | `/email-plans/*` | 8 | 3 | Incluye `provision` sin auth (H-03) |
| 29 | `/telegram/*` | 7 | 1 | Webhook sin `secret_token` (H-14) |
| 30 | `/drive-backup/*` | 6 | 1 | Callback OAuth sin `state` firmado (H-10) |
| — | otras 103 familias | 289 | 6 | ninguna supera 6 endpoints |

### 5.3 Clasificación de los endpoints sin autenticación

De las 99 filas `auth=NO`: **41 pertenecen a routers no montados** (riesgo 0 en runtime, ver H-13) y **58 están efectivamente expuestos**. Clasificación de esos 58:

**A. Público legítimo — 40 endpoints**

| Subgrupo | # | Endpoints | Control compensatorio |
|---|---:|---|---|
| Autenticación / alta | 10 | `/api/auth/{signup,login,forgot-password,reset-password,refresh_token,google/verify,signup/terms/:type}`, `/api/{signup,login,refresh_token}` | Parcial: sólo 3 con limitador (H-07) |
| API externa por token | 5 | `/api/messages/{send,send/linkImage,checkNumber,send-template,checkNumbers}` | `tokenAuth` resuelve el `companyId` desde el token de Whatsapp (`controllers/ApiController.ts:121-132` filtra por `companyId`) |
| Webhooks verificados | 8 | `/subscription/stripewebhook/:type?`, `/paypal/webhook`, `/api/fal/webhook`, `/webhook/metaws` (GET+POST), `/webhook/facebook` (GET+POST), `/integrations/webhooks/:providerId` | HMAC / verificación remota |
| Widget WebChat | 3 | `/webchat/public/{config/:apiKey,message,messages/:apiKey/:sessionId}` | `apiKey` + validación de `origin` (`WebChatWidgetController.ts:190,258,285`) |
| Callbacks OAuth | 3 | `/appointments/calendar/google/callback`, `/tiktok/oauth/callback`, `/drive-backup/oauth-callback` | **`state` sin firmar** (H-10) |
| Catálogo / config pública | 6 | `/plans/list`, `/email-plans`, `/email-plans/:id`, `/payment-config/public`, `/settings/terms/public/:type`, `/public-settings/:settingKey` | El último con `envTokenAuth` (H-15); `/payment-config/public` sólo devuelve claves públicas (`paymentConfigRoutes.ts:43-51`) |
| Marketing / tracking | 4 | `/ref/:code`, y `/tracking/{open,click,unsubscribe}/:recipientId` *(estas 3 no estaban en el TSV — H-05)* | Ninguno (H-08, H-09) |
| Salud / versión | 1 | `GET /version` | — |

**B. Desprotegidos — 18 endpoints**

| Endpoint | Archivo:línea | Severidad | Motivo |
|---|---|---|---|
| `POST /internal/wbot-call` | `routes/internal.ts:310` | CRÍTICO | RPC arbitrario sobre Baileys, cross-tenant |
| `POST /internal/send` | `routes/internal.ts:119` | CRÍTICO | Envío suplantando cualquier sesión |
| `POST /internal/send-media` | `routes/internal.ts:133` | CRÍTICO | Ídem + body de 300 MB |
| `POST /internal/delete-message` | `routes/internal.ts:363` | ALTO | Borrado en cualquier chat |
| `POST /internal/edit-message` | `routes/internal.ts:399` | ALTO | Edición en cualquier chat |
| `POST /internal/session/:id/restart` | `routes/internal.ts:211` | ALTO | Reinicio de sesión → DoS por tenant |
| `POST /internal/msg-status` | `routes/internal.ts:251` | MEDIO | Manipula el registry de mensajes pendientes |
| `GET /internal/msg-pending/:wid` | `routes/internal.ts:280` | MEDIO | Fuga de metadatos de mensajes |
| `GET /internal/session/:id/status` | `routes/internal.ts:196` | BAJO | Enumeración de sesiones |
| `GET /internal/health` | `routes/internal.ts:226` | BAJO | **Verificado 200 público** |
| `POST /email-plans/provision` | `routes/emailPlanRoutes.ts:51` | CRÍTICO | Créditos gratis a cualquier `companyId` |
| `POST /version` | `routes/versionRoutes.ts:8` | MEDIO | Escritura global no autenticada |
| `POST /telegram/webhook/:telegramId` | `routes/telegramRoutes.ts:15` | MEDIO | Sin `secret_token`; `telegramId` secuencial |
| `GET /webhook/` | `routes/webHookRoutes.ts:9` | MEDIO | Sin verificación |
| `POST /webhook/` | `routes/webHookRoutes.ts:10` | MEDIO | Sin verificación |
| `POST /ai/coingate/webhook` | `routes/aiCostRoutes.ts:13` | MEDIO | Sin firma (y sin acreditación real) |
| `POST /ai/mercadopago/webhook` | `routes/aiMercadoPagoRoutes.ts:13` | MEDIO | Sin firma (y sin acreditación real) |
| `POST /subscription/{create/webhook,webhook/:type?,webhook/pix/:type?}` | `routes/subScriptionRoutes.ts:18-20` | MEDIO | Sin firma; mitigado por re-consulta de `txid` |

### 5.4 Listados sin paginación

Metodología en §2.5; se descartaron falsos positivos verificando la capa de servicio (p.ej. `GET /contacts/list` **sí** está topado: `services/ContactServices/SimpleListService.ts:18` `limit: 500`).

| Endpoint | Archivo:línea | Tabla / volumen | Riesgo |
|---|---|---|---|
| `GET /companies/list` | `routes/companyRoutes.ts:11` | `Companies` | Superadmin, crece con el negocio |
| `GET /companies/:companyId/members` | `routes/companyRoutes.ts:32` | `Memberships` | Bajo |
| `GET /users/list` | `routes/userRoutes.ts:14` | `Users` | Medio |
| `GET /invoices/list`, `GET /invoices/all` | `routes/invoicesRoutes.ts:8,9` | `Invoices` | **Crece 1 fila/mes/empresa; sin techo** |
| `GET /whatsapp/`, `/whatsapp/all`, `/whatsapps`, `/whatsapps/all` | `routes/whatsappRoutes.ts:17,19,22,24` | `Whatsapps` | 21 sesiones hoy; payload pesado (credenciales, `tokenMeta`) |
| `GET /queue`, `/queues`, `/api/queue` | `routes/queueRoutes.ts:9,16`, `routes/api/apiCompanyRoutes.ts:150` | `Queues` | Bajo |
| `GET /files/list` | `routes/filesRoutes.ts:12` | `Files` | Medio |
| `GET /settings` | `routes/settingRoutes.ts:18` | `Settings` | Bajo |
| `GET /roles` | `routes/roleRoutes.ts:8` | `Roles` | Bajo |
| `GET /tags/list` | `routes/tagRoutes.ts:9` | `Tags` | Medio |
| `GET /chatbot`, `/queue-options`, `/automation-rules`, `/campaign-settings`, `/ai/chatbot-domains`, `/ai/email-templates`, `/ai/extensions`, `/telegram`, `/tiktok`, `/plans/list`, `/plans/all` | ver §export | varias | Bajo–medio |

Los listados de las tablas verdaderamente grandes (`LogTickets` 225.675, `Messages` 79.195, `Notifications` 30.637, `Contacts` 11.385 — `audit/_data/db_rowcounts.tsv`) **sí** paginan (`NotificationController.index`, `MessageController.index`, `ContactController.index`), por lo que el riesgo agregado de este apartado es MEDIO, no ALTO.

### 5.5 Verbos HTTP

El uso de verbos es, en general, correcto: no se detectó ningún `GET` cuyo handler sea `store|update|destroy|remove` ni ningún `POST` que sirva `show|index` salvo casos legítimos (`POST /api/messages/send` con handler llamado `index` — nombre desafortunado, semántica correcta). Excepciones reales:

| Problema | Endpoint | Evidencia | Impacto |
|---|---|---|---|
| Mutación por `GET` | `GET /tracking/unsubscribe/:recipientId` | `EmailTrackingController.ts:164-174` | H-09: prefetch de clientes de correo desuscribe solo |
| `POST` para renovar sesión | `POST /api/refresh_token`, `POST /api/auth/refresh_token` → `SessionController.update` | `apiCompanyRoutes.ts:108`, `authRoutes.ts:24` | Cosmético |
| `PATCH` huérfano | `PATCH /media/:id` | `routes/mediaRoutes.ts:89` | Único `PATCH` del sistema y en router no montado → inconsistencia de estilo |
| `DELETE` masivo sin recurso | `DELETE /files` → `FilesController.removeAll` | `routes/filesRoutes.ts:18`, `controllers/FilesController.ts:142-150` | Correcto en tenancy (`companyId` de `req.user`) pero sin confirmación; cualquier usuario `isAuth` borra **todos** los archivos de su empresa |

### 5.6 Diagrama de la cadena de exposición (H-01)

```
Internet
   │  https://padeldev.codigo.plus/be/internal/wbot-call
   ▼
nginx  (/etc/nginx/server.d/padeldev.codigo.plus.conf:38)
   │  proxy_pass http://127.0.0.1:3010/     ← origen del socket = 127.0.0.1
   ▼
Express (app.ts:168)  · SIN app.set("trust proxy")   ← req.ip = "127.0.0.1"
   ▼
routes/internal.ts:109-116   if (ip === "127.0.0.1") next();   ✅ PASA
   ▼
routes/internal.ts:320-327   wbot[method](...args)   → 21 sesiones WhatsApp, cualquier tenant
```

---

## 6. Fichas detalladas — 25 endpoints de mayor riesgo

Formato: `API-###` · método + path · archivo:línea · auth · handler · riesgo · acción.

| ID | Endpoint | Archivo:línea | Auth actual | Handler | Riesgo | Sev. | Acción |
|---|---|---|---|---|---|---|---|
| API-001 | `POST /internal/wbot-call` | `routes/internal.ts:310` | Guard IP anulado | inline → `wbot[method](...)` | RPC arbitrario sobre el socket Baileys de cualquier `whatsappId`; sin filtro `companyId` | CRÍTICO | Bloquear en nginx + secreto HMAC |
| API-002 | `POST /internal/send` | `routes/internal.ts:119` | Guard IP anulado | `getWbot(whatsappId).sendMessage` | Enviar WhatsApp suplantando a cualquier cliente | CRÍTICO | Ídem |
| API-003 | `POST /internal/send-media` | `routes/internal.ts:133` | Guard IP anulado | envío de media | Ídem + `bodyParser.json({limit:'300mb'})` (`app.ts:105-108`) → DoS de heap | CRÍTICO | Ídem + bajar el límite |
| API-004 | `POST /email-plans/provision` | `routes/emailPlanRoutes.ts:51` | **Ninguna** | `EmailPlanController.provisionEmailCredits:282` | Créditos de email arbitrarios a cualquier `companyId` desde el body | CRÍTICO | Quitar la ruta HTTP |
| API-005 | `POST /plans` | `routes/planRoutes.ts:12` | `isAuth` | `PlanController.store:119` | Crear planes ilimitados sin ser super (encadena con API-006) | CRÍTICO | Añadir `isSuper` |
| API-006 | `PUT /companies/:id` | `routes/companyRoutes.ts:21` | `isAuth` | `CompanyController.update:209` | Auto-asignarse `planId`, `dueDate`, `aiTokenBalance`, `emailCreditsTotal` | CRÍTICO | Allow-list de campos por rol |
| API-007 | `GET /api/users/:email` | `routes/api/apiCompanyRoutes.ts:97` | `isAuthCompany` (token global) | `UserController.showEmail:309` | Usuario cross-tenant completo, **incluye `passwordHash`** | ALTO | `attributes` + scope `companyId` |
| API-008 | `POST /api/login` | `routes/api/apiCompanyRoutes.ts:106` | Ninguna | `SessionController.store` | Fuerza bruta sin límite (evade `authLimiter` de `/api/auth/login`) | ALTO | Aplicar `authLimiter` o deprecar |
| API-009 | `POST /api/connect` | `routes/api/apiCompanyRoutes.ts:107` | Ninguna | `controllers/api/ConnectController.ts:19` | Valida email+password y **devuelve el token de Whatsapp**; respuestas distintas para `USER_NOT_FOUND` (`:47-53`) y contraseña inválida (`:57-61`) → enumeración de usuarios + brute force sin límite | ALTO | Limitador + respuesta genérica 401 |
| API-010 | `POST /api/signup` | `routes/api/apiCompanyRoutes.ts:105` | Ninguna | `UserController.store` | Alta masiva sin `signupLimiter` | ALTO | Aplicar `signupLimiter` |
| API-011 | `GET /tracking/click/:recipientId` | `routes/emailTrackingRoutes.ts:34` | Ninguna (público) | `EmailTrackingController.trackClick:110` | Open redirect (sólo valida esquema; `catch` en `:151-153` redirige sin validar) | ALTO | HMAC(recipientId,url) |
| API-012 | `GET /appointments/calendar/google/callback` | `routes/appointmentRoutes.ts:58` | Ninguna | `AppointmentController.handleGoogleCallback:664` | `state` base64 sin firma con `companyId`/`userId`; `frontendUrl` → open redirect | ALTO | `state` = nonce en Redis |
| API-013 | `GET /drive-backup/oauth-callback` | `routes/driveBackupRoutes.ts:10` | Ninguna | `DriveBackupController.handleOAuthCallback:65` | `state` = `companyId` en claro; `redirectUri` desde el query | ALTO | Ídem |
| API-014 | `POST /internal/session/:id/restart` | `routes/internal.ts:211` | Guard IP anulado | `StartWhatsAppSession` | Reinicio remoto de la sesión de cualquier tenant → DoS dirigido | ALTO | Bloquear en nginx |
| API-015 | `POST /internal/delete-message` | `routes/internal.ts:363` | Guard IP anulado | `wbot.sendMessage({delete})` | Borrado de mensajes en cualquier chat | ALTO | Ídem |
| API-016 | `POST /internal/edit-message` | `routes/internal.ts:399` | Guard IP anulado | `wbot.sendMessage({edit})` | Edición de mensajes ya entregados | ALTO | Ídem |
| API-017 | `GET /tracking/unsubscribe/:recipientId` | `routes/emailTrackingRoutes.ts:40` | Ninguna | `EmailTrackingController.trackUnsubscribe:164` | Mutación por `GET`, ID secuencial, sin token → baja masiva + auto-baja por prefetch | MEDIO | Token de un solo uso + `POST` |
| API-018 | `POST /version` | `routes/versionRoutes.ts:8` | Ninguna | `VersionController.store:11` | Escritura global no autenticada | MEDIO | `isAuth + isSuper` |
| API-019 | `POST /telegram/webhook/:telegramId` | `routes/telegramRoutes.ts:15` | Ninguna | `TelegramController.webhook:486` | Sin `secret_token`; inyecta mensajes entrantes falsos en cualquier tenant | MEDIO | `X-Telegram-Bot-Api-Secret-Token` |
| API-020 | `POST /webhook/` | `routes/webHookRoutes.ts:10` | Ninguna | `WebHookController.webHook` | Webhook genérico sin verificación de origen | MEDIO | Firmar o eliminar |
| API-021 | `POST /ai/coingate/webhook` | `routes/aiCostRoutes.ts:13` | Ninguna | `AICostController.coingateWebhook:24` | Sin firma; además `CoingateService.processWebhook:133-152` no acredita nada (flujo incompleto) | MEDIO | Firma + idempotencia |
| API-022 | `POST /ai/mercadopago/webhook` | `routes/aiMercadoPagoRoutes.ts:13` | Ninguna | `AIMercadoPagoController.webhook:34` | Sin firma; `MercadoPagoService.processWebhook:143-159` sólo loguea | MEDIO | Firma + acreditación real |
| API-023 | `GET /public-settings/:settingKey` | `routes/settingRoutes.ts:30` | `envTokenAuth` | `SettingController.publicShow` | Secreto por query string + `console.log(req.query)` (`middleware/envTokenAuth.ts:18,21`) | MEDIO | Cabecera `Authorization` |
| API-024 | `PUT /plans/:id` | `routes/planRoutes.ts:13` | `isAuth` | `PlanController.update:167` | Sin `isSuper` en la ruta; la rama no-super sin respuesta cuelga la petición 300 s (`:229-239`) | MEDIO | `isSuper` + cerrar la rama |
| API-025 | `GET /settings/terms` | `routes/settingRoutes.ts:51` | `isAuth` | `SettingController.getTermsSettings` | **Inalcanzable**: lo captura `/settings/:settingKey` (`:20`); el panel de T&C devuelve datos incorrectos | MEDIO | Reordenar rutas |

---

## 7. Elementos no verificables con la evidencia disponible

1. **Valores de `.env`** — la lectura de `/home/jcromero09/chateam_jr/.env` y `.env.example` está bloqueada por el guard del entorno, y `/proc/3948697/environ` sólo muestra el entorno de exec de PM2 (no las variables cargadas por `dotenvConfig()` en `app.ts:39`). Por tanto **no verificable** si están definidos `COMPANY_TOKEN`, `ENV_TOKEN`, `STRIPE_WEBHOOK_SECRET`, `META_APP_SECRET`, `TRUSTED_WEBHOOK_IPS` ni `FAL_WEBHOOK_VERIFY_SIGNATURE`. Los hallazgos H-06 y H-15 asumen que `COMPANY_TOKEN`/`ENV_TOKEN` están definidos (si no lo estuvieran, esos endpoints devolverían 401/403 y el riesgo sería nulo, pero 31 rutas quedarían inservibles).
2. **Explotabilidad efectiva de H-01 en escritura** — sólo se ejecutó el `GET /internal/health` idempotente. **No verificable** por observación directa que `POST /internal/wbot-call` produzca un envío real, al estar prohibido emitir escrituras. La cadena (proxy → `req.ip` → guard) sí está verificada de extremo a extremo.
3. **Modo de firma de Meta** — `MetaSignatureValidator.getSignatureMode()` admite modos (p.ej. `warn` vs `enforce`) que dependen de configuración; **no verificable** si en producción está en modo bloqueante.
4. **Endpoints de los 34 archivos ausentes del TSV** — se contabilizaron sus declaraciones y se auditó en detalle `emailTrackingRoutes.ts` y `whatsappCoexistenceRoutes.ts`, pero **no verificable** el estado de auth/permiso de los ~280 endpoints restantes sin regenerar el inventario (H-05).
5. **Consumo real de los endpoints por el frontend** — sólo se comprobó de forma puntual (`Billing.tsx`, `usePermissions.ts`). **No verificable** cuántos de los 850 endpoints están efectivamente en uso ni cuántos son código muerto.
6. **`GET /webhook/`** — `controllers/WebHookController.ts` fue localizado por el import (`routes/webHookRoutes.ts:2`) pero no se auditó su cuerpo; el veredicto "sin verificación" se basa en la ausencia total de coincidencias de `signature|createHmac|secret` en el fichero. **No verificable** qué efectos concretos produce.
