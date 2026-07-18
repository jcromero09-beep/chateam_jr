# Spec de módulo — Marketing (Meta Ads / Atribución / Facebook Conversions) · chateam_jr

> Grupo: **Growth / Monetización**. Playbook Fase 5 (Spec-Driven v7.0). Fuente del "qué":
> `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.19`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (M-1),
> `spec/meta-coexistencia-spec.md`. Evidencia: solo lectura. Fecha: 2026-07-12.

## Propósito

Cerrar el ciclo de **marketing de pago** conectando la plataforma con Meta Ads: gestionar campañas/adsets/
ads de Meta, ver **insights** y **usage** de la Graph API, medir **atribución multi-touch** del recorrido
del cliente (qué canal/anuncio generó cada conversión) y enviar eventos de **Conversions API (CAPI)** a
Facebook para optimizar el pixel/dataset. Incluye un **agente Meta Ads** (MCP oficial) que planifica y
ejecuta acciones sobre las campañas. Es la palanca de crecimiento pagado y de atribución de ROI.

## Actores y capacidades

- **El usuario** puede probar la conexión Meta, listar cuentas publicitarias, y **CRUD de campañas/adsets/
  ads** de Meta (crear, editar, duplicar, pausar/activar en masa).
- **El usuario** puede ver **insights** y tendencias, dashboard, `usage-stats` y `token-status` de la Graph
  API, e invalidar la caché de insights.
- **El usuario** puede consultar el **dashboard de atribución**, atribución por canal, journeys del cliente
  (con detalle), y métricas agregadas (touchpoints promedio, % multi-touch, tiempo promedio).
- **El usuario** puede configurar **políticas de conversiones**, disparar/enviar eventos CAPI (individual,
  masivo, pendientes, retry), rastrear eventos, ver stats y sincronizar datasets por conexión WhatsApp.
- **El usuario** puede operar el **agente Meta Ads MCP**: conectar/desconectar, ver estado/diagnóstico/
  tools, chatear, planificar (`plan`), ejecutar (`execute`) y consultar planes ejecutados.
- **El sistema permite** agregar touchpoints y calcular conversiones atribuidas con distintos modelos
  (7/30/90 días, custom).

## Rutas/Controladores (evidencia archivo:línea) y modelo de datos

**Meta Ads** — `routes/metaMarketingRoutes.ts` (todos `isAuth`): `GET /meta-marketing/test-connection`,
`GET /ad-accounts`, `GET/POST /campaigns`, `GET/PUT/DELETE /campaigns/:id`, `GET /campaigns/:id/ads`,
`POST /campaigns/:id/{duplicate,pause-all,activate-all}`, `GET/POST/PUT/DELETE /{ads,adsets}[/:id]`,
`GET /insights`, `GET /insights/trend`, `GET /dashboard`, `POST /invalidate-cache`, `GET /usage-stats`,
`GET /token-status` (`metaMarketingRoutes.ts:10-177` → `MetaMarketingController`); **agente MCP**
`/meta-marketing/agent/*` (`connections`, `mcp/status|diagnostics|connect|callback|disconnect|tools|
tools/call|mark-connected`, `chat`, `plan`, `execute`, `plans[/:id]`) (`:187-282` → `MetaAdsAgentController`).

**Atribución** — `routes/attributionRoutes.ts` (todos `isAuth`): `GET /attribution/dashboard`
(`:12`), `GET /attribution/channels` (`:23`), `GET /attribution/journeys` (`:34`),
`GET /attribution/journey/:journeyId` (`:44`), `GET /attribution/metrics` (`:54`) → `AttributionController`.

**Facebook Conversions (CAPI)** — `routes/facebookConversionRoutes.ts` (todos `isAuth`):
`GET/POST /facebook-conversions/policies`, `POST /send`, `POST /send-all-pending`, `POST /track`,
`GET /tracked-events`, `POST /test`, `GET /events`, `GET /stats`, `POST /sync-datasets`,
`POST /sync-datasets/:whatsappId`, `POST /retry-failed`, `GET /datasets`
(`facebookConversionRoutes.ts:8-92` → `FacebookConversionController`).

**Modelo de datos (tablas):** atribución `AttributionTouchpoint`/`AttributionConversion`/
`AttributionChannelAggregate`/`AttributionResult`; conversiones `FacebookConversionEvent` (2.236 filas,
`Fase1 §3.19`) + `FacebookDataset` + `CompanyMetaConversionSetting`; agente Meta
`MetaAgentPlan`/`MetaAgentActionLog`/`MetaOfficialMcpConnection` (`models/`).

## Flujos clave

**Happy path — medir ROI de un anuncio:** un lead entra por un anuncio Meta → se registra un
`AttributionTouchpoint` → al convertir (venta/cita), el motor calcula la `AttributionConversion` con el
modelo elegido → el usuario ve el crédito por canal en `GET /attribution/dashboard` y el recorrido en
`/attribution/journeys` → en paralelo se envía el evento a Facebook vía CAPI
(`POST /facebook-conversions/send`) para retroalimentar el pixel.

**Happy path — agente Meta Ads:** usuario conecta MCP (`/agent/mcp/connect` → `callback`) → pide un plan
(`POST /agent/plan`) → revisa y ejecuta (`POST /agent/execute`) → cada acción queda en `MetaAgentActionLog`.

**Errores:**
- *Token Meta expirado/insuficiente:* `GET /meta-marketing/token-status` debe reflejarlo; las operaciones
  de escritura fallan con error claro, no 500.
- *Versión de Graph API expirada:* CAPI falla con **HTTP 400** silencioso (ver deuda M-1).
- *Rate/usage de Graph:* `usage-stats` alerta antes de gastar el presupuesto de llamadas.

## Deuda/bugs conocidos (Fase 2)

- **M-1 (P0) — Graph API v19.0 EXPIRADA / versiones deprecadas mezcladas:** CAPI usa defaults expirados:
  `services/FacebookConversionService/SendWebsiteEvent.ts:65` → `"v19.0"` (expirada) y
  `SendConversionEvent.ts:300` → `"v20.0"` (deprecando 2026-09-24). Además conviven versiones hardcodeadas:
  `services/FacebookServices/graphAPI.ts:87` `v17.0`, `services/UGCSocialProviders/InstagramProvider.ts:60`
  `v21.0`. **Fix (spec):** centralizar en `config/metaGraph.ts` (`GRAPH_API_VERSION>=v24.0`), eliminar
  `FACEBOOK_CONVERSIONS_API_VERSION` con default expirado; invariante `grep` = 0 fuera de config
  (`spec/meta-coexistencia-spec.md §S1`). Falla observable: conversiones CAPI que retornan 400.
- **Webhook FB de comentarios sin firma (P1-2):** `FBPageWebhookController` no valida HMAC (afecta también
  Comentarios FB/IG); `spec/meta-coexistencia-spec.md §S2` exige HMAC igual que `MetaWebhookController`.
- **Tokens Meta/FB en claro en BD (S-9, P1):** `Whatsapps.tokenMeta/pageAccessToken`, `Companies.
  facebookAppSecret` sin cifrar (`Fase2 §1`). El agente Meta Ads persiste conexiones — cifrar en reposo.
- **Multitenancy por columna:** atribución y conversiones dependen de filtrar `companyId` por query.

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** el árbol de código, **When** se corre
   `grep -rE "graph\.(facebook|instagram)\.com/v[0-9]+" services meta-marketing controllers | grep -v config/metaGraph`,
   **Then** el resultado es **0 líneas** (versión única centralizada) — hoy falla (M-1).
2. **Given** una company con dataset y token válidos, **When** hace `POST /facebook-conversions/send`,
   **Then** Facebook responde 200 (no 400 de versión) y el `FacebookConversionEvent` pasa a `sent`.
3. **Given** un lead con ≥2 touchpoints antes de convertir, **When** consulta `GET /attribution/metrics`,
   **Then** el `%multi-touch` es >0 y `avgTouchpoints` ≥ 2.
4. **Given** un usuario sin token Meta configurado, **When** hace `POST /meta-marketing/campaigns`,
   **Then** responde 4xx con error de credenciales, no 500.
5. **Given** un plan del agente Meta ejecutado, **When** se consulta `GET /meta-marketing/agent/plans/:id`,
   **Then** devuelve el plan con sus `MetaAgentActionLog` asociados.
6. **Given** dos companies, **When** la company A pide `GET /facebook-conversions/events`, **Then** solo ve
   sus propios `FacebookConversionEvent` (scope `companyId`), nunca los de B.
