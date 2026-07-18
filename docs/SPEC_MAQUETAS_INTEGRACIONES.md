# SPEC — Completar las 8 páginas maqueta (Integraciones, Webhooks, Settings, Prompts, RealtimeChats)

> # 🗄️ ARCHIVADO — 2026-07-17
> **JC archivó el módulo de integraciones "por lo pronto". NO desarrollar este spec.**
> Se conserva porque el trabajo de investigación (estado real verificado contra código, BD y runtime)
> es lo caro y no caduca: si el módulo se retoma, se empieza desde aquí y no desde cero.
>
> **NO se archiva con el módulo — sigue vivo y pendiente:**
> - **§4.2 IDOR cross-tenant en QueueIntegration.** NO pertenece a este módulo: `QueueIntegrations`
>   (Dialogflow/N8N/Typebot/FlowBuilder) es un módulo **en producción**, usado por los listeners de
>   WhatsApp/Facebook/Meta, con **21 flows reales de 5+ empresas** en BD. El bug está activo.
> - **§4.1 API key en texto plano** (`laravelApi.ts:8`) — la clave está en el repo y en el historial de git;
>   hay que rotarla, se archive el módulo o no.
>
> Las 8 páginas maqueta quedan como están: solo son alcanzables por URL directa (nadie las enlaza,
> no están en el menú), así que el riesgo de dejarlas es bajo. Si el archivado se vuelve definitivo,
> la Fase 0 (borrar duplicados) y la retirada de rutas/permisos siguen siendo válidas.

**Estado:** ~~propuesta para desarrollo~~ → **ARCHIVADO** · **Fecha:** 2026-07-17 · **Autor:** auditoría frontend chateam
**Regla de oro de este spec:** todo lo que sigue está **verificado contra el código, la BD y el runtime**, no inferido. Cada afirmación lleva su evidencia.

---

## 1. Resumen ejecutivo

8 páginas del frontend están enrutadas en `App.tsx` con `ProtectedRoute` y módulo RBAC propio, pero **no hacen ni una sola llamada a la API**: 14 handlers (`handleSave`, `handleSyncNow`, `handleDeleteWebhook`…) solo hacen `console.log` y cierran el modal.

La investigación reveló que **no son un solo problema, sino cuatro problemas distintos** que exigen tratamientos opuestos. La conclusión más importante:

> **El backend de integraciones (Billie/AriaLite/SGR/SmartTrack) NO está sin construir: está construido y ROTO.**
> `GET /integrations/providers` → **HTTP 500** hoy mismo, en producción.

Y dos de las ocho páginas **no deben desarrollarse en absoluto**: son duplicados muertos de páginas que ya funcionan.

### Veredicto por página

| # | Página | Estado real verificado | Acción |
|---|---|---|---|
| 1-4 | `IntegrationBillie`, `IntegrationAriaLite`, `IntegrationSGR`, `IntegrationSmartTrack` | Backend **completo pero roto** (500) + 0 providers en BD | **REPARAR** backend → seed → cablear front |
| 5 | `IntegrationsWebhooks` | Backend **inexistente** (todo lo que hay es entrante; la maqueta es saliente) | **CONSTRUIR** desde cero |
| 6 | `IntegrationsSettings` | Sin tabla; hay dos patrones candidatos | **DECIDIR** esquema → construir |
| 7 | `OpenAIPrompts` | **Duplicado** de `Prompts.tsx`, que ya funciona | **BORRAR** |
| 8 | `RealtimeChats` | **Duplicado** de `InternalChats.tsx`, que ya funciona | **BORRAR** |

**Coste real ≈ 40% de lo que aparenta**: 2 páginas se borran, 4 comparten un único arreglo de raíz.

---

## 2. Evidencia del estado actual

### 2.1 El backend de integraciones existe y es sustancial

- `routes/integrationRoutes.ts` monta en `/integrations` (`routes/index.ts:473`).
- **13 endpoints reales** en `controllers/IntegrationController.ts`: CRUD de connections, `POST /connections/:id/test`, `sync/inbound`, `sync/outbound`, `sync/logs`, `webhooks`, `mappings`.
- **4 services de proveedor reales**, con HTTP real vía axios: `services/IntegrationServices/{Billie,AriaLite,SmartTrack,SGR}IntegrationService.ts`, todos `extends BaseIntegrationService`.
- Los 6 modelos **sí** están registrados en `database/index.ts:447-452` (no son huérfanos).
- Multi-tenant correcto: todos los endpoints filtran por `companyId` de `req.user`.

### 2.2 …pero está roto en runtime (VERIFICADO EN VIVO)

```
GET /integrations/providers    → HTTP 500 {"error":"Internal server error"}
GET /integrations/connections  → HTTP 500 {"error":"Internal server error"}
GET /integrations/             → HTTP 200 {"data":[]}   ← stub hardcodeado, miente
```

**Causa raíz — el modelo y la tabla divergieron** (renombrado en el modelo sin migración):

| `models/Integrations/IntegrationProvider.ts` declara | `integration_providers` (BD real) tiene |
|---|---|
| `defaultConfig` | `configSchema` |
| `iconUrl` | `icon` |
| `documentationUrl` | *(no existe)* |
| `webhookSupport` | *(no existe)* |
| *(no declara)* | `webhookUrl`, `webhookSecret` |

Sequelize hace `SELECT ... "defaultConfig" ...` → `column does not exist` → 500.

### 2.3 Las tablas existen, pero NO las creó la migración

- Las 6 tablas existen en BD, **con columnas en camelCase** (`displayName`).
- `database/migrations/integrations/20251006_create_integrations_tables.sql` las declara en **snake_case** (`display_name`).
- → Las creó `sequelize.sync()` desde los modelos. **Ese `.sql` nunca corrió.**
- Motivo: `scripts/runMigrations.ts:63-67` lee solo el **primer nivel** de `database/migrations` y solo `.ts`/`.js`. Nunca entra en la subcarpeta `integrations/` ni ejecuta `.sql`.
- **Consecuencia:** los `INSERT` de los 4 providers viven en ese mismo `.sql` (líneas 292-296) → **nunca se insertaron**.

### 2.4 Las 6 tablas están VACÍAS

```
integration_providers        0 filas   ← sin providers, el módulo entero es inoperante
integration_connections      0 filas
integration_sync_logs        0 filas
integration_webhook_events   0 filas
integration_entity_mappings  0 filas
integration_api_requests     0 filas
```

### 2.5 Los stubs mienten

`routes/integrationRoutes.ts:7-37` — 6 endpoints hardcodeados bajo el comentario `// ============ STUBS ============` que devuelven `{data:[]}` con **HTTP 200**. Un front que los consuma parece sano y muestra vacío para siempre. Deben eliminarse al conectar los reales.

---

## 3. Fases

### FASE 0 — Borrar los dos duplicados *(1h · riesgo mínimo · hacer primero)*

**Ganancia inmediata: −2 páginas, −2 módulos RBAC fantasma, cero desarrollo.**

#### 0.1 `OpenAIPrompts.tsx` → BORRAR

La funcionalidad **ya existe y funciona** en `frontend/src/pages/Prompts.tsx` (ruta `/prompts`, `App.tsx:323`), cableada a `GET/POST/PUT/DELETE /prompt` (`routes/promptRouter.ts:8-16`, `controllers/PromptController.ts`, `models/Prompt.ts`).

Además, su `formData` **no encaja** con el modelo real:

| Campo maqueta | ¿Existe en `models/Prompt.ts`? |
|---|---|
| `name`, `temperature`, `maxTokens` | ✅ |
| `content` | ⚠️ existe como `prompt` |
| `description`, `category`, `variables`, `model` | ❌ |
| `usageCount`, `avgCost`, `favorite` (tabla) | ❌ |

- **Acción:** borrar `pages/OpenAIPrompts.tsx`, su ruta (`App.tsx:400`) y el módulo `openai_prompts` de `utils/permissions.ts`.
- **Si JC quiere los campos extra** (categoría, variables, contadores de uso/coste): es una **extensión de `Prompts.tsx` + migración de `Prompts`**, no una página nueva. Spec aparte.

#### 0.2 `RealtimeChats.tsx` → BORRAR

Duplicado simplificado de `InternalChats.tsx` (ruta `/internal-chats`, `App.tsx:299`), que sí está completo: `api.get('/chats')`, `api.post('/chats/:id/messages')` con adjuntos, y tiempo real vía `useInternalChatSocket`. `RealtimeChats` tiene chats y mensajes hardcodeados y su `handleSend` **descarta el mensaje**.

- **Acción:** borrar `pages/RealtimeChats.tsx`, su ruta (`App.tsx:281`) y el módulo `realtime_chats`.
- **Verificar antes de borrar:** que ningún usuario tenga permisos concedidos sobre `realtime_chats`/`openai_prompts` en BD (si los tiene, limpiar).

---

### FASE 1 — Reparar el backend de integraciones *(la raíz de las 4 páginas)*

> Sin esta fase, cablear el front es imposible: los endpoints dan 500.

#### 1.1 Alinear modelo ↔ tabla — **decisión requerida**

Dos caminos; hay que elegir **uno**:

- **(A) Migración que adapte la tabla al modelo** *(recomendado)* — `ALTER TABLE`: renombrar `configSchema`→`defaultConfig`, `icon`→`iconUrl`; añadir `documentationUrl`, `webhookSupport`; decidir qué hacer con `webhookUrl`/`webhookSecret` de la tabla (el modelo los tiene en `IntegrationConnection`, que es donde corresponden). **Tablas vacías ⇒ migración sin riesgo de pérdida de datos.**
- **(B) Ajustar el modelo a la tabla** — más rápido pero conserva nombres peores (`configSchema` para lo que es un default, `icon` sin sufijo) y deja el modelo sin `webhookSupport`/`documentationUrl`.

**Recomiendo (A)**: las tablas están vacías, es el momento más barato que va a existir para hacerlo bien.

#### 1.2 Repetir la verificación en los otros 5 modelos

`IntegrationProvider` es el que probamos. **Hay que verificar el mismo desalineamiento** en `IntegrationConnection`, `IntegrationSyncLog`, `IntegrationWebhookEvent`, `IntegrationEntityMapping`, `IntegrationApiRequest`, comparando `information_schema.columns` contra cada modelo. Es muy probable que sufran lo mismo.

#### 1.3 Migración `.ts` de verdad + seed de providers

- Escribir la migración como **`.ts` en el primer nivel** de `database/migrations/` (única ubicación que `runMigrations.ts` ejecuta).
- Seed de los 4 providers (`billie`, `aria_lite`, `smarttrack`, `sgr`) — los nombres **deben coincidir exactamente** con el switch `getIntegrationService` (`IntegrationController.ts:415-430`) o no resolverá el service.
- **Decidir:** ¿seed en migración, o crear `scripts/runSeeds.ts`? Ojo: `package.json:18` ya declara `"db:seed": "node dist/scripts/runSeeds.js"` **pero el archivo fuente no existe**. Es otra promesa rota del repo.
- El `.sql` de `database/migrations/integrations/` debe **borrarse o marcarse obsoleto**: describe un esquema que no es el real y confunde.

#### 1.4 Eliminar los 6 stubs mentirosos

`routes/integrationRoutes.ts:7-37`. Sustituir por los endpoints reales o por 501. **Un stub que devuelve 200 con datos vacíos es peor que un error**: oculta que la funcionalidad no existe.

#### 1.5 Criterios de aceptación (Fase 1)

- [ ] `GET /integrations/providers` → **200** con los 4 providers.
- [ ] `GET /integrations/connections` → **200** (array vacío es correcto si no hay conexiones).
- [ ] `POST /integrations/connections` crea una conexión y `POST /connections/:id/test` la valida.
- [ ] Verificado cross-tenant con cuenta **no-super**: conexión de otra empresa → **404**, propia → **200**.
- [ ] `npm run db:migrate` desde cero reproduce el esquema + providers.

---

### FASE 2 — Cablear las 4 páginas de proveedor

Los endpoints **ya existen** (§2.1). Es trabajo de frontend, sin backend nuevo.

Por cada una de `IntegrationBillie` / `IntegrationAriaLite` / `IntegrationSGR` / `IntegrationSmartTrack`:

1. **Eliminar los datos mock.** `IntegrationBillie` trae un historial de sync hardcodeado con **fechas falsas de 2025-10-13** (`IntegrationBillie.tsx:196-203`) que se muestra como si fuera real.
2. `handleSave` → `POST /integrations/connections` (crear) o `PUT /integrations/connections/:id` (actualizar), con `{providerId, connectionName, authCredentials, config, syncSettings}`.
3. `handleSyncNow` → `POST /integrations/connections/:id/sync/inbound` con `{entityType, options}`; pintar el `SyncResult` devuelto (`recordsProcessed/Created/Updated/Failed`).
4. Historial real → `GET /integrations/connections/:id/sync/logs`.
5. Botón "Probar conexión" → `POST /integrations/connections/:id/test`.
6. **Estados obligatorios** (regla del proyecto): loading, error, empty, data.
7. **Nada de falsos éxitos**: `setSuccess`/toast solo dentro del `try`, después del await (es exactamente el bug que la auditoría encontró en `Feedback.tsx`).

**Criterio de aceptación:** guardar una conexión, cerrar y reabrir la página → la configuración **persiste** (hoy se pierde al cerrar el modal).

---

### FASE 3 — `IntegrationsWebhooks`: construir desde cero *(la más cara)*

**Hallazgo clave: la maqueta es de webhooks SALIENTES. Todo lo que el backend tiene es ENTRANTE.** No hay nada que cablear.

Lo que existe y **no** sirve aquí:
- `WebHookController` / `routes/webHookRoutes.ts` → recepción de Meta/Facebook (`hub.verify_token`).
- `IntegrationWebhookEvent` → log de webhooks **recibidos**.
- `IntegrationConnection.webhookUrl/webhookSecret` → semántica **opuesta**: la URL la **autogenera el backend** para que el proveedor nos llame (`IntegrationController.ts:106`), y el secret sirve para **verificar firmas entrantes** (`:308-317`).
- `models/Webhook.ts` → trigger entrante por hash del FlowBuilder; no hace POST saliente.
- `EmailWebhookQueue` → procesa bounces **entrantes**.

Lo que la maqueta pide (`IntegrationsWebhooks.tsx:174-183`: `name, endpoint, integration, events[], enabled, secret, retryAttempts, timeout`) **no existe en ninguna forma**.

**A construir:**
1. Modelo `CompanyOutboundWebhook`: `companyId, name, url, secret, events[] (JSONB), retryAttempts, timeout, enabled` + migración `.ts` con índice en `companyId`.
2. Modelo `WebhookDeliveryLog`: `webhookId, companyId, eventType, payload, responseStatus, durationMs, attempt, error` (la maqueta ya pinta un panel de logs recientes).
3. `WebhookDeliveryService`: firma HMAC del payload saliente, timeout configurable.
4. **Cola Bull `OutboundWebhookQueue`** con backoff exponencial (la infra de Bull ya existe en `queues.ts`; reusar el patrón). Reintentos = `retryAttempts` de la config.
5. **Catálogo de eventos internos suscribibles** — decisión de producto: ¿`ticket.created`, `message.sent`, `contact.created`…? Hay que definirlo y enganchar los emisores.
6. CRUD + `POST /webhooks/:id/test` (envío de prueba).

**Riesgo de seguridad a diseñar desde el principio (SSRF):** el usuario elige la URL de destino. Sin validación, puede apuntar a `169.254.169.254` (metadata cloud), `localhost` o rangos internos, y usar el servidor como proxy. **Obligatorio:** whitelist de esquema (solo `https`), bloqueo de IPs privadas/loopback/link-local resolviendo el DNS **antes** de conectar, y límite de redirecciones.

---

### FASE 4 — `IntegrationsSettings`: decidir esquema *(bloqueada por decisión)*

Son **~35 campos en 3 bloques** (`IntegrationsSettings.tsx:133-179`): `generalConfig` (retry/timeout/rate limit/log level/health check), `securityConfig` (cifrado/rotación de tokens/whitelist IP/TLS/auditoría), `notificationConfig` (email/slack/webhook/digest).

**No existe** ninguna tabla de settings de integraciones. Dos patrones candidatos en el repo:

| | `Setting` (key/value) | `CompaniesSettings` (columnas tipadas) |
|---|---|---|
| Migración nueva | No | Sí (una columna por campo) |
| Tipado | Ninguno (`value` es TEXT) | Fuerte + whitelist anti-inyección |
| Precedente | Solo **strings planos** (`appLogoLight`); **cero** casos de JSON anidado | Es el patrón usado para bloques grandes (Facebook, TikTok, Drive, tema) |
| Bulk update | **No existe** (`UpdateSettingService` es de una key) | `PUT /companySettings` (una columna) |

**Recomiendo `CompaniesSettings`**: es el patrón que el proyecto ya usa para bloques de config grandes y da tipado + validación.

**Falta construir en cualquier caso:** endpoint de **bulk update** (guardar un tab completo son ~13 campos; hoy exigiría 13 llamadas) y **reset a defaults** (`handleResetDefaults` no tiene equivalente en backend).

**Pregunta de producto previa:** ¿estos settings son **globales de plataforma** (solo super) o **por empresa**? La maqueta no lo aclara y determina el esquema entero.

---

## 4. Hallazgos de seguridad — FUERA DE ESTE SPEC, tratar por separado

Aparecieron durante esta investigación. **No dependen de este spec y son más urgentes que él.**

1. 🔴 **Secreto hardcodeado en el repo** — `services/IntegrationsServices/laravelApi.ts:8` contiene una **API key en texto plano** (`X-API-KEY: 008ba53e…`) apuntando a `globaltrackgps.com`. El archivo está **huérfano** (0 importadores), pero **la clave está en el código y en el historial de git**. Debe rotarse y el archivo borrarse.

2. 🔴 **IDOR cross-tenant en QueueIntegration** — `services/QueueIntegrationServices/ShowQueueIntegrationService.ts:5-10` hace `findByPk(id)` **sin `companyId`**, y el chequeo de tenant está **comentado en el código**. Afecta a:
   - `GET /queueIntegration/:id` → leer la integración de **otra empresa** (incluye `jsonContent` con credenciales de Dialogflow/N8N/Typebot).
   - `PUT /queueIntegration/:id` → modificarla (usa el mismo Show internamente).
   - `DELETE /queueIntegration/:id` → `DeleteQueueIntegrationService` ni recibe `companyId`.

   **Es exactamente el mismo patrón que cerramos en la Ola 3 del backend, y este se nos escapó.** Mismo fix: `findOne({where:{id, companyId}})`.

3. 🟠 **`updateConnection` sin whitelist** — `IntegrationController.ts:141` pasa `req.body` completo a `.update()`. Un cliente podría sobreescribir `companyId` o `webhookSecret`.

4. 🟠 **Código muerto con secreto** — la cadena `models/Integrations.ts` → `UpdateIntegrationService` / `helpers/ChekIntegrations.ts` está desconectada de toda ruta (0 importadores). Borrar.

---

## 5. Orden recomendado

```
FASE 0 (borrar duplicados)    ──> 1h,  riesgo mínimo, −2 páginas   ★ empezar aquí
SEGURIDAD (§4.1, §4.2)        ──> urgente, independiente de todo   ★ o aquí
FASE 1 (reparar backend)      ──> desbloquea 4 páginas de golpe
FASE 2 (cablear las 4)        ──> solo frontend
FASE 4 (settings)             ──> requiere decisión de producto
FASE 3 (webhooks salientes)   ──> la más cara; dejar para el final
```

**Decisiones que necesito de JC antes de desarrollar:**
1. ¿Borramos `OpenAIPrompts` y `RealtimeChats`, o hay intención de producto detrás?
2. Fase 1: ¿migración que adapta la tabla al modelo (A, recomendado) o modelo a la tabla (B)?
3. Fase 4: ¿settings globales de plataforma o por empresa? ¿`CompaniesSettings` (recomendado) o `Setting`?
4. Fase 3: ¿qué eventos internos deben ser suscribibles por webhook saliente?
5. ¿Estas 4 integraciones (Billie/AriaLite/SGR/SmartTrack) siguen en el roadmap, o el módulo entero se archiva? **Si se archivan, este spec se reduce a borrar 8 páginas y no hay nada que desarrollar.**
