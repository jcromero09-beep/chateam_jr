# Spec de Módulo — WebChat (widget embebible) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.11`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md`.
> Base URL producción: `https://padeldev.codigo.plus/be`. Módulo montado en `/webchat` (`routes/index.ts:564`).

## Propósito
Widget de chat público embebible en el sitio web de la company: el visitante anónimo escribe sin autenticarse y su conversación entra a la bandeja interna del CRM, donde un agente responde. Incluye configuración del widget por `apiKey`, conversaciones internas, analíticas e historial. Es el canal propio (no dependiente de terceros) del CRM omnicanal.

## Actores y capacidades
- **El admin puede** gestionar widgets: crear (`POST /webchat/widgets`), listar (`GET /webchat/widgets`), ver (`GET /webchat/widgets/:id`), editar (`PUT /webchat/widgets/:id`) y eliminar (`DELETE /webchat/widgets/:id`).
- **El admin/supervisor puede** ver analíticas (`GET /webchat/analytics`; admin ve su company, super ve todo).
- **El agente puede** ver conversaciones WebChat (`GET /webchat/conversations`), sus mensajes (`GET /webchat/conversations/:id/messages`), responder (`POST /webchat/conversations/:id/messages`), marcar leída (`POST /webchat/conversations/:id/read`) y cambiar su estado (`PUT /webchat/conversations/:id/status`).
- **El visitante público (sin login) puede** obtener la config del widget por apiKey (`GET /webchat/public/config/:apiKey`), enviar un mensaje (`POST /webchat/public/message`) y recuperar los mensajes de su sesión (`GET /webchat/public/messages/:apiKey/:sessionId`).
- **El sistema permite** procesar mensajes públicos sin autenticación por diseño y aislar cada widget por `apiKey`/`companyId`.

## Rutas/Controladores (evidencia) y modelo de datos
Router activo: `routes/webChatWidgetRoutes.ts`, montado en `/webchat` (`routes/index.ts:564`, import `:278`). Controlador `controllers/WebChatWidgetController.ts`. Las rutas de admin usan `isAuth`; las `/public/*` NO llevan `isAuth`.

| Método/Ruta (con prefijo `/webchat`) | Controlador |
|---|---|
| `POST /webchat/widgets` | `WebChatWidgetController.store` — `webChatWidgetRoutes.ts:8` |
| `GET /webchat/widgets` | `WebChatWidgetController.index` — `:9` |
| `GET /webchat/widgets/:id` | `WebChatWidgetController.show` — `:10` |
| `PUT /webchat/widgets/:id` | `WebChatWidgetController.update` — `:11` |
| `DELETE /webchat/widgets/:id` | `WebChatWidgetController.remove` — `:12` |
| `GET /webchat/analytics` | `WebChatWidgetController.getAnalytics` — `:15` |
| `GET /webchat/conversations` | `WebChatWidgetController.conversations` — `:18` |
| `GET /webchat/conversations/:id/messages` | `WebChatWidgetController.conversationMessages` — `:19` |
| `POST /webchat/conversations/:id/messages` | `WebChatWidgetController.sendConversationMessage` — `:20` |
| `POST /webchat/conversations/:id/read` | `WebChatWidgetController.readConversation` — `:21` |
| `PUT /webchat/conversations/:id/status` | `WebChatWidgetController.setConversationStatus` — `:22` |
| `GET /webchat/public/config/:apiKey` | `WebChatWidgetController.getPublicConfig` (sin auth) — `:25` |
| `POST /webchat/public/message` | `WebChatWidgetController.processPublicMessage` (sin auth) — `:26` |
| `GET /webchat/public/messages/:apiKey/:sessionId` | `WebChatWidgetController.publicMessages` (sin auth) — `:27` |

**Tablas**: `WebChatWidgets`, `WebChatConversations`, `WebChatConversationMessages`. Modelos: `models/WebChatWidget.ts`, `models/WebChatConversation.ts`, `models/WebChatConversationMessage.ts`.

**Nota de deuda (código muerto):** existe un `routes/webchatRoutes.ts` alterno (con `/channels`, `/sessions`, `/messages`, `/send`, controlador `WebChatController.ts` + `apiLimiter`) que **NO está montado** en `routes/index.ts` → es una segunda implementación no cableada. La activa es `webChatWidgetRoutes`.

## Flujos clave
- **Happy path (visitante):** el sitio embebe el widget → `GET /webchat/public/config/:apiKey` carga estilos/estado → visitante envía `POST /webchat/public/message` (crea/continúa `WebChatConversation`) → agente ve la conversación en `GET /webchat/conversations` → responde con `POST /webchat/conversations/:id/messages` → visitante recupera respuestas con `GET /webchat/public/messages/:apiKey/:sessionId`.
- **Happy path (cerrar):** agente marca leída (`POST /webchat/conversations/:id/read`) y cambia estado (`PUT /webchat/conversations/:id/status`).
- **Error — apiKey inválida:** `GET /webchat/public/config/:apiKey` con apiKey inexistente → error controlado, no expone datos de otra company.
- **Error — abuso del endpoint público:** `POST /webchat/public/message` es sin auth por diseño → debe protegerse contra spam/inyección (rate limit por apiKey/IP).

## Deuda/bugs conocidos (Fase 2)
- **Superficie pública sin auth:** `/webchat/public/*` procesa mensajes sin autenticación (por diseño); requiere rate limiting y validación de origen por `apiKey` para evitar spam/abuso. `webChatWidgetRoutes` no aplica `apiLimiter` (a diferencia del `webchatRoutes` muerto que sí lo tenía).
- **Código muerto (P2/P3):** `routes/webchatRoutes.ts` + `WebChatController.ts` sin montar (segunda implementación) — consolidar o borrar (patrón de rutas/controladores muertos señalado en `02-auditoria-tecnica.md §5`).
- **Aislamiento multi-tenant:** las conversaciones deben filtrarse por `companyId`/`apiKey`; `getAnalytics` debe distinguir admin (su company) vs super (todo).
- No figura entre los 13 endpoints en 500.

## Criterios de aceptación (Given/When/Then)
1. **Given** un widget con `apiKey` válida, **When** un visitante hace `GET /be/webchat/public/config/:apiKey`, **Then** recibe 200 con la config pública del widget (colores, estado) y ningún secreto de la company.
2. **Given** un visitante anónimo, **When** hace `POST /be/webchat/public/message` con `{apiKey,sessionId,message}`, **Then** se crea/continúa una `WebChatConversation` y el mensaje se persiste en `WebChatConversationMessages`.
3. **Given** una conversación WebChat abierta, **When** un agente autenticado hace `POST /be/webchat/conversations/:id/messages`, **Then** el mensaje del agente se guarda y el visitante lo recupera vía `GET /be/webchat/public/messages/:apiKey/:sessionId`.
4. **Given** un admin de la company A, **When** hace `GET /be/webchat/conversations`, **Then** solo ve conversaciones de la company A (aislamiento por `companyId`).
5. **Given** el endpoint público sin auth, **When** una IP envía muchos `POST /be/webchat/public/message` en poco tiempo, **Then** se aplica rate limiting por apiKey/IP y se rechazan los excedentes (hoy `webChatWidgetRoutes` no monta `apiLimiter`).
