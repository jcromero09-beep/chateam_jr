# Spec de Módulo — WhatsApp / Conexiones (Baileys + Cloud API + Coexistencia) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.3, §4.1`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (S-2/S-3/S-8/S-9, C-2, M-1), `spec/meta-coexistencia-spec.md`.
> Base URL producción: `https://padeldev.codigo.plus/be`.

## Propósito
Gestionar las conexiones de canal de una company: conectar un número de WhatsApp por QR (Baileys, no-oficial) o por Embedded Signup oficial de Meta (Cloud API), conectar páginas de Facebook/Instagram, ver el estado de cada conexión, administrar plantillas de WhatsApp Cloud API y decidir dinámicamente qué canal físico usa cada mensaje saliente (Coexistencia Meta↔Baileys con failover). Es el módulo que habilita el canal físico del que dependen Tickets y Campañas.

## Actores y capacidades
- **El admin puede** listar conexiones (`GET /whatsapp` / alias `GET /whatsapps`), filtrarlas (`GET /whatsapp/filter`), listar todas (`GET /whatsapp/all`), crear una conexión WhatsApp (`POST /whatsapp`), conectar Facebook (`POST /facebook`) o Instagram (`POST /instagram/connect`), ver/editar/eliminar una conexión (`GET|PUT|DELETE /whatsapp/:whatsappId`) y reiniciarla (`POST /whatsapp-restart`).
- **El admin puede** iniciar/actualizar/cerrar una sesión Baileys (QR) (`POST|PUT|DELETE /whatsappsession/:whatsappId`) y forzar cierre admin (`DELETE /whatsappsession/admin/:whatsappId`).
- **El usuario puede** subir/borrar media adjunta a un mensaje saliente (`POST|DELETE /whatsapp/:whatsappId/media-upload`).
- **El admin puede** gestionar plantillas Cloud API: listar/ver/crear/editar/eliminar (`GET|POST|PUT|DELETE /whatsapp-templates`), enviarlas a Meta (`POST /whatsapp-templates/:templateId/submit`) y sincronizarlas desde Meta (`POST /whatsapp-templates/sync`).
- **El admin puede** operar la Coexistencia y migración (rutas montadas en `/whatsapp` y callback Embedded Signup en `/webhook/meta`).
- **El sistema permite** elegir el canal físico por ticket (`force_meta`/`force_baileys`/`sticky_inbound`/`auto`) vía `OutboundRoutingService.ts`, con failover automático Meta↔Baileys.

## Rutas/Controladores (evidencia) y modelo de datos
Routers: `routes/whatsappRoutes.ts` (plano, `index.ts:490`), `routes/whatsappSessionRoutes.ts` (`index.ts:492`), `routes/whatsappTemplateRoutes.ts` (montado `/whatsapp-templates`, `index.ts:538`), `routes/whatsappCoexistenceRoutes.ts` (montado `/whatsapp` y `/webhook/meta`, `index.ts:534-535`). Middleware `isAuth` en todas.

| Método/Ruta | Controlador |
|---|---|
| `GET /whatsapp` /`/whatsapps` | `controllers/WhatsAppController.ts` (`index`) — `whatsappRoutes.ts:17,22` |
| `GET /whatsapp/filter`, `/whatsapp/all` | `WhatsAppController` (`indexFilter`, `listAll`) |
| `POST /whatsapp` | `WhatsAppController.store` — `:26` |
| `POST /facebook`, `POST /instagram/connect` | `WhatsAppController.storeFacebook`, `storeInstagram` — `:27-28` |
| `GET|PUT|DELETE /whatsapp/:whatsappId` | `WhatsAppController.show/update/remove` — `:29-31` |
| `POST /whatsapp-restart` | `WhatsAppController.restart` — `:35` |
| `POST|DELETE /whatsapp/:whatsappId/media-upload` | `services/WhatsappService/uploadMediaAttachment` (`mediaUpload`/`deleteMedia`) — `:36-38` |
| `GET|PUT|DELETE /whatsapp-admin/:whatsappId` | `WhatsAppController.showAdmin/updateAdmin/remove` — `:41-45` |
| `POST|PUT|DELETE /whatsappsession/:whatsappId` | `controllers/WhatsAppSessionController.ts` (`store/update/remove`) |
| `GET|POST|PUT|DELETE /whatsapp-templates...` | `controllers/WhatsAppTemplateController.ts` (`index/show/store/update/remove/submitToMeta/syncFromMeta`) |

**Tablas**: `Whatsapps` (29 conexiones; secretos `tokenMeta`/`facebookUserToken`/`pageAccessToken` en `models/Whatsapp.ts:120,133,138`), `WhatsAppTemplates`, `WhatsappQueue` (relación conexión↔cola). Servicios core: `services/WbotServices/wbotMessageListener.ts` (7.501 líneas), `OutboundRoutingService.ts`, `services/CoexistenceServices/` (11 archivos). Frontend: `WhatsAppModal`/`EmbeddedSignupModal`/`UnifiedConnectionModal`.

## Flujos clave
- **Happy path (QR Baileys):** admin crea conexión (`POST /whatsapp`) → inicia sesión (`POST /whatsappsession/:whatsappId`) → backend genera QR → estado transita `qrcode`→`CONNECTED` → mensajes entrantes crean tickets.
- **Happy path (Cloud API):** admin abre Embedded Signup → Meta redirige a `/webhook/meta` (callback coexistencia) → se persiste `tokenMeta`/`pageAccessToken` → conexión queda operativa vía Cloud API.
- **Happy path (salida con Coexistencia):** agente responde ticket → `OutboundRoutingService` decide canal (`force_meta`/`force_baileys`/`sticky_inbound`/`auto`) → si el canal primario falla, failover automático al alterno.
- **Error — sin canal activo:** estado real hoy: de 29 conexiones, **22 `qrcode`, 7 `DISCONNECTED`, 0 `CONNECTED`** → no hay canal físico; ningún mensaje entra/sale hasta reconectar una sesión (por diseño anti-secuestro del entorno restaurado, no bug).
- **Error — token Meta caído:** el webhook Meta acepta forjados (modo `warn`) y la versión de Graph API v19.0 está **expirada (HTTP 400)** en CAPI → fallas silenciosas.

## Deuda/bugs conocidos (Fase 2)
- **S-2/S-3 (P0):** `GET /companies` y `GET /settingsFacebook` filtran `facebookAppSecret`/claves de pago a cualquier `user` (confirmado en vivo). Rotar `facebookAppSecret`.
- **S-9 (P1):** tokens Meta/FB/TikTok en **claro** en `Whatsapps` (`models/Whatsapp.ts:120,133,138`) y `Companies`. Fix AES-256-GCM.
- **S-8 (P1):** webhook Meta en modo `warn` (`MetaSignatureValidator.ts:24`) + `VERIFY_TOKEN=whaticket` por defecto (`MetaWebhookController.ts:29`). Fix `META_SIGNATURE_MODE=enforce`.
- **M-1 (P0):** Graph API **v19.0 EXPIRADA** (`SendWebsiteEvent.ts:65`); 7 versiones conviviendo. Fix centralizar en `FB_GRAPH_VERSION` v24.0.
- **C-2 (P0):** `whatsapp-rust-bridge` fuera de `package.json` (solo en lock) → `npm install` limpio rompe WhatsApp. Fix declararla + `patch-package`.
- **IDOR mediaUpload** (P1/P2), uploads sin `limits`/`fileFilter`.
- Estado runtime: 0 conexiones `CONNECTED`; `MAX_SESSIONS=60` por nodo sin prueba de carga.

## Criterios de aceptación (Given/When/Then)
1. **Given** un admin autenticado, **When** hace `GET /be/whatsapps`, **Then** recibe 200 con solo las conexiones de su `companyId` y ningún campo `tokenMeta`/`pageAccessToken`/`facebookUserToken` en claro en el payload.
2. **Given** una conexión Baileys nueva, **When** el admin hace `POST /be/whatsappsession/:whatsappId`, **Then** el backend genera un QR y la conexión transita a estado `qrcode` (y a `CONNECTED` tras escanear).
3. **Given** un webhook entrante de Meta con firma inválida, **When** llega a `/webhook/meta`, **Then** con `META_SIGNATURE_MODE=enforce` se rechaza con 401 y no se procesa el evento (hoy en modo `warn` lo acepta — S-8).
4. **Given** un ticket con canal primario Meta caído y `routing=auto`, **When** el agente envía un mensaje, **Then** `OutboundRoutingService` hace failover a Baileys y el mensaje se despacha o queda con estado de error para reintento.
5. **Given** una plantilla creada localmente, **When** el admin hace `POST /be/whatsapp-templates/:templateId/submit`, **Then** se envía a Meta y su estado se refleja al hacer `POST /be/whatsapp-templates/sync`.
6. **Given** un entorno con `npm install` limpio, **When** arranca el backend, **Then** `whatsapp-rust-bridge` resuelve sus exports sin parche en runtime (hoy falla — C-2).
