# Spec de Módulo — Comentarios FB/IG (Inbox + Auto-Responder) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.10`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (P1-2 webhook FB sin firma, S-8).
> Base URL producción: `https://padeldev.codigo.plus/be`.

## Propósito
Dos capas complementarias sobre comentarios de Facebook/Instagram: (1) una **bandeja/inbox** estilo TikTok para ver posts y sus comentarios/hilos y responder/moderar manualmente; (2) un **auto-responder** por campañas que responde automáticamente a comentarios que hacen match de palabras clave. Permite captar leads desde comentarios de redes sin perder trazabilidad.

## Actores y capacidades
### Inbox de comentarios (SocialComment)
- **El usuario puede** listar posts con comentarios (`GET /social-comments/posts`), ver el hilo de un post (`GET /social-comments/posts/:id/comments`) y listar conexiones elegibles (solo canales facebook/instagram) (`GET /social-comments/connections`).
- **El usuario puede** configurar modos de la bandeja (`GET|PUT /social-comments/settings`).
- **El admin puede** conectar una página FB/IG y adquirir su Page Access Token (`POST /social-comments/connect/:whatsappId`, `POST /social-comments/connect/:whatsappId/select`) y sincronizar comentarios on-demand (`POST /social-comments/sync/:whatsappId`).
- **El usuario puede** responder (`POST /social-comments/:id/reply`), dar/quitar like (`POST|DELETE /social-comments/:id/like`) y ocultar (`POST /social-comments/:id/hide`) un comentario.

### Auto-responder por campañas (CommentAutoReply)
- **El admin puede** ver el dashboard (`GET /comment-autoreply/dashboard`), CRUD de campañas (`GET|POST /comment-autoreply/campaigns`, `GET|PUT|DELETE /comment-autoreply/campaigns/:id`), activar/pausar (`POST /comment-autoreply/campaigns/:id/activate|pause`).
- **El admin puede** descubrir posts de una página (`GET /comment-autoreply/pages/:pageId/posts`), ver logs y estadísticas de la campaña (`GET /comment-autoreply/campaigns/:id/logs|stats`).
- **El usuario puede** actuar manualmente sobre un comentario: responder/ocultar/eliminar/bloquear al autor (`POST /comment-autoreply/comments/:commentId/reply|hide|block`, `DELETE /comment-autoreply/comments/:commentId`).
- **El admin puede** probar reglas: match de palabras clave (`POST /comment-autoreply/test-match`) y respuesta (`POST /comment-autoreply/test-reply`).
- **El sistema permite** responder automáticamente a comentarios entrantes que cumplan las reglas de la campaña.

## Rutas/Controladores (evidencia) y modelo de datos
Routers (ambos planos): `routes/socialCommentRoutes.ts` (`index.ts:636`), `routes/commentAutoReplyRoutes.ts` (`index.ts:633`). Middleware `isAuth` en todas.

| Método/Ruta | Controlador |
|---|---|
| `GET /social-comments/posts` | `controllers/SocialCommentController.ts` (`listPosts`) — `socialCommentRoutes.ts:15` |
| `GET /social-comments/posts/:id/comments` | `SocialCommentController.listComments` — `:16` |
| `GET /social-comments/connections` | `SocialCommentController.listConnections` — `:19` |
| `GET|PUT /social-comments/settings` | `SocialCommentController.listSettings`/`upsertSettings` — `:22-23` |
| `POST /social-comments/connect/:whatsappId[/select]` | `SocialCommentController.connectPage`/`connectPageSelect` — `:26-27` |
| `POST /social-comments/sync/:whatsappId` | `SocialCommentController.sync` — `:30` |
| `POST /social-comments/:id/reply` | `SocialCommentController.reply` — `:33` |
| `POST|DELETE /social-comments/:id/like` | `SocialCommentController.like`/`unlike` — `:34-35` |
| `POST /social-comments/:id/hide` | `SocialCommentController.hide` — `:36` |
| `GET /comment-autoreply/dashboard` | `controllers/CommentAutoReplyController.ts` (`dashboard`) — `commentAutoReplyRoutes.ts:14` |
| `GET|POST /comment-autoreply/campaigns` | `CommentAutoReplyController.listCampaigns`/`createCampaign` — `:17-18` |
| `GET|PUT|DELETE /comment-autoreply/campaigns/:id` | `showCampaign`/`updateCampaign`/`deleteCampaign` — `:19-21` |
| `POST /comment-autoreply/campaigns/:id/activate|pause` | `activateCampaign`/`pauseCampaign` — `:22-23` |
| `GET /comment-autoreply/pages/:pageId/posts` | `listPagePosts` — `:26` |
| `GET /comment-autoreply/campaigns/:id/logs|stats` | `listLogs`/`getCampaignStats` — `:29-30` |
| `POST /comment-autoreply/comments/:commentId/reply|hide|block`, `DELETE .../:commentId` | `replyToComment`/`hideComment`/`blockCommenter`/`deleteComment` — `:33-36` |
| `POST /comment-autoreply/test-match|test-reply` | `testKeywordMatch`/`testReply` — `:39-40` |

**Tablas**: `CommentAutoReplyCampaigns`, `CommentAutoReplyLogs`, `CommentResponseSettings`, `UGCPostComments` (`models/UGCPostComment.ts:54` `tableName:"UGCPostComments"`; campo `socialPostId`). Modelos: `models/CommentAutoReplyCampaign.ts`, `models/CommentAutoReplyLog.ts`, `models/CommentResponseSettings.ts`.

## Flujos clave
- **Happy path (inbox manual):** admin conecta página (`POST /social-comments/connect/:whatsappId` → `/select`) → sincroniza (`POST /social-comments/sync/:whatsappId`) → agente ve posts (`GET /social-comments/posts`) y responde/oculta un comentario.
- **Happy path (auto-responder):** admin crea campaña con keywords y respuesta → prueba con `test-match`/`test-reply` → activa (`POST /comment-autoreply/campaigns/:id/activate`) → un comentario entrante que hace match dispara respuesta automática → queda registrado en `CommentAutoReplyLogs` y visible en `.../logs` y `.../stats`.
- **Error — webhook FB sin verificación (P1-2):** el webhook `/webhook/facebook` de comentarios entra **sin verificación de firma** → cualquiera puede inyectar comentarios falsos que disparan auto-respuesta.
- **Error — sin Page Access Token:** si `connectPage` no adquirió token válido, `sync`/`reply` fallan (permiso Meta insuficiente o token caducado).

## Deuda/bugs conocidos (Fase 2)
- **P1-2 (P1):** webhook `/webhook/facebook` de comentarios **sin verificación de firma** (`integraciones.md:84,159-161`) → inyección de comentarios falsos.
- **S-8 (P1):** verificación de firma Meta en modo `warn` + `VERIFY_TOKEN=whaticket` por defecto (aplica a todo el ingreso Meta, incluidos comentarios).
- **M-1 (P0):** Graph API v19.0 expirada / 7 versiones conviviendo (afecta llamadas a la Graph para sync/reply de comentarios).
- Tokens de página (`pageAccessToken`) en claro en `Whatsapps` (S-9).

## Criterios de aceptación (Given/When/Then)
1. **Given** un admin con una conexión de canal facebook/instagram, **When** hace `GET /be/social-comments/connections`, **Then** recibe 200 solo con conexiones cuyo canal es facebook o instagram (excluye WhatsApp/Telegram).
2. **Given** una página FB conectada con token válido, **When** el admin hace `POST /be/social-comments/sync/:whatsappId`, **Then** los comentarios recientes se persisten en `UGCPostComments` y aparecen en `GET /be/social-comments/posts`.
3. **Given** una campaña de auto-reply con la keyword "precio", **When** el admin hace `POST /be/comment-autoreply/test-match` con un comentario que contiene "precio", **Then** responde 200 indicando match y la respuesta que se enviaría.
4. **Given** una campaña activa, **When** llega un comentario que hace match, **Then** se envía la respuesta automática y se registra una fila en `CommentAutoReplyLogs` visible en `GET /be/comment-autoreply/campaigns/:id/logs`.
5. **Given** un webhook `/webhook/facebook` con firma inválida, **When** llega el evento, **Then** con verificación de firma activada se rechaza (401) y NO dispara auto-respuesta (hoy se acepta sin verificar — P1-2).
6. **Given** un comentario en la bandeja, **When** el agente hace `POST /be/social-comments/:id/hide`, **Then** el comentario queda oculto en la página FB/IG y su estado se refleja en la bandeja.
