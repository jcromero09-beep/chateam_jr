# Spec de Módulo — Chats Internos · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.6`.
> Base URL producción: `https://padeldev.codigo.plus/be`.

## Propósito
Mensajería interna entre agentes de la misma plataforma (no WhatsApp): conversaciones 1-a-1 o grupales entre usuarios del equipo, con adjuntos, marcado de leído/entregado, fijado de mensajes y contador de no leídos en tiempo real. Sirve para coordinación operativa del equipo sin salir del CRM.

## Actores y capacidades
- **El usuario puede** ver su total de no leídos (`GET /chats-total-unreads`), listar sus chats (`GET /chats`), abrir un chat (`GET /chats/:id`) y sus mensajes (`GET /chats/:id/messages`).
- **El usuario puede** enviar un mensaje con o sin adjunto (`POST /chats/:id/messages`, `multipart` un archivo), crear un chat (`POST /chats`), editarlo (`PUT /chats/:id`) y eliminarlo (`DELETE /chats/:id`).
- **El usuario puede** marcar como leído un chat (`POST /chats/:id/read`), marcar varios (`POST /chats/:chatId/mark-read`), marcar un mensaje entregado/leído (`POST /chats/messages/:messageId/delivered`, `/read`).
- **El usuario puede** fijar/desfijar mensajes (`POST|DELETE /chats/messages/:messageId/pin`) y ver los fijados (`GET /chats/:id/pinned-messages`).
- **El sistema permite** validar acceso al chat por participante (middleware `validateChatAccess`) y notificar en tiempo real vía Socket.IO (hook frontend `useInternalChatSocket.ts`).

## Rutas/Controladores (evidencia) y modelo de datos
Router: `routes/chatRoutes.ts` (plano, `index.ts:510`). Middleware `isAuth` en todas; `validateChatAccess` en las rutas por `:id`; upload `multer(chatUploadConfig)`.

| Método/Ruta | Controlador |
|---|---|
| `GET /chats-total-unreads` | `controllers/ChatController.ts` (`getTotalUnreads`) — `chatRoutes.ts:12` |
| `GET /chats` | `ChatController` (`index`) — `:13` |
| `GET /chats/:id` | `ChatController.show` + `validateChatAccess` — `:14` |
| `GET /chats/:id/messages` | `ChatController.messages` + `validateChatAccess` — `:15` |
| `GET /chats/:id/pinned-messages` | `ChatController.getPinnedMessages` — `:16` |
| `POST /chats/:id/messages` | `ChatController.saveMessage` (upload single `file`) — `:17` |
| `POST /chats/:id/read` | `ChatController.checkAsRead` — `:18` |
| `POST /chats/:chatId/mark-read` | `ChatController.markMultipleAsRead` — `:19` |
| `POST /chats/messages/:messageId/delivered` | `ChatController.markAsDelivered` — `:20` |
| `POST /chats/messages/:messageId/read` | `ChatController.markAsRead` — `:21` |
| `POST|DELETE /chats/messages/:messageId/pin` | `ChatController.pinMessage`/`unpinMessage` — `:22-23` |
| `POST /chats` | `ChatController.store` — `:24` |
| `PUT /chats/:id` | `ChatController.update` + `validateChatAccess` — `:25` |
| `DELETE /chats/:id` | `ChatController.remove` + `validateChatAccess` — `:26` |

**Tablas**: `Chats`, `ChatMessages`, `ChatUsers`. Modelos: `models/Chat.ts`, `models/ChatMessage.ts`, `models/ChatUser.ts`. Middleware: `middleware/validateChatAccess.ts`. Frontend: hook `useInternalChatSocket.ts`.

## Flujos clave
- **Happy path (conversación):** usuario crea chat con otros agentes (`POST /chats`) → envía mensaje (`POST /chats/:id/messages`) → Socket.IO emite a los participantes → el receptor ve el contador subir (`GET /chats-total-unreads`) → abre y marca leído (`POST /chats/:id/read`).
- **Happy path (fijar):** en un chat de equipo, el usuario fija un mensaje clave (`POST /chats/messages/:messageId/pin`) → aparece en `GET /chats/:id/pinned-messages`.
- **Error — acceso no autorizado:** `validateChatAccess` rechaza a un usuario que no es participante del chat `:id` → 403, no ve mensajes.
- **Error — adjunto inválido:** `POST /chats/:id/messages` con archivo que excede `chatUploadConfig` → error de upload controlado.

## Deuda/bugs conocidos (Fase 2)
- No aparece entre los 13 endpoints en 500 ni entre los P0/P1 de Fase 2 (módulo relativamente sano en la auditoría).
- Aplica la deuda transversal: aislamiento multi-tenant por columna `companyId` (sin `tenantMiddleware`) — la pertenencia al chat la cubre `validateChatAccess`, pero conviene confirmar que también filtra por `companyId`.
- Uploads: verificar `limits`/`fileFilter` en `chatUploadConfig` (patrón de riesgo señalado para otros módulos de upload).

## Criterios de aceptación (Given/When/Then)
1. **Given** un usuario autenticado participante de un chat, **When** hace `GET /be/chats/:id/messages`, **Then** recibe 200 con los mensajes del chat en orden cronológico.
2. **Given** un usuario que NO es participante del chat `:id`, **When** hace `GET /be/chats/:id`, **Then** `validateChatAccess` responde 403 y no expone mensajes.
3. **Given** un chat con mensajes no leídos, **When** el usuario hace `POST /be/chats/:id/read`, **Then** el contador de `GET /be/chats-total-unreads` disminuye en consecuencia.
4. **Given** dos agentes en un chat, **When** uno hace `POST /be/chats/:id/messages`, **Then** el otro recibe el mensaje en tiempo real por Socket.IO (`useInternalChatSocket`) sin recargar.
5. **Given** un mensaje de un chat, **When** el usuario hace `POST /be/chats/messages/:messageId/pin`, **Then** el mensaje aparece en `GET /be/chats/:id/pinned-messages` y se puede desfijar con `DELETE`.
