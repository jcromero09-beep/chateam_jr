# Spec de módulo — UGC & Contenido (generación IA para redes) · chateam_jr

> Grupo: **Growth / Monetización**. Playbook Fase 5 (Spec-Driven v7.0). Fuente del "qué":
> `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.18`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md`.
> Evidencia: solo lectura de `routes/`, `controllers/`, `models/`. Fecha: 2026-07-12.

## Propósito

Permitir generar **contenido audiovisual con IA** (imágenes, videos y audio) para campañas de redes
sociales, usando proveedores generativos (fal.ai — Kling/Veo/Nano-Banana; Higgsfield; ComfyUI
self-hosted), organizarlo en **campañas UGC**, asignarles **"creadores"** (identidades sintéticas +
device farm) con pagos, **publicarlo/sincronizarlo** en cuentas sociales conectadas, y **optimizar**
creatividades a partir del rendimiento aprendido. Es la capa de producción de contenido que alimenta el
marketing (diferenciador de producto, `SPEC.md §1`). Consume IA (créditos) y verticaliza la monetización.

## Actores y capacidades

- **El usuario** puede crear campañas UGC, subir assets de referencia, lanzar/pausar la campaña, elegir
  modelo generativo por campaña, y ver el dashboard UGC.
- **El usuario** puede generar/reintentar/descargar **videos** (jobs asíncronos) y ver su estado.
- **El usuario** puede administrar **creadores** (identidades), asignarlos a una campaña, registrar y
  consultar **pagos** al creador.
- **El usuario** puede conectar **cuentas sociales**, crear posts, sincronizar y borrar publicaciones.
- **El usuario** puede correr **optimización** de una campaña (extraer aprendizajes, optimizar presupuesto)
  y consultar histórico/aprendizajes/métricas.
- **El usuario** puede gestionar **identidades de agente** (perfiles sintéticos) y **dispositivos** (device
  farm) para atribuir contenido a "creadores".
- **El super-admin** puede configurar los **settings UGC globales** (claves fal.ai, defaults) y probar la
  conexión con fal.ai.
- **El sistema permite** procesar webhooks de fal.ai con **verificación robusta** (JWKS Ed25519 +
  anti-replay) — la referencia positiva de seguridad del proyecto.

## Rutas/Controladores (evidencia archivo:línea) y modelo de datos

**Campañas UGC** — `routes/ugcCampaignRoutes.ts` (índice `:554`): `POST /ugc/assets/reference`,
`GET /ugc/dashboard`, `GET/POST /ugc/campaigns`, `GET/PUT /ugc/campaigns/:id`,
`POST /ugc/campaigns/:id/{launch,pause}`, `GET /ugc/campaigns/:id/videos`,
`PATCH /ugc/campaigns/:id/model-selection` (`:61-130` → `UGCCampaignController`). Todas `isAuth`.

**Creadores** — `routes/ugcCreatorRoutes.ts` (índice `:555`): `GET/POST /ugc/creators`,
`GET/PUT/DELETE /ugc/creators/:id`, `POST /ugc/creators/:id/assign/:campaignId`,
`GET /ugc/creators/:id/assignments`, `POST /ugc/creators/:id/pay`, `GET /ugc/creators/:id/payments`
(`:27-85` → `UGCCreatorController`).

**Videos** — `routes/ugcVideoRoutes.ts` (índice `:556`): `GET /ugc/videos`, `GET /ugc/videos/:id`,
`POST /ugc/videos/:id/retry`, `GET /ugc/videos/:id/download` (`:20-41` → `UGCVideoController`).

**Social** — `routes/ugcSocialRoutes.ts` (índice `:557`): `POST /ugc/social/connect`,
`GET /ugc/social/accounts`, `GET/POST /ugc/social/posts`, `POST /ugc/social/:id/sync`,
`DELETE /ugc/social/:id` (`:23-53` → `UGCSocialController`).

**Optimización** — `routes/ugcOptimizationRoutes.ts` (índice `:558`):
`GET /ugc/optimization/{history,learnings}`, `POST /ugc/optimization/:campaignId/{run,optimize-budget,
extract-learnings}`, `GET /ugc/optimization/:campaignId/metrics` (`:24-61` → `UGCOptimizationController`).

**Settings (super-only)** — `routes/ugcSettingsRoutes.ts` (índice `:559`, `App.tsx:454` `superOnly`):
`GET/PUT /ugc/settings`, `POST /ugc/settings/test-fal` — todos `isAuth`+`isSuper` (`ugcSettingsRoutes.ts:8-10`).

**Identidades / dispositivos** — `routes/agentIdentityRoutes.ts`, `routes/agentDeviceRoutes.ts`
(índice `:668`): CRUD `/ugc/creators`(identidad), `/ugc/devices` (`:23-70`, todos `isAuth`).

**Webhook fal.ai** — `routes/falWebhookRoutes.ts` (verificación JWKS Ed25519 + anti-replay,
`integraciones.md:90,114`).

**Modelo de datos (tablas):** `UGCCampaign` + `UGCCampaignMetric`, `UGCVideoAsset` + `UGCVideoJob`,
`UGCCreator` + `UGCCreatorAssignment` + `UGCCreatorPayment`, `UGCSocialAccount` + `UGCSocialPost`,
`UGCCreativeVariant` + `UGCCreativeLearning`, `UGCPostComment`; identidades/device farm
`AgentIdentity`/`AgentDevice`/`AgentInteraction`/`AgentMemory`/`AgentProfilePhoto` (`models/`).

## Flujos clave

**Happy path — generar video para campaña:** usuario crea `UGCCampaign` (`POST /ugc/campaigns`) → sube
referencia (`/ugc/assets/reference`) → elige modelo (`PATCH /:id/model-selection`) → lanza (`/:id/launch`)
→ se crea un `UGCVideoJob` que llama a fal.ai → fal.ai responde por **webhook verificado** → se materializa
`UGCVideoAsset` → usuario ve `GET /ugc/campaigns/:id/videos` y descarga (`/ugc/videos/:id/download`).

**Happy path — publicar y optimizar:** conecta cuenta social (`/ugc/social/connect`) → crea post
(`/ugc/social/posts`) → sincroniza métricas (`/ugc/social/:id/sync` → `UGCCampaignMetric`) → corre
optimización (`/ugc/optimization/:campaignId/run`) que extrae `UGCCreativeLearning` y ajusta presupuesto.

**Errores:**
- *Job fallido:* un `UGCVideoJob` con error debe permitir `POST /ugc/videos/:id/retry` sin duplicar cobro
  de créditos.
- *Settings fal.ai ausentes:* si el super-admin no configuró la clave (`/ugc/settings`), la generación
  falla con error de configuración, no 500 genérico.
- *Webhook forjado:* un webhook fal.ai sin firma válida se rechaza (ya implementado, referencia positiva).

## Deuda/bugs conocidos (Fase 2)

- **Consumo de IA no idempotente aguas abajo:** la generación UGC descuenta créditos IA; comparte el riesgo
  **S-10 (P1)** de provisión/deducción de créditos no idempotente (ver `creditos-costos-ia-spec.md`). Un
  retry de `UGCVideoJob` no debe re-descontar.
- **Multitenancy por columna:** `/ugc/campaigns`, `/ugc/videos`, `/ugc/creators` dependen de filtrar
  `companyId` en el query; sin `tenantMiddleware` (`Fase1 §5.4`).
- **[SUPUESTO] Device farm / identidades sintéticas:** `AgentIdentity`/`AgentDevice` modelan "creadores"
  sintéticos — confirmar con negocio el encuadre de uso (políticas de plataformas sociales), es análisis de
  producto, no bug técnico.
- **Costos generativos sin tope por plan visible:** no se evidenció límite de gasto fal.ai/Higgsfield por
  company; riesgo de abuso de un tenant contra la cuenta global de fal.ai — validar cuotas.

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un usuario NO super-admin, **When** hace `GET /ugc/settings`, **Then** responde 403 (gate
   `isAuth`+`isSuper`, `ugcSettingsRoutes.ts:8`).
2. **Given** un `UGCVideoJob` en estado `failed`, **When** el usuario hace `POST /ugc/videos/:id/retry`,
   **Then** se reintenta la generación y NO se descuenta un segundo cargo de créditos IA por el mismo job.
3. **Given** un webhook fal.ai con firma Ed25519 inválida, **When** llega al endpoint de `falWebhookRoutes`,
   **Then** responde 401/403 y no crea/actualiza ningún `UGCVideoAsset`.
4. **Given** una campaña de la company A, **When** la company B pide `GET /ugc/campaigns/:id` de esa
   campaña, **Then** responde 404/403 sin exponer datos de A.
5. **Given** una campaña con métricas sincronizadas, **When** se ejecuta `POST /ugc/optimization/:id/run`,
   **Then** se persiste al menos un `UGCCreativeLearning` y `GET /ugc/optimization/learnings` lo devuelve.
6. **Given** un creador asignado a una campaña, **When** se registra `POST /ugc/creators/:id/pay`,
   **Then** aparece un `UGCCreatorPayment` consultable en `GET /ugc/creators/:id/payments`.
