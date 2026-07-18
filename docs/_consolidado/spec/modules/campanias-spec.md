# Spec — Campañas (WhatsApp masivas) · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` real (solo lectura) +
> Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.12, §4.4` + Fase 2 `02-auditoria-tecnica.md`.
> Fecha: 2026-07-12.

## Propósito

Envío masivo de mensajes de WhatsApp a listas de contactos con plantillas, despacho escalonado (anti-baneo)
vía cola Bull, y seguimiento de estado por mensaje (enviado/entregado/leído/fallido). Incluye ajustes de
campaña, mensajes de campaña con seguimiento comercial e importación de ventas desde Excel. Es el motor de
marketing saliente del CRM; hoy con bloqueadores P0 que lo dejan inoperativo en producción.

## Actores y capacidades

- **El usuario puede** listar, ver, crear, editar y eliminar campañas
  (`GET /campaigns`, `/campaigns/list`, `/campaigns/:id`; `POST /campaigns`; `PUT /campaigns/:id`;
  `DELETE /campaigns/:id`).
- **El usuario puede** cancelar y reiniciar una campaña (`POST /campaigns/:id/cancel`, `/campaigns/:id/restart`).
- **El usuario puede** subir/eliminar media de la campaña (`POST/DELETE /campaigns/:id/media-upload`).
- **El usuario puede** definir ajustes de campaña (`GET/POST /campaign-settings`).
- **El usuario puede** crear/listar mensajes de campaña, ver conteos por estado, importar ventas desde Excel
  y anotar conversiones (`/campaign-messages`, `/campaign-messages/counts`, `/campaign-messages/import-sales`).
- **El sistema permite** encolar el despacho en la cola Bull `CampaignQueue` al crear/actualizar/reiniciar
  (`controllers/CampaignController.ts:274,309`).
- **El sistema permite** procesar el envío escalonado en el worker (`worker.ts` consumiendo `CampaignQueue`,
  `queues.ts:66,310`).

## Rutas/Controladores (evidencia) y modelo de datos

Montaje `routes/index.ts:507` (campaigns), `:508` (settings), `:316` (messages). Todas con `isAuth`
(multi-tenant por `companyId`). Controladores: `CampaignController`, `CampaignSettingController`,
`CampaignMessageController`.

| Método | Ruta | Handler | Evidencia |
|---|---|---|---|
| GET | `/campaigns/list` | `CampaignController.findList` | `routes/campaignRoutes.ts:12`, `controllers/CampaignController.ts:332` |
| GET | `/campaigns` | `CampaignController.index` | `routes/campaignRoutes.ts:13`, `controllers/CampaignController.ts:70` |
| GET | `/campaigns/:id` | `CampaignController.show` | `routes/campaignRoutes.ts:14` |
| POST | `/campaigns` | `CampaignController.store` (encola) | `routes/campaignRoutes.ts:15`, `controllers/CampaignController.ts:86` |
| PUT | `/campaigns/:id` | `CampaignController.update` (encola `CampaignQueue`) | `routes/campaignRoutes.ts:16`, `controllers/CampaignController.ts:274` |
| DELETE | `/campaigns/:id` | `CampaignController.remove` | `routes/campaignRoutes.ts:17` |
| POST | `/campaigns/:id/cancel` | `CampaignController.cancel` | `routes/campaignRoutes.ts:18`, `controllers/CampaignController.ts:285` |
| POST | `/campaigns/:id/restart` | `CampaignController.restart` (encola) | `routes/campaignRoutes.ts:19`, `controllers/CampaignController.ts:309` |
| POST/DELETE | `/campaigns/:id/media-upload` | `mediaUpload`/`deleteMedia` | `routes/campaignRoutes.ts:20-21` |
| GET/POST | `/campaign-settings` | `CampaignSettingController.index/store` | `routes/campaignSettingRoutes.ts:12,14` |
| POST | `/campaign-messages/import-sales` | `CampaignMessageController.importSales` (Excel) | `routes/campaignMessageRoutes.ts:12` |
| POST/GET | `/campaign-messages` | `create`/`index` | `routes/campaignMessageRoutes.ts:20,27` |
| GET | `/campaign-messages/counts` | `counts` (por estado) | `routes/campaignMessageRoutes.ts:35` |
| GET | `/campaign-messages/ticket/:ticketId`, `/:id` | `listByTicket`, `show` | `routes/campaignMessageRoutes.ts:42,49` |
| PUT | `/campaign-messages/:id` | `update` (conversionNote) | `routes/campaignMessageRoutes.ts:56` |

**Modelo de datos (tablas):**
- `Campaigns` (`models/Campaign.ts:23`, **0 filas en producción** — dato llamativo, Fase 1 §3.12): `name`,
  `message1..5`, `confirmationMessage1..`, `status` (default `"INATIVA"`), `scheduledAt`, `completedAt`,
  contactListId/whatsappId, `mediaPath`/`mediaName`.
- `CampaignMessages` (`models/CampaignMessage.ts`, **3.650 filas** — el flujo real de envío parece no pasar
  por `Campaigns`, Fase 1 §3.12).
- `CampaignShippings` (`models/CampaignShipping.ts`), `CampaignSetting`, `CampaignRule`/`CampaignRuleLog`,
  `CampaignAlert`, `CampaignRecommendation`.

## Flujos clave

**Happy path (según diseño):**
1. El usuario crea la lista de contactos y selecciona plantilla aprobada.
2. `POST /campaigns` → `store` persiste `Campaign` y la encola en `CampaignQueue` (Bull).
3. El worker procesa `CampaignQueue` y despacha mensajes escalonados (anti-baneo).
4. El progreso se ve en `/campaigns` + `/campaign-messages/counts` (enviado/entregado/leído/fallido).

**Ramas de error (confirmadas, no hipotéticas):**
- **P0 — front roto:** `frontend/src/pages/WhatsAppCampaigns.tsx` usa `fetch()` crudo sin baseURL ni token:
  `fetch('/campaigns')` (`:128` y `:219`), `fetch('/whatsapp')` (`:135`), `fetch('/contact-lists')` (`:142`),
  `fetch('/whatsapp-templates?status=APPROVED')` (`:149`) → 404/401 (`Unexpected token '<'`). El módulo de
  campañas WhatsApp está roto en producción (Fase 1 §4.4, Fase 2).
- **P0 operativo — worker caído:** `chateam-worker` `stopped`; aunque el front funcionara, nada en
  `CampaignQueue` se procesa (Fase 2 C-4).
- **`/campaigns/list` en 500:** `findList` → `FindService(params)` es uno de los 13 endpoints en 500 (Fase 2
  C-1); probable include/columna faltante.
- *Sin conexión WhatsApp activa:* 0 conexiones `CONNECTED` hoy → sin canal físico de salida (Fase 1 §3.3).
- *Modelo `Campaigns` vacío vs `CampaignMessages` con datos:* inconsistencia de flujo a confirmar con
  backend (Fase 1 §3.12).

## Deuda/bugs conocidos (Fase 2)

- **P0 — `WhatsAppCampaigns.tsx` `fetch()` crudo (5 ocurrencias)** — migrar a `api.get/post` con baseURL y
  `Authorization`; sin esto el módulo no lista ni crea campañas (`frontend/src/pages/WhatsAppCampaigns.tsx:128,135,142,149,219`).
- **C-4 (P0) worker de colas caído** — `CampaignQueue` no se procesa; ninguna campaña encolada se envía
  (`02-auditoria-tecnica.md:19,51`).
- **C-1 (P0) `/campaigns/list` en 500** — depurar `findList`/`FindService` (`02-auditoria-tecnica.md:16,48`).
- **C-3 (P0) `xlsx@0.18.5` con CVE** — `import-sales` procesa Excel con librería vulnerable
  (prototype-pollution + ReDoS); migrar a `exceljs` (`02-auditoria-tecnica.md:18,50`).
- **`Campaigns` con 0 filas / `CampaignMessages` con 3.650** — el flujo real de envío no pasa por el modelo
  esperado; confirmar arquitectura (Fase 1 §3.12).
- **Multi-tenant sin defensa en profundidad** + `media-upload` sin `limits`/`fileFilter` (IDOR posible,
  Fase 2 §1).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** el front migrado a `api` (sin `fetch()` crudo), **When** el usuario abre WhatsAppCampaigns,
   **Then** las 5 llamadas usan baseURL `/be` y header `Authorization`, y devuelven JSON (no HTML 404).
2. **Given** un usuario autenticado de la company X, **When** hace `GET /campaigns/list`, **Then** responde
   200 (no 500) con las campañas de X únicamente.
3. **Given** el worker de colas operativo y una campaña recién creada, **When** se hace `POST /campaigns`,
   **Then** se persiste el `Campaign` y se encola un job en `CampaignQueue` con `{id, companyId}`.
4. **Given** una campaña en curso, **When** el worker despacha, **Then** cada envío genera/actualiza un
   `CampaignMessage` con estado en `{pending, sent, delivered, read, failed}` y `/campaign-messages/counts`
   refleja los totales por estado.
5. **Given** una campaña activa, **When** el usuario hace `POST /campaigns/:id/cancel`, **Then** responde 200,
   la campaña pasa a estado cancelado y no se despachan más mensajes pendientes.
6. **Given** un archivo Excel de ventas válido, **When** se hace `POST /campaign-messages/import-sales`,
   **Then** responde 200 y se crean `CampaignMessages` sin exponer al servidor a la CVE de `xlsx` (librería
   parcheada/migrada).
