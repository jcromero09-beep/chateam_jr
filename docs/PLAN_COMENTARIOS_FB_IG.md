# PLAN — Módulo de Comentarios Facebook/Instagram (estilo TikTok)
> v1.0 — 2026-06-12 | Dictamen Fase 0 completado con 3 agentes especializados + skill chateam-jr
> Decisiones del usuario: **Unificar sobre UGC** | **Modo por conexión + override por post** | **Solo comentarios (sin tickets) en fase 1**

---

## 1. Objetivo

Interfaz estilo TikTok para ver y responder comentarios de posts de Facebook (Página) e Instagram (media IG), con **3 modos de respuesta mutuamente excluyentes**:

| Modo | Descripción | Quién responde |
|---|---|---|
| `manual` | El agente humano ve el comentario en el inbox y responde desde ChatEAM | Humano |
| `auto_message` | Mensaje fijo guardado por el usuario, se envía siempre como respuesta | Sistema |
| `ai` | SupervisorService genera respuesta contextual (consume créditos `agent_execution`) | IA |

**Regla anti-duplicados:** un solo modo activo por ámbito (conexión, con override opcional por post) + ledger de idempotencia + candado por comentario (`autoReplyStatus`) → un comentario JAMÁS recibe 2 respuestas automáticas.

## 2. Base arquitectónica (decisión: Unificar sobre UGC)

- **Fuente de verdad**: `UGCSocialPost` + `UGCPostComment` (ya existen, multi-plataforma, hilos anidados, clasificación IA)
- **Motor de ejecución Graph API**: `services/CommentAutoReplyServices/CommentReplyExecutor.ts` (reply/like/hide/delete/private reply ya implementados)
- **IA**: `SupervisorService.processMessage({message, companyId, contactId?, channel: 'facebook'|'instagram'})` — no requiere ticket
- **Créditos**: `AIUsagePricingService.chargeUsage({creditTypeKey:'agent_execution', source:'fb_ig_comment', sourceId: commentId})`
- **Dedup**: `InboundEventLedgerService.registerOrDrop({provider:'meta_comment', eventKey: <comment_id>})`
- **Cliente Graph**: axios v24.0 (`metaClient.ts` / `graphAPI.ts`)

## 3. Gaps a construir

### GAP 1 — Conectividad Meta (CRÍTICO)
1. **Scopes OAuth** en `metaEmbeddedSignupService.ts`: agregar `pages_show_list`, `pages_read_engagement`, `pages_manage_engagement`, `pages_read_user_content`, `instagram_basic`, `instagram_manage_comments`.
   ⚠️ Requieren App Review de Meta para producción con cuentas ajenas; funcionan de inmediato con páginas propias (rol admin/tester).
2. **Suscripción webhook**: agregar `feed` (FB) y `comments` (IG) a `subscribed_fields` en `graphAPI.ts` (subscribed_apps) + configuración App-level.
3. **Page Access Token**: columna nueva en `Whatsapps` (`pageAccessToken`, `instagramBusinessAccountId`) — ADD COLUMN, nunca DROP.

### GAP 2 — Ingesta de comentarios
- Handler en `MetaWebhookController.ts` para `entry[].changes[]` con `field === 'feed'` (FB: `item === 'comment'`, verbs add/edited/remove) y `field === 'comments'` (IG).
- Flujo: webhook → dedup ledger (`meta_comment:<comment_id>`) → upsert `UGCSocialPost` (post padre) → crear `UGCPostComment` (con `parentCommentId` si es reply) → emitir Socket.IO `company-{id}-fb-comment` → encolar `CommentResponderQueue` si el modo activo ≠ manual.
- **Filtro anti-eco**: ignorar comentarios cuyo `from.id` === pageId/igUserId propio (son nuestras respuestas).

### GAP 3 — Selector de modos + motor de respuesta
- **Tabla nueva `CommentResponseSettings`** (companyId, whatsappId/conexión, socialPostId nullable para override, `mode: 'manual'|'auto_message'|'ai'`, `autoMessage TEXT`, `aiAgentConfigId`, `isActive`). UNIQUE (companyId, whatsappId, socialPostId).
- **Resolución de modo**: override por post → si no existe, modo de la conexión → default `manual`.
- **Cola Bull `CommentResponderQueue`** (concurrencia 3-5, attempts 2, backoff exponencial):
  - `auto_message` → `CommentReplyExecutor.replyToComment` con el texto guardado
  - `ai` → `SupervisorService.processMessage` → validar `skipSend`/gatekeeper → reply → debitar créditos
  - Candado: `UPDATE UGCPostComments SET autoReplyStatus='generating' WHERE id=? AND autoReplyStatus='pending'` (update condicional atómico)

### GAP 4 — API REST (`routes/socialCommentRoutes.ts`, prefijo `/social-comments`)
```
GET    /social-comments/posts                      # posts con comentarios (paginado, filtro plataforma)
GET    /social-comments/posts/:id/comments         # hilo (paginado, anidado)
POST   /social-comments/:id/reply                  # respuesta manual
POST   /social-comments/:id/like                   # like (SOLO Facebook)
DELETE /social-comments/:id/like                   # quitar like (SOLO Facebook)
POST   /social-comments/:id/hide                   # ocultar / mostrar
GET    /social-comments/settings                   # configuración de modos
PUT    /social-comments/settings                   # guardar modo por conexión/post
POST   /social-comments/sync/:whatsappId           # sync on-demand vía GET /{post-id}/comments?filter=stream
```
Todas con `isAuth` + filtro `companyId`. Respuesta `{success, message, data}`.

### GAP 5 — Frontend (UI estilo TikTok)
- **Página nueva** `frontend/src/pages/SocialCommentsInbox.tsx`:
  - Layout 2 paneles: izquierda = lista de posts (thumbnail, plataforma, badge de pendientes); derecha = hilo de comentarios estilo TikTok (base: `TikTokCommentBubble.tsx` + patrones de `AgentCommentsInbox.tsx`)
  - Acciones inline por comentario: Responder (input inline), 👍 Like (solo FB — oculto en IG), Ocultar
  - Banner del modo activo del post/conexión: "✋ Manual / 💬 Automático / 🤖 IA" con chip de color
  - Estados Loading + Error + Empty obligatorios
- **Página/Modal configuración** `SocialCommentsSettings.tsx`: radio de 3 modos por conexión, textarea para mensaje automático, select de agente IA, override por post
- **Socket.IO**: listener `company-{companyId}-fb-comment` para tiempo real
- **Rutas** en `App.tsx` (`/social-comments`, `/social-comments/settings`) + menú sidebar sección CANALES + módulo RBAC `social_comments` en `permissions.ts`

## 4. Restricciones API confirmadas (guía Meta)
- ❌ **IG no permite like a comentarios por API** → botón solo en FB
- ❌ IG no permite responder comentarios ocultos ni replies de 2º nivel (la reply va al comentario principal)
- FB requiere tarea MODERATE en la página para ver IDs de comentarios (v11+)
- Versión Graph API del proyecto: **v24.0**

## 5. Orden de implementación
1. Migraciones (CommentResponseSettings + columnas Whatsapps) — solo CREATE/ADD COLUMN
2. Webhook ingesta + dedup + socket
3. Motor de respuesta (cola + 3 modos + candado)
4. Endpoints REST
5. Frontend (inbox + settings + menú + permisos)
6. Scopes OAuth + suscripción webhook + prueba end-to-end con página propia
7. `npm run build` backend + frontend, reinicio PM2 (sin borrar procesos)

## 6. Reglas inamovibles aplicables
- BD SAGRADA: cero DELETE/DROP; comentarios borrados en FB se marcan `isDeleted=true` (soft)
- Multi-tenancy: `companyId` en toda query e índices
- Sin `any`, sin `console.log`, paginación obligatoria, eager loading
