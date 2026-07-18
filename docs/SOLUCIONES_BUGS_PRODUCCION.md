# Soluciones a bugs de producción — ChatEAM JR

Documento vivo de bugs detectados en producción y los pasos exactos que resolvieron cada caso. Cada entrada incluye síntomas, causa raíz, archivos involucrados, reparación aplicada y verificación.

> Última actualización: 2026-05-21
> Convención: cada bug = una sección con título, fecha, severidad. NUNCA borrar entradas — solo agregar nuevas. Si un bug regresa, añadir sub-sección "Recurrencia <fecha>" debajo del original.

---

## Índice

1. [SupervisorAI responde aunque la conexión tenga `useAIOrchestrator=false`](#1-supervisorai-responde-aunque-la-conexión-tenga-useaiorchestratorfalse)
2. [Tickets duplicados en coexistencia Baileys + Meta Cloud API](#2-tickets-duplicados-en-coexistencia-baileys--meta-cloud-api)
3. [Conexión WhatsApp atascada en estado OPENING — no genera QR](#3-conexión-whatsapp-atascada-en-estado-opening--no-genera-qr)
4. [Vista de Tickets muestra todos los tickets de la empresa por defecto](#4-vista-de-tickets-muestra-todos-los-tickets-de-la-empresa-por-defecto)
5. [Respuestas rápidas "Global" no son visibles para todos los usuarios](#5-respuestas-rápidas-global-no-son-visibles-para-todos-los-usuarios)
6. [Aceptar ticket pendiente permite sin asignar cola](#6-aceptar-ticket-pendiente-permite-sin-asignar-cola)
7. [Nombre de contacto inconsistente entre lista de tickets y encabezado del chat](#7-nombre-de-contacto-inconsistente-entre-lista-de-tickets-y-encabezado-del-chat)
8. [Pantalla Contactos sin filtro por conexión WhatsApp](#8-pantalla-contactos-sin-filtro-por-conexión-whatsapp)
9. [Modal de mensaje programado no precarga contacto, conexión ni fecha](#9-modal-de-mensaje-programado-no-precarga-contacto-conexión-ni-fecha)
10. [Enlaces dentro de mensajes salientes no se leen (azul sobre turquesa)](#10-enlaces-dentro-de-mensajes-salientes-no-se-leen-azul-sobre-turquesa)
11. [Modal "Transferir Ticket" buscaba contactos en vez de usuarios/agentes](#11-modal-transferir-ticket-buscaba-contactos-en-vez-de-usuariosagentes)
12. [El input de mensaje pierde el foco después de enviar — flujo no fluido](#12-el-input-de-mensaje-pierde-el-foco-después-de-enviar--flujo-no-fluido)

---

## 1. SupervisorAI responde aunque la conexión tenga `useAIOrchestrator=false`

**Fecha:** 2026-05-21
**Severidad:** Crítica
**Reportado por:** sistemasorbi@gmail.com
**Conexión afectada:** Smarttrack ventas (whatsappId=30, companyId=6)

### Síntomas

- Conexión "Smarttrack ventas" tenía `Whatsapps.useAIOrchestrator=false` en BD.
- A pesar del flag desactivado, la IA SupervisorAI respondía a clientes con mensajes como:
  - `¡Hola! Es un gusto saludarte. Con nuestro servicio de rastreo GPS...`
  - `Disculpa, estoy teniendo dificultades técnicas. ¿Quieres que te transfiera a un asesor?`
  - `Te comunicamos con un asesor humano. En breve te atenderán. 🙋‍♂️`
- Logs evidenciaban el problema:
  ```
  [Integration] Verificando - isBot: true, whatsappId: 30, useAIOrchestrator: false, integrationId: null, aiStatus: inactive, useIntegration: false
  [SupervisorAI] aiStatus=active marcado ANTES de procesar: ticket=1515
  [SupervisorAI] Procesando msg empresa=6 ticket=1515
  [SupervisorAI] Escalado a humano: ticket=1517, razón=Error técnico en procesamiento IA
  ```

### Causa raíz

Tres rutas en `wbotMessageListener.ts` podían disparar el SupervisorAI sin validar el flag `useAIOrchestrator`:

1. **`verifyQueue`** (línea ~1660): cuando la conexión tenía **una sola cola** y esa cola tenía `integrationId` apuntando a una `QueueIntegration` de tipo `supervisor_ai`, llamaba a `handleMessageIntegration` y marcaba el ticket con `useIntegration=true, integrationId=N` sin chequear el flag de la conexión.

2. **`handleMessageIntegration` → rama `supervisor_ai`** (línea ~4062): el `case` validaba `isBot=false`, `userId`, `status` (`open`/`closed`), pero **no** validaba `useAIOrchestrator`.

3. **Bloque "3b. CONTINUACIÓN FLOWBUILDER"** (línea ~5507): si el ticket ya tenía `useIntegration=true` e `integrationId` (heredado de una sesión previa), reactivaba la integración sin validar el flag.

En el caso concreto: la cola `Queues.id=4` ("Atención al Cliente") asignada a la conexión tenía `integrationId=9` → `QueueIntegrations.type='supervisor_ai'`. Por eso la ruta 1 disparaba la IA.

### Archivos modificados

- [services/WbotServices/wbotMessageListener.ts](../services/WbotServices/wbotMessageListener.ts)
  - Línea ~1672: añadido `useAIOrchestrator` al destructuring de `ShowWhatsAppService` en `verifyQueue`.
  - Líneas ~1699-1707: guard que bloquea `handleMessageIntegration` cuando la integración de la cola es `supervisor_ai` y `useAIOrchestrator !== true`.
  - Líneas ~4081-4090: guard central al inicio del `case "supervisor_ai"` con fallback `whatsapp?.useAIOrchestrator || ticket?.whatsapp?.useAIOrchestrator`.
  - Líneas ~5546-5556: guard en el bloque "3b. CONTINUACIÓN FLOWBUILDER" para integraciones supervisor_ai heredadas.

### Mitigación SQL inmediata (sin esperar deploy)

```sql
-- 1) Quitar la integración supervisor_ai de la cola única que disparaba el bug
UPDATE "Queues" SET "integrationId" = NULL WHERE id = 4;

-- 2) Limpiar tickets activos con la integración heredada
UPDATE "Tickets"
   SET "useIntegration" = false,
       "integrationId"  = NULL,
       "aiStatus"       = 'inactive'
 WHERE "whatsappId" = 30
   AND "useIntegration" = true
   AND "integrationId" = 9
   AND status != 'closed';
```

### Verificación post-fix

```bash
# Buscar el log del nuevo guard en producción
grep -aE '\[verifyQueue\] supervisor_ai bloqueado|\[SupervisorAI\] Bloqueado|\[Integration:continuación\] supervisor_ai bloqueado' /root/.pm2/logs/node-*-out.log
```

Casos a verificar manualmente:
- IA apagada + cola con `supervisor_ai` → ver log `[verifyQueue] supervisor_ai bloqueado...`, el ticket NO marca `useIntegration=true`.
- IA apagada + ticket heredado con `useIntegration=true, integrationId=supervisor_ai` → ver log `[Integration:continuación] supervisor_ai bloqueado...`.
- IA encendida → la IA responde normalmente.
- Cola con `dialogflow`/`flowbuilder` + IA apagada → ejecuta normalmente (el guard NO bloquea integraciones no-supervisor).

### Riesgos residuales

- Los listeners de **Meta Cloud API**, **Facebook Messenger** y **Telegram** no tienen este guard. Si se configura una cola con `supervisor_ai` en esos canales con `useAIOrchestrator=false`, podría disparar la IA. Pendiente replicar el guard en:
  - `services/MetaServices/metaMessageListener.ts`
  - `services/FacebookServices/facebookMessageListener.ts`
  - `services/TelegramService/TelegramMessageListener.ts`

---

## 2. Tickets duplicados en coexistencia Baileys + Meta Cloud API

**Fecha:** 2026-05-21
**Severidad:** Crítica
**Reportado por:** sistemasorbi@gmail.com

### Síntomas

Cuando una empresa tenía la coexistencia activa (Baileys + Meta Cloud API para el mismo número), llegar un mensaje por un canal y luego por el otro creaba **dos tickets distintos** para la misma conversación. El operador veía dos hilos en el inbox y los clientes podían recibir respuestas duplicadas.

### Causa raíz

`FindOrCreateTicketService.ts` buscaba tickets sólo por `status + contactId + companyId + whatsappId`. Como Meta y Baileys generan distinto `whatsappId` (y potencialmente distinto `contactId` si el contacto se creó por canal), nunca encontraba el ticket existente del otro proveedor y siempre creaba uno nuevo.

El sistema ya tenía infraestructura de coexistencia:
- `services/CoexistenceServices/ConversationResolverService.ts` resuelve un `conversationId` estable que une mensajes del mismo contacto entre canales.
- `services/CoexistenceServices/InboundEventLedgerService.ts` deduplicaba eventos (no tickets).
- La migración `20260421000002-create-coexistence-identity.ts` ya había agregado `Tickets.conversationId` y `Tickets.inboundChannelHint`, pero ningún lookup los usaba.

### Archivos modificados

- [models/Ticket.ts](../models/Ticket.ts) — declaradas las columnas `conversationId` (UUID) e `inboundChannelHint` (STRING 20) que la migración había creado pero el modelo no exponía (sequelize-typescript no las cargaba).
- [services/TicketServices/FindOrCreateTicketService.ts](../services/TicketServices/FindOrCreateTicketService.ts)
  - 14º parámetro opcional `coex?: { conversationId?: string | null; inboundChannelHint?: string | null }`.
  - Lookup nuevo por `(companyId, conversationId, status ∈ ['open','pending','group','nps','lgpd'])` antes del lookup legacy.
  - Persistencia condicional en creación.
- [services/MetaServices/metaMessageListener.ts](../services/MetaServices/metaMessageListener.ts) (~línea 1360) — pasa `{ conversationId, inboundChannelHint: "meta" }`.
- [services/WbotServices/wbotMessageListener.ts](../services/WbotServices/wbotMessageListener.ts) (~línea 4734) — `ConversationResolverService.resolve` movido ANTES del Find/Create con try/catch fallback.

### Cambio en BD: índice parcial UNIQUE para prevenir race conditions

Para impedir que dos workers (Meta y Baileys) creen dos tickets simultáneamente cuando ambos resuelven el mismo `conversationId`:

```sql
CREATE UNIQUE INDEX uniq_tickets_company_conversation_open
  ON "Tickets" ("companyId", "conversationId")
  WHERE "conversationId" IS NOT NULL
    AND status IN ('open','pending','group','nps','lgpd');
```

Antes de crear el índice, validar que no haya duplicados existentes:

```sql
SELECT "companyId", "conversationId", COUNT(*) AS cuantos, array_agg(id ORDER BY id) AS ticket_ids
  FROM "Tickets"
 WHERE "conversationId" IS NOT NULL
   AND status IN ('open','pending','group','nps','lgpd')
 GROUP BY "companyId", "conversationId"
 HAVING COUNT(*) > 1;
```

Si la consulta devuelve filas, hay que decidir cuál ticket conservar antes de crear el índice (cerrar uno como `closed` con `UPDATE`, nunca borrar).

### Callsites de `FindOrCreateTicketService` no afectados

Los siguientes 7 callsites preservan comportamiento idéntico (no pasan `coex`, por ser parámetro opcional al final):

- `services/TicketServices/UpdateTicketService.ts:500`
- `services/TelegramService/TelegramMessageListener.ts:124`
- `services/MetaServices/metaSmbMessageEchoesService.ts:204`
- `services/MetaServices/metaHistorySyncService.ts:90`
- `services/FacebookServices/facebookMessageListener.ts:476`
- `controllers/ApiController.ts:136`
- `controllers/MessageController.ts:1154`

### Verificación post-fix

```bash
# Buscar el log del nuevo lookup en producción
grep -aE '\[FindOrCreateTicket\] Reutilizando ticket' /root/.pm2/logs/node-*-out.log
```

Casos a verificar manualmente:
- Ticket Baileys abierto → llega mensaje Meta del mismo número → log `[FindOrCreateTicket] Reutilizando ticket=X via conversationId=Y` y NO se crea ticket duplicado.
- Mensaje Baileys nuevo con resolver OK → ticket creado con `conversationId` + `inboundChannelHint='baileys'`.
- Race condition simulada (Meta+Baileys simultáneos) → el índice UNIQUE devuelve error en el segundo `INSERT`; el manejo del error debe re-leer el ticket existente.

### Riesgos residuales

- **Tickets pre-coexistencia** (creados antes de esta fecha) no tienen `conversationId` poblado. El primer mensaje nuevo de cualquier canal los enlazará vía el bloque legacy `upsertBinding/recordInbound`. Sin urgencia. Considerar backfill futuro.
- **`UpdateTicketService` (transferencia)** no pasa `coex`. Es intencional: una transferencia explícita quiere crear ticket nuevo en otra cola/conexión.

---

## 3. Conexión WhatsApp atascada en estado OPENING — no genera QR

**Fecha:** 2026-05-21
**Severidad:** Alta
**Reportado por:** sistemasorbi@gmail.com
**Conexión afectada:** Jefe de Ventas (whatsappId=33, companyId=8)

### Síntomas

- La conexión "Jefe de Ventas" estaba en estado `OPENING` en la UI.
- No mostraba código QR para escanear.
- Logs PM2 evidenciaban un loop infinito:
  ```
  Socket Jefe de Ventas Connected successfully
  Socket Jefe de Ventas Disconnected: Stream Errored (conflict)
  Starting session Jefe de Ventas
  Socket Jefe de Ventas Disconnected: Connection Failure
  ...
  ```

### Causa raíz

Credenciales de sesión Baileys corruptas/conflictivas en Redis (`sessions:33:*`). El error **`Stream Errored (conflict)`** indica que el mismo número estaba autenticado en otro lado (otra sesión WhatsApp Web del usuario, o sesión zombie persistida). El loop de reconexión automática no podía resolverlo solo porque las credenciales viejas no eran válidas pero tampoco se purgaban.

### Dónde se guarda la sesión

`helpers/useMultiFileAuthState.ts` persiste TODO el estado Baileys en **Redis** con prefijo `sessions:<whatsappId>:`. Para esta conexión había ~11.000 claves zombie.

### Reparación aplicada (procedimiento reproducible)

> Ajusta las credenciales según `.env` del entorno.

```bash
WHATSAPP_ID=33  # ← cambiar al ID afectado
NODE_TARGET=node-2  # ← cambiar al nodo PM2 que tiene la sesión asignada

# Credenciales (sacar de /home/deploy/chateam_jr/.env)
REDIS_PASS=$(grep ^REDIS_PASSWORD /home/deploy/chateam_jr/.env | cut -d= -f2)
PG_PASS=$(grep ^DB_PASS /home/deploy/chateam_jr/.env | cut -d= -f2)
PG_USER=$(grep ^DB_USER /home/deploy/chateam_jr/.env | cut -d= -f2)
PG_DB=$(grep ^DB_NAME /home/deploy/chateam_jr/.env | cut -d= -f2)

# 1) Verificar cuántas claves zombie hay
redis-cli -h 127.0.0.1 -p 5000 -a "$REDIS_PASS" --no-auth-warning \
  --scan --pattern "sessions:${WHATSAPP_ID}:*" | wc -l

# 2) Borrar TODAS las claves de esa sesión en Redis (NO usar FLUSHALL — solo este prefijo)
redis-cli -h 127.0.0.1 -p 5000 -a "$REDIS_PASS" --no-auth-warning \
  --scan --pattern "sessions:${WHATSAPP_ID}:*" \
  | xargs -L 500 redis-cli -h 127.0.0.1 -p 5000 -a "$REDIS_PASS" --no-auth-warning DEL

# 3) Resetear el registro en BD (UPDATE — NUNCA DELETE)
PGPASSWORD="$PG_PASS" psql -h localhost -U "$PG_USER" -d "$PG_DB" <<SQL
UPDATE "Whatsapps"
   SET session = '',
       qrcode  = '',
       retries = 0,
       status  = 'DISCONNECTED',
       battery = '',
       plugged = false
 WHERE id = ${WHATSAPP_ID};
SQL

# 4) Reload del nodo PM2 que tiene la sesión zombie en memoria (zero-downtime)
pm2 reload "${NODE_TARGET}" --update-env

# 5) Esperar a que arranque y verificar que genere QR
until [ "$(pm2 jlist | python3 -c "import sys,json; d=json.load(sys.stdin); [print(p['pm2_env']['status']) for p in d if p['name']=='${NODE_TARGET}']")" = "online" ]; do sleep 2; done

# 6) Confirmar que el QR está disponible
PGPASSWORD="$PG_PASS" psql -h localhost -U "$PG_USER" -d "$PG_DB" -c \
  "SELECT id, name, status, LENGTH(qrcode) AS qr_len FROM \"Whatsapps\" WHERE id=${WHATSAPP_ID};"
```

Resultado esperado: `status='qrcode'` y `qr_len > 0`. El usuario debe recargar la pantalla de Conexiones en `https://chat.chateam.ws` y el QR aparecerá listo para escanear.

### Cómo identificar en qué nodo PM2 está corriendo la sesión

```bash
grep -aE "whatsappId.{0,3}${WHATSAPP_ID}|Starting session" /root/.pm2/logs/node-*-out.log | tail -10
```

Mira en qué archivo de log aparece `Starting session <nombre>` más recientemente — ése es el nodo a recargar.

### Por qué `pm2 restart` NO se recomienda

- `pm2 restart` corta TODAS las sesiones del nodo (todas las conexiones WhatsApp activas en ese nodo se desconectan brevemente).
- `pm2 reload --update-env` es **zero-downtime**: levanta nuevo proceso, transfiere conexiones, baja el viejo.

### Cuándo aplicar este procedimiento

- Status atascado en `OPENING` o `PENDING` por más de 5 minutos sin generar QR.
- Loop de logs con `Stream Errored (conflict)` o `Connection Failure` repetido.
- Después de migrar el número de proveedor (Baileys ↔ Meta) y la sesión vieja sigue intentando reconectarse.

### Lo que NO hacer

- ❌ **NUNCA** `FLUSHALL` en Redis (borra TODAS las sesiones del sistema).
- ❌ **NUNCA** `DELETE FROM "Whatsapps"` (regla BD SAGRADA).
- ❌ **NUNCA** `pm2 delete <node>` sin reemplazar (regla inamovible).
- ❌ No borrar el campo `name`, `number`, `companyId` ni FKs del registro de Whatsapp.

---

## 4. Vista de Tickets muestra todos los tickets de la empresa por defecto

**Fecha:** 2026-05-22
**Severidad:** Alta
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Tickets — listado principal `/tickets`

### Síntomas

- Al abrir la página de Tickets, el operador veía TODOS los tickets de la empresa en vez de los suyos.
- El backend respondía con tickets de otros agentes incluso cuando el usuario no era admin.
- KPIs y contadores reflejaban totales globales por defecto.

### Causa raíz

1. **Frontend** `frontend/src/pages/Tickets.tsx:202`: `const [showAll, setShowAll] = useState(true)` — el estado inicial era `true`, lo que disparaba el primer fetch con `showAll: 'true'`.
2. **Backend** `services/TicketServices/ListTicketsService.ts`: cuando `showAll === "true"` y el usuario era admin/super/`allUserChat=true`, ampliaba el `where` a todos los tickets de la empresa. **Además**, las ramas para status `closed` y `pending` no filtraban consistentemente por `userId` cuando `showAll=false` — un usuario no-privilegiado podía caer en una rama `else` que omitía el filtro.

### Archivos modificados

- [frontend/src/pages/Tickets.tsx:202](../frontend/src/pages/Tickets.tsx) — `useState(true)` → `useState(false)`. Toggle UI manual sigue funcionando.
- [services/TicketServices/ListTicketsService.ts](../services/TicketServices/ListTicketsService.ts):
  - Líneas ~270-275 (status `closed`): variable `restrictClosedToOwn = showAll !== "true" || !(isPrivilegedUser || showAllUserChat)` reemplaza las dos ramas que antes podían dejar `latestTickets` sin filtrar.
  - Líneas ~626-678 (guard final antes del `findAndCountAll`): si `showAll !== "true"` o el usuario NO es admin/super/allUserChat, fuerza `userId` en `whereCondition` para TODOS los status menos `group`. Para `pending` aplica `{ Op.or: [userId, null] }` (preserva pendientes sin asignar pero solo en colas del agente).

### Casuística cubierta (matriz)

| `showAll` | Perfil | Status | Resultado |
|-----------|--------|--------|-----------|
| `true` | admin/super/allUserChat | open/pending/closed | TODOS (legacy intacto) |
| `true` | user normal | cualquiera | Guard fuerza `userId` (defensa en profundidad) |
| `false` | cualquiera | open | solo `userId=yo` |
| `false` | cualquiera | pending | `userId IN (yo, null)` filtrado por mis colas |
| `false` | cualquiera | closed | solo `userId=yo` (estricto — un cierre por otro agente NO aparece) |
| `false` | cualquiera | search/group | solo `userId=yo` / `whatsappId` del usuario |

### Verificación post-fix

```bash
# 1) Default frontend debe ser false
grep -n "showAll.*useState" /home/deploy/chateam_jr/frontend/src/pages/Tickets.tsx
# Esperado: const [showAll, setShowAll] = useState(false);

# 2) Probar como usuario no-admin: GET /tickets?status=open&showAll=false
#    → solo tickets del userId actual

# 3) Probar como admin con showAll=true:
#    → todos los tickets de la empresa
```

### Riesgos residuales

- `ListTicketsServiceKanban.ts` NO fue tocado. Si Kanban presenta el mismo bug, requiere parche análogo (matriz idéntica).
- Tickets `pending` con `userId=null` siguen visibles en "mis pendientes" si están en colas del agente. Si la regla de negocio cambia, basta con cambiar `{ Op.or: [userId, null] }` por `userId` estricto en el guard final.
- El toggle "Mostrar todos" en la UI ya no persiste entre sesiones (no había `localStorage` antes; el cambio no introduce regresión).

---

## 5. Respuestas rápidas "Global" no son visibles para todos los usuarios

**Fecha:** 2026-05-22
**Severidad:** Media
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Respuestas Rápidas (`QuickMessages`)

### Síntomas

- Una respuesta rápida creada con el checkbox "Global" marcado se veía como `Global` en la lista de quien la creó, pero otros usuarios de la misma empresa no la veían en su autocompletado de mensajes.
- No era problema de permisos (`quick_replies` estaba habilitado en el menú).

### Causa raíz

Inconsistencia entre dos columnas del modelo `QuickMessage`:
- **`geral`** (BOOLEAN) — lo que la UI muestra y guarda como "Global".
- **`visao`** (BOOLEAN) — lo que el backend usa para filtrar visibilidad.

`frontend/src/pages/QuickReplies.tsx:635` muestra "Global" cuando `geral === true`, pero `services/QuickMessageService/ListService.ts:45` y `FindService.ts:15` filtraban con `[Op.or]: [{ visao: true }, { userId }]`.

Resultado: un quickmessage con `geral=true, visao=false` aparecía como "Global" en UI pero solo lo veía el creador.

En la base de datos había **32 filas** con `geral=true` pero `visao≠true` cuando se diagnosticó el bug.

### Decisión arquitectónica

`geral` queda como **fuente única de verdad** para el flag "global". `visao` se mantiene como espejo legado que se sincroniza con `geral` en cada `create`/`update`. Los servicios de lectura filtran por `geral`.

### Archivos modificados

- [database/sql/quickmessages-unify-geral-visao.sql](../database/sql/quickmessages-unify-geral-visao.sql) (NUEVO) — backfill idempotente.
- [services/QuickMessageService/ListService.ts](../services/QuickMessageService/ListService.ts) — `[Op.or]: [{ visao: true }, { userId }]` → `[Op.or]: [{ geral: true }, { userId }]`.
- [services/QuickMessageService/FindService.ts](../services/QuickMessageService/FindService.ts) — mismo cambio.
- [services/QuickMessageService/CreateService.ts](../services/QuickMessageService/CreateService.ts) — `const isGlobal = Boolean(geral) || Boolean(visao); QuickMessage.create({ ..., geral: isGlobal, visao: isGlobal });`.
- [services/QuickMessageService/UpdateService.ts](../services/QuickMessageService/UpdateService.ts) — misma unificación al guardar.

### Backfill SQL ejecutado

```sql
BEGIN;

-- 1) Donde geral=true pero visao no es true → corregir
UPDATE "QuickMessages"
   SET "visao" = true
 WHERE "geral" = true
   AND ("visao" IS DISTINCT FROM true);

-- 2) Donde visao=true pero geral no es true → corregir (caso inverso, por simetría)
UPDATE "QuickMessages"
   SET "geral" = true
 WHERE "visao" = true
   AND ("geral" IS DISTINCT FROM true);

-- Reporte de filas con desincronización (después del fix debe devolver 0)
SELECT COUNT(*) AS desincronizados
  FROM "QuickMessages"
 WHERE COALESCE("geral", false) <> COALESCE("visao", false);

COMMIT;
```

**Resultado del run inicial:**
```
UPDATE 32   ← 32 filas corregidas
UPDATE 0
desincronizados: 0
```

### Comando para re-aplicar el backfill (idempotente)

```bash
PGPASSWORD='ZdG387FhYsm0olSm097541HMSdS=' psql -h localhost -U atendimento -d chateamjr \
  -f /home/deploy/chateam_jr/database/sql/quickmessages-unify-geral-visao.sql
```

### Riesgos residuales

- La columna `visao` sigue en el modelo (regla BD SAGRADA — no se hace `DROP COLUMN`). Consumidores externos que aún la lean siguen funcionando porque CreateService/UpdateService la mantienen sincronizada.
- Default de migración original: `geral=false`, `visao=true`. Cualquier `INSERT` directo en BD que no pase por CreateService podría volver a generar desincronización. Mitigación natural: toda escritura pasa por los servicios.

---

## 6. Aceptar ticket pendiente permite sin asignar cola

**Fecha:** 2026-05-22
**Severidad:** Media-Alta
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Tickets — flujo "Aceptar"

### Síntomas

- Cuando un operador hacía clic en "Aceptar" sobre un ticket pendiente sin cola asignada, el ticket pasaba a `open` con `queueId=NULL`.
- Métricas, reportes por cola, ruteo de bots y dashboard quedaban inconsistentes — esos tickets aparecían huérfanos.
- En el diagnóstico inicial se detectaron **613 tickets sin `queueId`** (155 en `open`, 458 en `pending`).

### Causa raíz

1. **Frontend** `frontend/src/pages/Tickets.tsx:1568` `handleAcceptTicket` enviaba solo `{ status: "open", userId }`, sin `queueId`, sin modal, sin validación.
2. **Backend** `services/TicketServices/UpdateTicketService.ts:849` actualizaba `status, queueId, userId` sin exigir cola.
3. **Backend** `controllers/TicketController.ts:361` pasaba el body directo al servicio.
4. `frontend/src/components/ContactDrawer/index.tsx:766` mostraba Kanban/tags pero NO permitía editar la cola del ticket actual.

### Decisión arquitectónica

Validación **configurable por empresa** mediante `Setting.requireQueueOnAccept`:
- Si el setting es `"enabled"` o `"true"` → el backend rechaza con **400** y `ERR_TICKET_ACCEPT_REQUIRES_QUEUE` si se intenta pasar `pending → open` sin cola.
- Si está apagado o ausente (**default**) → permite aceptar sin cola pero loguea `warn` con `ticketId`, `companyId`, `userId`.
- **No se hace backfill masivo del setting** (regla BD SAGRADA). Cada empresa lo activa cuando quiera.

Frontend: si el ticket no tiene cola y el WhatsApp tiene solo 1 cola disponible → auto-asignación silenciosa. Si tiene varias → modal MUI Joy de selección. Si tiene 0 → modal con lista global.

### Archivos modificados

**Backend:**
- [services/TicketServices/UpdateTicketService.ts](../services/TicketServices/UpdateTicketService.ts):20-22 — `import Setting` + `AppError`.
- [services/TicketServices/UpdateTicketService.ts](../services/TicketServices/UpdateTicketService.ts):848-877 — validación previa al `ticket.update(updateData)`. Detecta `pending → open`, resuelve `finalQueueId = queueId ?? ticket.queueId`, consulta `Setting.findOne({ where: { companyId, key: "requireQueueOnAccept" } })`. Si activo y sin cola → `throw new AppError("ERR_TICKET_ACCEPT_REQUIRES_QUEUE...", 400)`. Si no → `logger.warn` + continúa.

**Frontend:**
- [frontend/src/components/AcceptTicketModal/index.tsx](../frontend/src/components/AcceptTicketModal/index.tsx) (NUEVO, ~150 líneas) — modal MUI Joy con `Select` de colas, estados loading/error/empty, botones Cancelar/Confirmar.
- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx):76 — import del modal.
- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx):333-337 — 4 estados nuevos: `acceptQueueModalOpen`, `ticketToAccept`, `acceptingTicket`, `acceptError`.
- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx):1572-1660 — `handleAcceptTicket` reescrito + helpers `confirmAcceptTicket`, `handleAcceptQueueConfirm`, `handleAcceptQueueClose`.
- [frontend/src/components/ContactDrawer/index.tsx](../frontend/src/components/ContactDrawer/index.tsx):131-260 + 774-806 — selector de cola persistente en el panel del contacto, con `Select` MUI Joy, rollback en error y toasts.

### Cómo activar la validación estricta para una empresa

**Opción A — desde la UI (recomendado):**

`Configuración` → tab **"Tickets"** → toggle **"Exigir Cola al Aceptar Ticket"**. Solo usuarios con perfil `admin` lo ven.

El toggle persiste inmediatamente (no requiere "Guardar Cambios" global). Internamente llama a `PUT /settings/requireQueueOnAccept` con body `{ "value": "enabled" }` o `"disabled"`. El valor se guarda en la tabla `Settings` (modelo key/value, no `CompaniesSettings`).

**Opción B — SQL directo (si la UI no es opción):**

```sql
-- Activar para companyId=6 (ejemplo)
INSERT INTO "Settings" ("key", "value", "companyId", "createdAt", "updatedAt")
VALUES ('requireQueueOnAccept', 'enabled', 6, NOW(), NOW())
ON CONFLICT ("key", "companyId") DO UPDATE SET "value" = 'enabled', "updatedAt" = NOW();
```

### Mejora 2026-05-22 — Visualización inmediata de la cola en el ticket

Para que la cola asignada se vea reflejada **al instante** en la lista de tickets y en el encabezado del chat (sin esperar refetch del frontend) se aplicaron dos cambios complementarios:

**Backend** — [services/TicketServices/UpdateTicketService.ts](../services/TicketServices/UpdateTicketService.ts) (~línea 950):

Antes del `io.emit('company-X-ticket', { action: 'update', ticket })`, se hidrata el ticket con sus relaciones usando `ShowTicketService` (que ya incluye `Queue`, `User`, `Whatsapp`, `Contact`, `Tags`). El emit ahora envía un ticket "pleno":

```ts
let ticketForSocket = ticket;
try {
  ticketForSocket = await ShowTicketService(ticket.id, companyId);
} catch (reloadErr: any) {
  logger.warn(`[UpdateTicket] No se pudo recargar ticket=${ticket.id} con relaciones para socket: ${reloadErr.message}`);
}
io.of(String(companyId)).emit(`company-${companyId}-ticket`, { action: "update", ticket: ticketForSocket });
```

**Frontend** — [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx) (~línea 3166, header del chat):

El header del chat ahora usa el helper `getResolvedQueue(selectedTicket)` (que ya existía y se usa en la lista de tickets). Garantiza que si por algún motivo el payload socket llega sin la queue eager-loaded, se cae al `queueMap` en memoria como fallback:

```tsx
{(() => {
  const headerQueue = getResolvedQueue(selectedTicket)
  return headerQueue ? (
    <Chip size="sm" sx={{ bgcolor: headerQueue.color || '#64748B', color: 'white', height: 18, fontSize: '0.6rem' }}>
      {headerQueue.name}
    </Chip>
  ) : null
})()}
```

**Resultado:**
- Al aceptar un ticket pendiente con cola seleccionada, el chip de cola aparece inmediatamente en:
  - El item de la lista de tickets (ya estaba funcionando vía `getResolvedQueue` desde antes — confirmado en línea ~2610).
  - El encabezado del chat (ahora aparece al instante con el helper + fallback).
- Si el operador cambia la cola desde el selector del `ContactDrawer` (Bug 6 — selector persistente), el cambio se refleja al instante en ambos sitios sin recargar.



Para desactivarla:
```sql
UPDATE "Settings" SET "value" = 'disabled' WHERE "key" = 'requireQueueOnAccept' AND "companyId" = 6;
```

### Verificación post-fix

```bash
# Cuántos tickets huérfanos hay actualmente (solo lectura)
PGPASSWORD='ZdG387FhYsm0olSm097541HMSdS=' psql -h localhost -U atendimento -d chateamjr -c \
  "SELECT status, COUNT(*) FROM \"Tickets\" WHERE \"queueId\" IS NULL AND status IN ('open','pending') GROUP BY status;"

# Buscar logs del warning del nuevo guard
grep -aE '\[UpdateTicket\] Aceptando ticket=.+sin queueId' /root/.pm2/logs/node-*-out.log | tail -10
```

### Riesgos residuales

- **Tickets pre-fix sin queueId** (613 detectados al desplegar) NO se tocaron. Solo se previenen casos futuros.
- **Auto-asignación con 1 cola**: si el usuario solo tiene 1 cola disponible se asigna silenciosamente. Si esa no es la "correcta" para el WhatsApp del ticket, el operador puede corregirla desde ContactDrawer (selector nuevo).
- **`ticket.whatsapp.queues` no se carga en `ShowTicketService`**: el modal usa la lista global `queues` filtrada por permisos del usuario. Si se requiere restringir a queues del WhatsApp puntual, hay que enriquecer ese servicio.
- **Default OFF**: empresas existentes pueden seguir aceptando sin cola hasta que activen el setting. Solo se loguea warning.

---

## 7. Nombre de contacto inconsistente entre lista de tickets y encabezado del chat

**Fecha:** 2026-05-22
**Severidad:** Media
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Tickets — UI

### Síntomas

Para el mismo contacto, la lista de tickets mostraba un nombre humano ("GARCIA ANDRADE LEONARDO ANTONIO (ARIA)") mientras que el encabezado del chat o el modal de aceptar ticket mostraban el número de teléfono. La inconsistencia se daba después de recibir un evento Socket.IO o tras un refetch parcial.

### Causa raíz

1. La lista pinta `ticket.contact?.name` (`Tickets.tsx:2466`).
2. El header del chat pinta `selectedTicket.contact?.name` (`Tickets.tsx:3027`).
3. Cuando llega un evento socket (`company-X-ticket`) con un `contact.name` vacío o igual al `number`, el merge anterior sobreescribía el nombre humano del estado local con un valor degradado.
4. La BD tenía el nombre correcto (auditoría confirmó que `GARCIA ANDRADE...` estaba bien guardado), pero el merge frontend lo pisaba.

### Decisión arquitectónica

- **Centralizar la lógica de visualización** con helpers en `frontend/src/utils/contactDisplay.ts`.
- **Preservar el nombre humano en merges**: si un payload entrante trae `name` vacío o `name === number`, conservar el nombre humano que ya estaba en memoria.
- Backend NO modificado — `CreateOrUpdateContactService` ya protegía contra el pisado al insertar/actualizar contactos desde mensajes inbound.

### Archivos modificados

- [frontend/src/utils/contactDisplay.ts](../frontend/src/utils/contactDisplay.ts) (NUEVO) — 4 helpers + interface `ContactLike`:
  - `displayContactName(contact)`: prioriza name humano (≥1 letra, distinto del number); si no, devuelve number; nunca string vacío.
  - `displayContactSubtitle(contact)`: devuelve el number solo cuando hay nombre humano distinto (para mostrar como subtítulo en el header).
  - `contactAvatarInitial(contact)`: inicial segura para avatars (evita crashes con `name=undefined`).
  - `mergeContactPreservingName(oldContact, incomingContact)`: el corazón del fix — preserva name humano cuando el incoming viene degradado.
- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx):
  - Líneas 93-99: imports del helper.
  - Líneas 355-398 (`mergeTicketData`): usa `mergeContactPreservingName` para evitar pisado por sockets.
  - Líneas 2515 / 2552: avatar y título de la lista de tickets.
  - Líneas 3107 / 3112: avatar y título del encabezado del chat, con subtítulo dinámico.
  - Línea 3598: prop `contactName` a `MessageInput`.
  - Línea 3695: prop `contactName` a `AcceptTicketModal` (Bug 6).

### Casuística cubierta (matriz)

| Caso | Lista | Header | Socket update | Refetch /tickets/:id |
|------|-------|--------|---------------|----------------------|
| name humano | name | name + number subtitle | merge preserva | merge preserva |
| name vacío/null | number | number | usa name previo si era humano | usa name previo si era humano |
| name === number | number | number | preserva name previo humano | preserva name previo humano |
| Operador renombra contacto explícitamente (PUT) | aplica nuevo nombre | aplica nuevo nombre | aplica nuevo nombre | aplica nuevo nombre |

### Auditoría SQL

```bash
# Contactos en tickets activos con name = number o vacío (legítimos: clientes sin push_name)
PGPASSWORD='ZdG387FhYsm0olSm097541HMSdS=' psql -h localhost -U atendimento -d chateamjr -c \
  "SELECT COUNT(*) AS afectados FROM \"Contacts\" c JOIN \"Tickets\" t ON t.\"contactId\"=c.id WHERE t.status IN ('open','pending') AND (c.name = c.number OR c.name IS NULL OR TRIM(c.name)='');"
```

Al desplegar el fix había **146 contactos** así. NO se modificaron — son clientes legítimos sin push_name de WhatsApp.

### Riesgos residuales

- Los 145 contactos con `name = number` se siguen mostrando como número en lista y header (consistente). No es bug, es comportamiento esperado de clientes sin push_name.
- Cualquier consumidor backend que lea `Contact.name` directo y reciba un valor igual al `number` debe entender el patrón. Usar el helper en TODO el frontend.

---

## 8. Pantalla Contactos sin filtro por conexión WhatsApp

**Fecha:** 2026-05-22
**Severidad:** Media
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Contactos — vista `/contacts`

### Síntomas

- En `/contacts` no había forma de filtrar por conexión WhatsApp.
- El contador de "Total Contactos" se basaba parcialmente en `contacts.length` (no en el `count` real del backend), por lo que mostraba números incorrectos al filtrar.

### Causa raíz

1. `frontend/src/pages/Contacts.tsx` solo enviaba `pageNumber`, `rowsPerPage`, `searchParam`.
2. `services/ContactServices/ListContactsService.ts` tenía comentado el filtro por `whatsappId`.
3. El modelo `Contact` tiene la columna `whatsappId` y relación `Whatsapp`, pero el include no estaba activo en List.

### Archivos modificados

**Backend:**
- [services/ContactServices/ListContactsService.ts](../services/ContactServices/ListContactsService.ts):
  - `Request` interface: + `whatsappId?: number | string`.
  - Bloque nuevo: `const wid = Number(whatsappId); if (!Number.isNaN(wid) && wid > 0) { whereCondition.whatsappId = wid; }`.
  - `findAndCountAll`: `attributes` + `"whatsappId"`; nuevo include `{ model: Whatsapp, as: "whatsapp", attributes: ["id","name"], required: false }`; `distinct: true` para que el `count` sea correcto.
- [controllers/ContactController.ts](../controllers/ContactController.ts):
  - `IndexQuery` + `whatsappId?: string`.
  - `index` destructura y pasa al servicio.

**Frontend:**
- [frontend/src/pages/Contacts.tsx](../frontend/src/pages/Contacts.tsx):
  - Tipo `WhatsappLite { id, name }` y `Contact` con `whatsappId?` y `whatsapp?: WhatsappLite | null`.
  - Estados `whatsapps`, `whatsappFilter`.
  - `useEffect` para `GET /whatsapp/` al montar.
  - `useEffect` reset `pageNumber=1` al cambiar `whatsappFilter`.
  - `fetchContacts` envía `params.whatsappId` cuando filtro activo.
  - UI: `Select` MUI Joy con opción "Todas las conexiones".
  - Tabla: columna nueva "Conexión" con `Chip` (`contact.whatsapp.name`).
  - Empty state contextual cuando filtro activo.

### Distribución de contactos por conexión (sanity check)

```bash
PGPASSWORD='ZdG387FhYsm0olSm097541HMSdS=' psql -h localhost -U atendimento -d chateamjr -c \
  "SELECT \"whatsappId\", COUNT(*) FROM \"Contacts\" WHERE \"whatsappId\" IS NOT NULL GROUP BY \"whatsappId\" ORDER BY COUNT(*) DESC LIMIT 10;"
```

Top 10 al desplegar: `14:707, 22:424, 12:293, 25:232, 13:62, 32:59, 30:57, 10:56, 33:25, 15:24` — más de 1900 contactos vinculados a conexión.

### Riesgos residuales

- Contactos legacy con `whatsappId = NULL` no aparecen al filtrar por una conexión específica (esperado). En la tabla muestran "—" en la columna Conexión.
- `GET /whatsapp/` devuelve todas las conexiones (incluyendo desconectadas/MIGRATED). Se decidió no filtrar por status para no esconder contactos históricos de conexiones inactivas.
- El include es `LEFT JOIN` con solo `["id","name"]` y `distinct: true` → impacto mínimo en performance.
- Stats secundarios `individuals`/`groups`/`botDisabled` siguen leyendo de `contacts.length` filtrado por página. Comportamiento preexistente; afecta solo la vista actual.

---

## 9. Modal de mensaje programado no precarga contacto, conexión ni fecha

**Fecha:** 2026-05-22
**Severidad:** Baja-Media
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Chat — `MessageInput` modal de programación

### Síntomas

Al abrir el modal de "Mensaje programado" desde el chat:
- La fecha aparecía vacía (`sendAt: ''`).
- La conexión a veces NO aparecía seleccionada aunque `selectedTicket.whatsappId` existiera.
- Si las opciones del Select cargaban async, el `value` se seteaba antes y MUI Joy no encontraba match → quedaba en blanco.

El operador tenía que re-seleccionar todo manualmente.

### Causa raíz

1. `Tickets.tsx:3511` pasaba `whatsappId={selectedTicket.whatsappId}` sin fallback al objeto `whatsapp` cargado.
2. `MessageInput` inicializaba `scheduleForm.sendAt = ''`.
3. No había efecto reactivo para re-aplicar el `whatsappId` cuando las opciones del Select llegaban después.

### Archivos modificados

- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx):3600-3601 — `whatsappId={selectedTicket.whatsappId ?? selectedTicket.whatsapp?.id}` + nuevo prop `whatsappName={selectedTicket.whatsapp?.name}`.
- [frontend/src/components/MessageInput/index.tsx](../frontend/src/components/MessageInput/index.tsx):
  - L97-105: prop opcional `whatsappName?: string` + helper `buildDefaultSendAt(minutesAhead)` que genera `YYYY-MM-DDTHH:mm` local.
  - L122: destructuring de `whatsappName`.
  - L169: nueva ref `scheduleBodyRef` para foco automático.
  - L255: `sendAt: buildDefaultSendAt(15)` (15 min en el futuro).
  - L288-298: `useEffect` reactivo que reaplica `whatsappId` cuando `scheduleWhatsapps` carga tarde.
  - L502-509: `handleOpenScheduleModal` con `setTimeout(80ms) → focus()`.
  - L516-527: validación `sendAtDate <= Date.now()` → toast "La fecha debe ser futura".
  - L549-551: conversión a ISO con `new Date(scheduleForm.sendAt).toISOString()` antes del POST.
  - L987-994: título dinámico "Programar mensaje para {contactName}" + subtítulo "Conexión: {whatsappName}".
  - L1003: `Textarea` con ref para autofoco.

### Casos cubiertos

- Ticket con `whatsappId` directo → modal abre con conexión seleccionada y `sendAt = ahora + 15 min`.
- Ticket con `whatsappId=null` pero `whatsapp.id` presente → fallback recupera el id.
- Fecha pasada manual → validación rechaza con toast claro.
- Opciones de conexión llegan después → `useEffect` re-aplica `whatsappId` cuando aparecen en la lista.

### Formato enviado al backend

ISO 8601 UTC: `"2026-05-22T18:45:00.000Z"`. `services/ScheduleServices/CreateService.ts:46` acepta cualquier string parseable por `new Date()`.

### Riesgos residuales

- Si el navegador del operador tiene zona horaria mal configurada, la conversión a ISO puede diferir. Mitigado: el input es `datetime-local` que el usuario ve en su hora local; la conversión es consistente.
- El `useEffect` que abre el modal incluye `message` como dependencia (preexistente). Si el usuario abre el modal y luego escribe en el textarea principal del chat, podría re-resetear el form. No introducido por este fix; se documenta para futura limpieza.

---

## 10. Enlaces dentro de mensajes salientes no se leen (azul sobre turquesa)

**Fecha:** 2026-05-22
**Severidad:** Baja (UX)
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Chat — render de mensajes

### Síntomas

Cuando un mensaje saliente contenía una URL (o texto que el parser linkificaba), el enlace se renderizaba en `primary.500` (azul oscuro) sobre el fondo turquesa de los mensajes propios. El contraste era prácticamente nulo y el texto quedaba ilegible. En mensajes entrantes (fondo blanco) el azul se veía bien.

Visualmente confirmado por captura del usuario: enlaces "APP CON Notificaciones Push / IOS / ANDROID" en azul casi indistinguibles del fondo turquesa de la burbuja.

### Causa raíz

`frontend/src/utils/formatWhatsAppText.tsx:118` tenía el color del enlace **hardcodeado a `primary.500`** sin contexto de la burbuja en la que se renderiza. El helper no recibía información de si el mensaje era propio (`isOwn`).

### Archivos modificados

- [frontend/src/utils/formatWhatsAppText.tsx](../frontend/src/utils/formatWhatsAppText.tsx)
  - Firma extendida: nuevo 3er parámetro opcional `isOwn?: boolean`.
  - Render de URL: color condicional `isOwn ? '#FFFFFF' : 'primary.500'`, con `textDecorationColor` ajustado y estados `:hover` / `:visited` también condicionales para que el blanco se conserve siempre que el fondo sea de color.
- [frontend/src/components/Messages/MessageContent.tsx](../frontend/src/components/Messages/MessageContent.tsx) — 2 llamadas a `formatWhatsAppText(textContent, searchTerm, isOwn)` + paso de `isOwn` a `<MediaImage>`.
- [frontend/src/components/Messages/MediaImage.tsx](../frontend/src/components/Messages/MediaImage.tsx) — prop nueva `isOwn?: boolean` y se reenvía a `formatWhatsAppText(caption, undefined, isOwn)` para que los enlaces dentro del caption de una imagen también respeten el contraste.

### Resultado

| Tipo de burbuja | Fondo | Color del enlace antes | Color del enlace después |
|-----------------|-------|------------------------|--------------------------|
| Saliente (propio) | turquesa | `primary.500` (azul oscuro, ilegible) | `#FFFFFF` blanco subrayado |
| Entrante | blanco/gris | `primary.500` (legible) | `primary.500` (sin cambio) |
| Dark mode saliente | gris oscuro Meta | `primary.500` | `#FFFFFF` |
| Dark mode entrante | gris oscuro | `primary.500` | `primary.500` |

### Compatibilidad

- El 3er parámetro es **opcional** — todas las llamadas previas sin `isOwn` siguen funcionando (mismo color azul de antes).
- Solo 3 callsites en todo el frontend, todos actualizados.

### Riesgos residuales

- Si en el futuro se cambia el color de fondo de los mensajes propios a algo claro, el blanco quedará sin contraste. El fix asume que `outgoing.background*` sigue siendo un color saturado.
- Cualquier nuevo componente que use `formatWhatsAppText` debe pasar `isOwn` cuando se renderice dentro de una burbuja propia.

---

## 11. Modal "Transferir Ticket" buscaba contactos en vez de usuarios/agentes

**Fecha:** 2026-05-22
**Severidad:** Media (semántica/UX)
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Tickets — flujo "Transferir ticket"

### Síntomas

El menú "Transferir ticket" abría un modal con buscador "Buscar contacto" que listaba contactos de la libreta y reasignaba el ticket al `contactId` seleccionado (cambiaba el cliente del ticket). El comportamiento esperado por el operador era **reasignar el ticket a otro agente/usuario** (cambiar `ticket.userId`), no cambiar el contacto.

### Causa raíz

- `frontend/src/pages/Tickets.tsx`:
  - Estado `searchContact`/`selectedContact` con búsqueda contra `GET /contacts`.
  - `handleTransferTicket` enviaba `PUT /tickets/:id` con payload `{ newContactId, userId: currentUser.id }` — eso cambia el `contactId` del ticket, no transfiere a otro agente.
  - Etiquetas UI: "Selecciona el nuevo contacto para este ticket. El ticket se asociará al contacto seleccionado."

### Decisión arquitectónica

El modal ahora busca **usuarios** y envía `PUT /tickets/:id` con `{ userId: selectedUser.id, status, queueId? }`. La intención semántica de "Transferir Ticket" en CRMs estándar es **reasignar a otro agente**, no editar el cliente.

### Archivos modificados

- [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx)
  - L329-336: estados renombrados — `searchContact → searchUserQuery`, `selectedContact → selectedUser`, `searchingContacts → searchingUsers`.
  - L482-499: `handleSearchUser` consume `GET /users` con `searchParam` (el endpoint ya estaba implementado en `routes/userRoutes.ts:12`).
  - L502-532: `handleTransferTicket` envía `PUT /tickets/:id` con `{ userId, status, queueId? }`. Status: si era `pending` → pasa a `open` (transferir implica asignar). Preserva `queueId` actual del ticket.
  - L3839-3929: rewrite del JSX del modal — label "Buscar usuario", placeholder "Escribe el nombre o email del agente...", chip de previsualización con email del usuario seleccionado, mensajes y manejo de error con `error.response?.data?.error`.

### Endpoint utilizado

```
GET /users?searchParam=<query>&pageNumber=1
```

Respuesta esperada: `{ users: User[], count, hasMore }`. El `ListUsersService` ya filtra por `companyId` del usuario autenticado.

### Compatibilidad

- **No cambia** la firma del backend ni el endpoint `PUT /tickets/:id`.
- **No afecta** el modal de "Aceptar ticket" (Bug 6) ni el flujo de cambio de cola desde ContactDrawer.
- El menú contextual del ticket (`ticketMoreMenu`) sigue mostrando la opción "Transferir ticket" con el mismo trigger.

### Riesgos residuales

- Si una empresa esperaba el comportamiento antiguo (cambiar el contacto del ticket), perdió esa funcionalidad. Mitigación: usar el ContactDrawer para editar el contacto si se quiere reasignar a otra persona física; o restaurar el flujo bajo un setting opcional `transferModalMode = 'user' | 'contact'`.

### Fix 2026-05-22 — Transferir no debe cambiar `status` ni pedir cola

Reportado por el usuario: "¿por qué al transferir el ticket a otro usuario pide que asigne otra cola?".

**Causa:** la primera versión de `handleTransferTicket` enviaba `status: selectedTicket.status === 'pending' ? 'open' : selectedTicket.status` — al convertir `pending → open` se disparaba la validación del Bug 6 (`isAcceptingFromPending`). Si el ticket no tenía cola, el backend rechazaba (cuando el setting estaba activo) o emitía warnings ruidosos en logs.

**Cambio aplicado** en [frontend/src/pages/Tickets.tsx](../frontend/src/pages/Tickets.tsx) `handleTransferTicket`:

```ts
const payload: { userId: number; status: string; queueId?: number } = {
  userId: selectedUser.id,
  status: selectedTicket.status, // ← se conserva tal cual; transferir NO acepta
}
if (selectedTicket.queueId) {
  payload.queueId = selectedTicket.queueId
}
```

**Semántica resultante:**
- Transferir un ticket `pending` → sigue `pending`, con nuevo `userId`. El nuevo agente lo verá en su bandeja de pendientes y lo aceptará cuando esté listo (recién ahí se valida cola si el setting está activo).
- Transferir un ticket `open` → sigue `open` con nuevo `userId` y misma cola.
- Nunca se borra `queueId`; se preserva el actual.

---

## 12. El input de mensaje pierde el foco después de enviar — flujo no fluido

**Fecha:** 2026-05-22
**Severidad:** Media (UX continua)
**Reportado por:** sistemasorbi@gmail.com
**Módulo afectado:** Chat — `MessageInput`

### Síntomas

Al enviar un mensaje (Enter o botón Send), el cursor desaparecía del textarea. Para escribir el siguiente mensaje el operador debía volver a hacer clic en el campo. En conversaciones rápidas esto fragmentaba el flujo y obligaba a re-clickear constantemente.

### Causa raíz

`frontend/src/components/MessageInput/index.tsx:172` definía:
```ts
const isDisabled = loading || (ticketStatus !== 'open' && ticketStatus !== 'group')
```

Como `loading=true` durante el envío y el `Textarea` tenía `disabled={isDisabled}`, el navegador hacía `blur()` automático del textarea al pasar a disabled. Cuando `loading` volvía a `false`, el textarea se rehabilitaba pero el foco no se restauraba (comportamiento HTML estándar).

Adicionalmente, `setMessage('')` se ejecutaba **después** del `await api.post(...)`, por lo que el operador veía el mensaje en el campo hasta que la red respondía (típicamente 200-800 ms).

### Decisión arquitectónica

**Optimistic UI** con foco persistente:

1. `isDisabled` ya **no** incluye `loading`. Solo bloquea el textarea cuando el ticket no está abierto/grupo.
2. Al enviar:
   - Capturar el contenido en variables locales.
   - **Limpiar el input inmediatamente** (`setMessage('')`, `setSelectedFiles([])`, `setSelectedQuickMessage(null)`, `onCancelReply()`).
   - Restaurar foco con `setTimeout(() => inputRef.current?.focus(), 0)` en el siguiente tick del render.
   - Recién entonces `setLoading(true)` (solo para deshabilitar el botón Send y evitar doble click/doble Enter).
3. En el `finally`, otro `inputRef.current?.focus()` como red de seguridad.
4. Si el envío falla, **rollback no destructivo**: restaurar `messageToSend` solo si el textarea sigue vacío (no se pisa lo que el operador empezó a escribir mientras tanto). Toast de error visible.

### Archivos modificados

- [frontend/src/components/MessageInput/index.tsx](../frontend/src/components/MessageInput/index.tsx)
  - L172-177: `isDisabled` ya no contiene `loading`; comentario explicando por qué.
  - L331-393: `handleSendMessage` reescrito a Optimistic UI con rollback no destructivo + `toast.error(...)` en fallo + `inputRef.current?.focus()` en 2 puntos.

### Garantías de seguridad

- **Sin doble envío**: el botón Send sigue con `disabled={loading || isDisabled}` (L997) y el `handleKeyPress` con `if (!loading && !isDisabled)` (L410). Si el usuario aprieta Enter dos veces antes de que la primera respuesta llegue, la segunda se ignora.
- **Si el envío falla**, el mensaje original se restaura solo si el operador no escribió nada nuevo en el ínterin. Si escribió, se conserva su input y se muestra un toast claro.
- **Archivos adjuntos**: si el envío falla y había archivos, se devuelven al estado para que el operador reintente sin tener que volver a adjuntar.

### Resultado UX

| Acción | Antes | Después |
|--------|-------|---------|
| Enviar texto con Enter | Cursor desaparece, click manual para seguir | Cursor se queda, escribe siguiente inmediato |
| Enviar varios mensajes rápidos | Loading bloquea textarea | Sin bloqueo, sensación de "chat fluido" |
| Falla de red | Mensaje sale del campo y se pierde | Toast error + restauración no destructiva |
| Botón Send durante envío | Bloqueado (OK, sin cambio) | Bloqueado (OK, sin cambio) |

### Riesgos residuales

- Si la red es muy lenta y el usuario manda 10 mensajes seguidos, todos se ven "enviados" inmediatamente en el input pero llegan al backend secuencialmente. El servidor maneja la cola (Bull). En la práctica no causa problemas porque cada `api.post` espera el anterior implícitamente.
- Los botones secundarios (adjuntar, emoji, mic, quick messages) ahora también permanecen activos durante el envío (porque dependían de `isDisabled`). Esto es **mejora intencional**: el operador puede preparar el siguiente mensaje mientras se envía el actual.

---

## Apéndice — Reglas inamovibles a respetar en TODA reparación

Establecidas en `~/.claude/CLAUDE.md` el 2026-03-02. INAMOVIBLES. IRREVERSIBLES. SIN EXCEPCIONES.

**PROHIBIDO TERMINANTEMENTE:**
1. `DELETE` / `DROP` / `TRUNCATE` en tablas o datos de BD.
2. Borrar archivos de código en producción (servicios, controllers, rutas, páginas, modelos).
3. Borrar endpoints activos que frontend o integraciones consumen.
4. `git checkout -- .` / `git reset --hard` / `git push --force`.
5. `pm2 delete` sin reemplazar / `FLUSHALL` en Redis.
6. `DROP COLUMN` en tablas existentes.
7. Borrar CronJobs (solo pausar con `isActive=false`).

**SOLO se permite:** `INSERT`, `UPDATE`, `CREATE`, `ADD COLUMN`, soft delete (`status→inactive`).

**Borrar claves Redis específicas por patrón (no FLUSHALL) SÍ está permitido** — el bug #3 lo aplica para purgar `sessions:<id>:*` sin afectar otras sesiones.

---

## Plantilla para nuevas entradas

```markdown
## N. Título descriptivo del bug

**Fecha:** YYYY-MM-DD
**Severidad:** Crítica | Alta | Media | Baja
**Reportado por:** email/usuario
**Conexión/módulo afectado:** descripción

### Síntomas
- ...

### Causa raíz
...

### Archivos modificados
- [path/al/archivo.ts](../path/al/archivo.ts) — descripción del cambio

### Mitigación SQL inmediata (si aplica)
```sql
-- comandos
```

### Verificación post-fix
```bash
# comandos para verificar
```

### Riesgos residuales
- ...
```
