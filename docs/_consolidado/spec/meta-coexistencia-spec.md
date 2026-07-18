# Spec — Meta & Coexistencia (el "qué debería ser")

> Estado objetivo para la integración con APIs de Meta y el sistema de Coexistencia de `chateam_jr`.
> Referencia de hallazgos: `AUDITORIA_2026_07/10-meta-coexistencia/meta-coexistencia-audit.md`.

## S1. Versión de Graph API única y centralizada

- **DEBE** existir una única fuente de verdad: `config/metaGraph.ts` que exporte:
  - `GRAPH_API_VERSION` = `process.env.GRAPH_API_VERSION || "v24.0"` (mínimo seguro; objetivo migrar a `v25.0`).
  - `graphBase()` → `https://graph.facebook.com/${GRAPH_API_VERSION}`.
  - `graphUrl(path)` y `igGraphBase()` equivalentes para `graph.instagram.com`.
- **NINGÚN** archivo bajo `services/` o `controllers/` debe hardcodear `graph.facebook.com/vXX.0` ni definir su propio default de versión.
- La variable `FACEBOOK_CONVERSIONS_API_VERSION` **DEBE** desaparecer o alinearse al mismo default (nunca v19/v20).
- Invariante verificable: `grep -rE "graph\.(facebook|instagram)\.com/v[0-9]+" services controllers | grep -v config/metaGraph` → **0 resultados**.
- Ninguna versión en uso puede estar expirada ni deprecarse en < 6 meses (hoy: prohibido v19, v20; evitar v21).

## S2. Verificación de firma de webhook — enforce

- `META_SIGNATURE_MODE` **DEBE** ser `enforce` en producción; `warn` solo permitido durante rollout con fecha de corte documentada.
- Webhook Meta sin `X-Hub-Signature-256` válida → HTTP 403 (ya implementado; falta activar el modo).
- `VERIFY_TOKEN` y `FACEBOOK_VERIFY_TOKEN` **DEBEN** ser secretos fuertes por entorno; **prohibido** el fallback hardcodeado (`"whaticket"`, `"chateam_fb_verify"`).
- `FBPageWebhookController` (comentarios FB) **DEBE** validar HMAC igual que `MetaWebhookController` (hoy no lo hace — ver integraciones P1-2).
- `FACEBOOK_APP_SECRET` presente es requisito de arranque para las rutas de webhook Meta (fail-fast si falta y el modo es enforce).

## S3. Gestión de tokens de larga duración

- El modelo `Whatsapp` **DEBE** tener `tokenMetaExpiresAt: Date`.
- Se **DEBE** poblar en `processEmbeddedSignupCallback` y `refreshLongLivedToken` (a partir de `expires_in`).
- `MetaTokenRefreshService` **DEBE** decidir la renovación comparando `tokenMetaExpiresAt` (renovar si faltan < 10 días), **no** `updatedAt`.
- `tokenMeta` (y `pageAccessToken`, tokens FB/IG/TikTok) **DEBERÍAN** almacenarse cifrados en reposo (AES-256-GCM), alineado con seguridad P1-6.

## S4. Contrato de Coexistencia (Baileys ↔ Meta Cloud API)

- El enrutamiento saliente **DEBE** resolverse únicamente vía `OutboundRoutingService.resolveOutbound()`; ningún caller debe elegir proveedor por su cuenta.
- Precedencia de política (invariante): `request` (override agente) > `conversation.routingPolicy` > `whatsapp.sendChannel`/coexistencia > `whatsapp.channel`.
- **Ventana 24h Meta**: fuera de la ventana (o sin inbound) solo se permite plantilla aprobada o fallback a Baileys; el umbral operativo es 23h.
- `isMetaReady` = `channel="meta"` ∧ `phoneNumberId` ∧ `tokenMeta`. `isBaileysAlive` = `status="CONNECTED"`. Si el provider objetivo no está listo, **DEBE** intentarse el alterno antes de "best effort".
- **Idempotencia/dedupe**: todo inbound cross-provider pasa por `InboundEventLedgerService` (dedupe por `wid`); los echoes SMB (`fromMe:true`, `sourceChannel:"business_app"`) **NO** disparan IA/chatbot/FlowBuilder.
- **Liveness**: alertas a 11/13 días y `coexistenceStatus="disabled"` a los 14 (regla Meta de apertura de Business App).
- **Migración** Baileys→Meta: nunca elimina registros (marca `MIGRATED`/`migrated`), reasigna tickets `open/pending`.

## S5. Endpoints y payloads WhatsApp Cloud API

- Envíos por `POST /{phoneNumberId}/messages` con `messaging_product:"whatsapp"` + `X-Idempotency-Key`. (✅ ya cumple.)
- `POST /{phoneNumberId}/register`: PIN **DEBE** ser configurable por conexión, no `"000000"` fijo.
- `language.code` de plantillas **DEBE** coincidir exactamente con el aprobado en Meta (default único, sin mezclar `es`/`es_ES`).
- Suscripciones (`subscribed_apps`) y `debug_token` con los campos actuales (✅ ya cumple).

## S6. Criterios de aceptación

- [ ] `grep` de versiones hardcodeadas fuera de `config/metaGraph.ts` = 0.
- [ ] Ninguna versión expirada/deprecada (<6m) en el árbol.
- [ ] `META_SIGNATURE_MODE=enforce` y `VERIFY_TOKEN` fuerte en prod; sin defaults hardcodeados.
- [ ] `Whatsapp.tokenMetaExpiresAt` existe, poblada y usada por el refresh cron.
- [ ] CAPI (`FacebookConversionService`) emite sin errores 400 de versión.
- [ ] Test de contrato de `resolveOutbound` cubriendo los 5 modos + fallback + ventana 24h.
