# Sistema de Coexistencia Meta + Baileys — ChatEAM JR

> **Fecha**: 2026-06-18 | **Version**: 1.1

---

## Que es la Coexistencia

Permite que una misma conexion WhatsApp funcione simultaneamente con **Meta Cloud API** (webhooks oficiales) y **Baileys** (WhatsApp Web). El usuario configura desde el panel:

- **De donde recibir mensajes**: Meta / Baileys / Ambos
- **Por donde enviar respuestas**: Meta / Baileys
- **Que conexion Baileys usar** para enviar (si aplica)

---

## Flujo General

```
                    RECEPCION DE MENSAJES
                    =====================

  Cliente escribe       Staff escribe desde
  al numero             WA Business App (movil)
       |                        |
       v                        v
  Meta Cloud API          Meta Cloud API
  field: "messages"       field: "smb_message_echoes"
       |                        |
       v                        v
  POST /webhook/metaws    POST /webhook/metaws
       |                        |
       v                        v
  MetaWebhookController.receiveMetaWebhook()
       |
       v
  handleMetaWebhookMessage(body)
       |
       +-- change.field === "smb_message_echoes"
       |        |
       |        v
       |   handleSmbMessageEchoes()     <-- NUEVO: ahora se invoca
       |        |
       |        v
       |   Crea ticket + mensaje (fromMe: true)
       |   sourceChannel: "business_app"
       |
       +-- change.field === "smb_app_state_sync"
       |        |
       |        v
       |   handleSmbAppStateSync()      <-- NUEVO: ahora se invoca
       |        |
       |        v
       |   Sincroniza contactos
       |
       +-- change.field === "messages"
                |
                v
           Flujo existente:
           1. Buscar conexion Meta por phoneNumberId
           2. NUEVO: Resolver routing coexistencia
           3. Crear contacto
           4. Crear ticket
           5. Guardar mensaje
           6. SupervisorAI / FlowBuilder (si aplica)
```

---

## Routing de Coexistencia (NUEVO)

Despues de encontrar la conexion Meta, el sistema verifica la configuracion:

```
  Conexion Meta encontrada (phoneNumberId)
       |
       v
  coexistenceEnabled === true ?
       |
   NO -+-> Flujo normal: ticket.channel = "meta"
       |
   SI -+-> Verificar sendChannel
             |
             +-- sendChannel === "meta"
             |     -> ticket.channel = "meta"
             |     -> respuestas salen por Meta Cloud API
             |
             +-- sendChannel === "baileys"
                   |
                   v
                   linkedWhatsappId existe?
                   |
                NO +-> Fallback: ticket.channel = "meta"
                   |
                SI +-> Buscar conexion Baileys por ID
                        |
                        v
                        Baileys CONNECTED?
                        |
                     NO +-> Fallback: ticket.channel = "meta"
                        |
                     SI +-> effectiveWhatsapp = Baileys
                            effectiveChannel = "whatsapp"
                            -> ticket.channel = "whatsapp"
                            -> ticket.whatsappId = Baileys.id
                            -> respuestas salen por Baileys
```

---

## Flujo de Respuesta (MessageController)

```
  Agente responde desde el frontend
       |
       v
  MessageController.store()
       |
       v
  ticket.channel === ?
       |
       +-- "whatsapp" -> GetTicketWbot(ticket) -> Baileys envia
       |
       +-- "meta"     -> metaSendTextDynamic() -> Meta API envia
```

**Clave**: Al crear el ticket con `channel = "whatsapp"` y `whatsappId` de Baileys, el MessageController automaticamente envia por Baileys sin necesidad de modificarlo.

---

## Respuestas Automaticas (SupervisorAI)

Cuando la IA responde automaticamente, usa el helper `sendByConfiguredChannel()`:

```
  SupervisorAI genera respuesta
       |
       v
  sendByConfiguredChannel(mensaje, ticket, contactNumber)
       |
       v
  effectiveChannel === "whatsapp" ?
       |
   SI -+-> Enviar por Baileys (GetWhatsappWbot + SendWhatsAppMessage)
       |     |
       |     +-- Error? -> Fallback automatico a Meta API
       |
   NO -+-> Enviar por Meta API (sendTextDynamic)
```

---

## Campos de BD (Tabla Whatsapps)

### Campos existentes de coexistencia
| Campo | Tipo | Descripcion |
|-------|------|-------------|
| `coexistenceEnabled` | BOOLEAN | Coexistencia activa o no |
| `coexistenceStatus` | STRING(50) | active / disabled / pending_sync / syncing |
| `coexistenceOnboardedAt` | DATE | Fecha de activacion |
| `lastAppOpenedAt` | DATE | Ultima vez que se abrio WA Business App |
| `embeddedSignupSessionId` | STRING(255) | Session ID del Embedded Signup |

### Campos nuevos de routing
| Campo | Tipo | Default | Valores | Descripcion |
|-------|------|---------|---------|-------------|
| `receiveChannel` | STRING(20) | `both` | meta / baileys / both | De donde aceptar mensajes entrantes |
| `sendChannel` | STRING(20) | `baileys` | meta / baileys | Por donde enviar respuestas |
| `linkedWhatsappId` | INTEGER | NULL | ID de Whatsapp | FK a la conexion Baileys vinculada |

---

## Endpoints API

### Nuevos
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `PUT` | `/whatsapp/coexistence/:id/config` | Actualizar configuracion de coexistencia |
| `GET` | `/whatsapp/coexistence/baileys-connections` | Listar conexiones Baileys de la company |

### PUT /whatsapp/coexistence/:id/config
```json
// Request Body
{
  "coexistenceEnabled": true,
  "receiveChannel": "both",
  "sendChannel": "meta",
  "linkedWhatsappId": 4
}

// Response
{
  "success": true,
  "message": "Configuracion de coexistencia actualizada",
  "data": {
    "id": 10,
    "name": "nominapp",
    "coexistenceEnabled": true,
    "receiveChannel": "both",
    "sendChannel": "meta",
    "linkedWhatsappId": 4
  }
}
```

### GET /whatsapp/coexistence/baileys-connections
```json
// Response
{
  "success": true,
  "data": [
    { "id": 4, "name": "fgaca", "number": "", "status": "qrcode", "provider": "beta" },
    { "id": 6, "name": "aria", "number": "", "status": "qrcode", "provider": "beta" }
  ]
}
```

### Existentes (sin cambios)
| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| `GET` | `/whatsapp/coexistence/status` | Estado conexiones + alertas (ahora incluye receiveChannel, sendChannel, linkedWhatsappId) |
| `GET` | `/whatsapp/coexistence/app-status` | Estado rapido App Meta |
| `POST` | `/whatsapp/coexistence/setup` | Setup automatico webhooks |

---

## Frontend

### CoexistenceDashboard.tsx (modificado)

Tabla con columnas nuevas:

```
┌────┬──────────┬─────────────┬────────┬──────────────┬─────────┬─────────┬──────────────┬───┐
│ ID │ Nombre   │ Numero      │ Estado │ Coexistencia │ Recibir │ Enviar  │ Business App │   │
├────┼──────────┼─────────────┼────────┼──────────────┼─────────┼─────────┼──────────────┼───┤
│ 10 │ nominapp │ 593939...   │ ●Conec │ ●Activa      │ Ambos   │ Meta API│ Hoy          │ ⚙ │
└────┴──────────┴─────────────┴────────┴──────────────┴─────────┴─────────┴──────────────┴───┘
                                                        ↑ Chip     ↑ Chip                  ↑
                                                        azul       verde                 boton
                                                                                        config
```

### CoexistenceConfigModal.tsx (nuevo)

Modal con:
- Switch "Coexistencia activa"
- Select "Recibir mensajes desde": Meta / Baileys / Ambos
- Select "Enviar respuestas por": Meta / Baileys
- Select "Conexion Baileys vinculada": dropdown dinamico
- Alerta si Baileys no esta CONNECTED
- Info sobre fallback automatico

---

## Archivos Modificados/Creados

| # | Archivo | Accion |
|---|---------|--------|
| 1 | `models/Whatsapp.ts` | +3 campos: receiveChannel, sendChannel, linkedWhatsappId |
| 2 | `services/MetaServices/metaMessageListener.ts` | +imports coexistencia, +switch field, +routing, +helper sendByConfiguredChannel, -3 sendTextDynamic en SupervisorAI |
| 3 | `services/MetaServices/metaSmbMessageEchoesService.ts` | +routing con effectiveWhatsapp/effectiveChannel |
| 4 | `controllers/WhatsAppCoexistenceController.ts` | +2 endpoints (updateConfig, listBaileysConnections), +campos en getStatus |
| 5 | `routes/whatsappCoexistenceRoutes.ts` | +2 rutas PUT y GET |
| 6 | `frontend/src/pages/CoexistenceDashboard.tsx` | +3 columnas tabla, +modal config, +import |
| 7 | `frontend/src/components/CoexistenceConfigModal.tsx` | **NUEVO** — Modal configuracion |

---

## Problemas Resueltos

### 1. phoneNumberId no registrado
```
ANTES: BD tenia phoneNumberId = 976541742207141 (incorrecto)
AHORA: BD tiene phoneNumberId = 559437948576881 (correcto, el que Meta envia)
```

### 2. message_echoes ignorados
```
ANTES: metaMessageListener.ts linea 702:
  if (change?.field !== "messages") continue;  // Descarta smb_message_echoes

AHORA: Switch que procesa smb_message_echoes y smb_app_state_sync
  antes del filtro de "messages"
```

### 3. Handlers desconectados
```
ANTES: handleSmbMessageEchoes() existia pero NUNCA se invocaba
AHORA: Se importa y se llama cuando field === "smb_message_echoes"
```

### 4. Sin configuracion de canal
```
ANTES: Todo forzado a channel="meta" sin opcion de cambiar
AHORA: Configurable desde el frontend (receiveChannel + sendChannel)
```

---

## Verificacion

| # | Test | Comando / Accion |
|---|------|-----------------|
| 1 | message_echoes crea ticket | Enviar msj desde WA Business movil, buscar `[SmbEchoes]` en logs |
| 2 | phoneNumberId resuelto | No mas error `Conexion META no encontrada para 559437948576881` |
| 3 | Modal funciona | Ir a /coexistence -> click ⚙ en una conexion -> cambiar config |
| 4 | Routing Baileys | Config sendChannel=baileys + linkedWhatsappId -> responder ticket |
| 5 | Fallback automatico | Si Baileys cae, respuesta sale por Meta API |

```bash
# Ver logs de coexistencia
pm2 logs 1 --lines 100 --nostream | grep -E "SmbEchoes|META-COEX|smb_message"

# Verificar BD
psql -c "SELECT id, name, \"phoneNumberId\", \"coexistenceEnabled\", \"receiveChannel\", \"sendChannel\" FROM \"Whatsapps\" WHERE id = 10;"
```

---

## Consideraciones

- **BD SAGRADA**: No se elimino ni modifico ningun dato existente, solo UPDATE y ADD COLUMN
- **Retrocompatible**: Conexiones sin coexistencia siguen funcionando igual
- **Fallback**: Si Baileys falla, automaticamente envia por Meta API
- **Liveness**: Meta requiere abrir WA Business App cada 14 dias (CronJob existente verifica)
- **Deduplicacion**: handleSmbMessageEchoes evita duplicados por wid

---

## Ticket Canónico Único (v1.1 — 2026-06-18)

> Meta y Baileys son **dos transportes del MISMO WhatsApp** cuando están en
> coexistencia. Para el negocio es **una sola conversación** con el mismo
> cliente y el mismo número. Por tanto debe existir **un solo ticket canónico**
> por (cliente + número), aunque cambie el transporte activo.

### Principios

1. **Una conversación unificada** (`UnifiedConversation`, por `companyId + canonicalNumber`)
   puede tener varios bindings (Meta y Baileys) pero **un solo ticket abierto canónico**.
2. El ticket canónico vive en el **transporte activo** (owner): Meta o Baileys.
   - `Ticket.whatsappId` → conexión dueña del transporte activo.
   - `Ticket.channel` → `'meta'` | `'whatsapp'`.
   - `Ticket.conversationId` → identidad lógica estable entre transportes.
3. Los mensajes guardan **su origen real** en `Message.sourceChannel`
   (`cloud_api` | `business_app` | `history_import` | `baileys`), pero **nunca**
   abren un segundo ticket para la misma conversación.

### Servicio central — `CoexistenceTicketRoutingService`

Fuente ÚNICA de verdad de coexistencia (facade que reutiliza `ConversationResolverService`,
`OutboundRoutingService` y `FindOrCreateTicketService`):

| Helper | Responsabilidad |
|--------|-----------------|
| `resolveCoexistencePair(seed)` | Encuentra la conexión hermana en **ambos sentidos** (Meta↔Baileys por `linkedWhatsappId`, vínculo inverso, o mismo número). |
| `isCoexistenceSibling(a, b)` | ¿Son a y b transportes del mismo WhatsApp? |
| `resolveTicketOwner(...)` | Decide qué conexión debe ser dueña del ticket (Meta principal por defecto). |
| `shouldDropProviderEvent(...)` | ¿Ignorar un evento Meta/Baileys para no duplicar? (según `receiveChannel`/`sendChannel`). |
| `resolveOrCreateCanonicalTicket(...)` | Resuelve `conversationId` + crea/reutiliza el ticket canónico. |
| `findEquivalentOutboundMessage(...)` | Dedup cross-provider: `meta_echo` vs `baileys_fromme`. |
| `switchTicketOwner(ticketId, provider)` | Cambia el owner real (whatsappId + channel + routingPolicy + socket). |

### Canal activo del ticket y filtros visuales

- En la bandeja hay **filtros por canal** (Todos / WhatsApp(Baileys) / Meta /
  Facebook / Instagram / Telegram). Filtran por **canal activo** (`Ticket.channel`),
  **no** crean conversaciones separadas.
- El selector de canal (`RoutingPolicySelector`) al elegir **Forzar Meta** o
  **Forzar Baileys** llama a `POST /coexistence/tickets/:id/switch-owner`, que
  **cambia el owner real** del ticket (un solo ticket canónico) y emite socket.
- `MetaWindowIndicator` muestra la **ventana Meta 24h** y permite pasar a Baileys.

### Política Meta 24h + fallback Baileys

- Outbound manual pasa por el router central (`CoexistenceOutboundRouterService` →
  `OutboundDispatchService` → `OutboundRoutingService`).
- Modos: `auto` | `force_meta` | `force_baileys` | `sticky_inbound` |
  `meta_first_baileys_after_23h`. En coexistencia **Meta es principal** por defecto
  (`sendChannel = 'meta'`); si la ventana 24h está cerca/cerrada (≥23h) o Meta falla,
  se aplica **fallback a Baileys** marcando `fallbackApplied=true`.
- **Un solo intento lógico**: nunca se envía el mismo mensaje por Meta **y** Baileys
  como intentos independientes. El fallback en `helpers/SendMessage.ts` (flujos
  programados/recordatorios/seguimientos) sólo usa Baileys **después** de que Meta
  falla.

### Cómo se evitan mensajes/tickets dobles

- **`smb_message_echoes`** (staff desde WA Business App): ahora resuelve
  `conversationId` y crea/reutiliza el **ticket canónico** (no abre uno nuevo).
  Antes de crear el mensaje, busca un `baileys_fromme` equivalente reciente
  (mismo ticket, body normalizado, ventana 120s); si existe, marca el ledger como
  `dropped` (`cross_provider.baileys_fromme_recent`) y **no duplica**.
- **Dedup `meta_echo` vs `baileys_fromme`**: la deduplicación NO usa el `wid`
  (difiere entre transportes), sino el match por ticket + body normalizado + ventana.
- **Inbound**: `InboundEventLedger` (idempotencia por `eventKey`) + dedup
  cross-provider por body/ventana + reutilización por `conversationId` en
  `FindOrCreateTicketService`.

### Defaults (Meta principal)

- `Whatsapps.sendChannel` default = **`meta`** (modelo + migración
  `20260618000001-align-coexistence-send-channel-default-meta`). El backfill sólo
  toca filas en coexistencia con `sendChannel` NULL (BD SAGRADA: ALTER DEFAULT + UPDATE,
  sin DROP). UI y runtime ahora muestran lo mismo.

### Flujos automáticos (Fase C — 2026-06-18)

Recordatorios de citas (cron) y seguimientos (`OmnichannelDispatcher` / followups)
ahora envían vía **`CoexistenceAwareTextSender.sendTicketText`**:
- Ticket **en coexistencia** → router central (`routeAndSendOutbound`): respeta el
  canal activo/owner, ventana Meta 24h + **fallback Baileys como un solo intento
  lógico**, persiste el Message una vez (dedup por `wid` contra el echo de Baileys,
  igual que el envío manual) y emite socket.
- Ticket **sin coexistencia** → legacy `SendWhatsAppMessage` (comportamiento idéntico).
- El cron de recordatorios **omite** su `CreateMessageService` cuando `viaRouter=true`
  (el router ya persistió) → nunca duplica el mensaje.
- **Nunca** se envía el mismo recordatorio/seguimiento por Meta y Baileys como
  intentos independientes.
