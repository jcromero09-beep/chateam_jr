> ## ⚠️ HISTÓRICO / DESACTUALIZADO (2026-07-17)
> **NO confíes en los checkboxes de este doc.** Marca `[ ]` cosas que `PLAN-FASE-2.md`
> (posterior) YA ejecutó (HMAC Meta, config/metaGraph.ts, cifrado tokens, Design System),
> y su Fase 0 se implementó de otra forma. Estado real y plan vigente:
> **`docs/PLAN_INTEGRAL_OLAS_2026_07.md`** (Olas 1-7, con lo hecho verificado esta sesión).
> Se conserva por trazabilidad, no como fuente de verdad.

# PLAN — Remediacion chateam_jr (derivado de auditoria v7.0)

> El "como". Fases ordenadas por dependencia con checkboxes. Marcar al completar.

## Fase 0: Quick wins (hecho parcialmente en auditoria)
- [x] Renombrar .eslintrc.js -> .eslintrc.cjs (lint dejaba de correr por ERR_REQUIRE_ESM)
- [x] Agregar scripts npm faltantes: type-check, test:unit, format:check (los invocaba el CI)
- [x] Crear /spec y /plan (esta estructura)
- [ ] Generar .env.example versionado (anonimizado) con las ~133 variables
- [ ] Crear README.md de arranque
- [ ] Crear AGENTS.md en la raiz (plantilla guia v7.0 sec 20)

## Fase 1: Documentacion y config
- [ ] Documentar tabla de variables de entorno en spec/SPEC.md
- [ ] Documentar entrypoint canonico y proposito de server.ts / server-simple.ts / server-distributed.ts
- [ ] Registrar justificacion de dependencias (91 prod) en spec

## Fase 2: Calidad de codigo
- [ ] Activar TypeScript strict por etapas (strictNullChecks -> noImplicitAny -> strict)
- [ ] Reducir uso de : any (409 archivos en core)
- [ ] Limpiar 191 console.log del frontend (usar logger / quitar en prod)
- [ ] Resolver UI descableada: IntegrationsDashboard.tsx:251 (onClick vacio); UGCModelSelector.tsx:407,520 (href="#")

## Fase 3: CI/CD y verificacion
- [ ] Confirmar pipeline CI en verde con los scripts nuevos
- [ ] Agregar job de npm audit (escaneo de dependencias)
- [ ] Ordenar raiz: mover 25 .ts sueltos a scripts/ o tasks/
- [ ] start ejecuta build compilado (node dist/...) en vez de tsx sobre fuente

## Fase 4: Testing completo
- [ ] Levantar DB de test (chateam_test) + migraciones
- [ ] Correr test:unit, test:integration, test:e2e y dejar 100% verde
- [ ] Registrar cobertura minima objetivo

## Comandos de verificacion
Ver spec/testing-spec.md

## Notas
- No commitear .env ni secretos. .env.example debe ir anonimizado.
- Cambios de esta auditoria: package.json.bak es respaldo previo.

## Meta & Coexistencia — remediación
Ref: `AUDITORIA_2026_07/10-meta-coexistencia/meta-coexistencia-audit.md` · Spec: `spec/meta-coexistencia-spec.md`.

### P1 — Inmediato (rotura funcional / expiración)
- [ ] **P1-1 (hotfix env)**: setear `FACEBOOK_CONVERSIONS_API_VERSION=v24.0` en `.env` de prod HOY (v19.0 expiró 2026-05-21 → CAPI puede estar devolviendo 400). Revisar logs de `SendWebsiteEvent`/`SendConversionEvent` por errores de versión.
- [ ] **P1-1 (código)**: cambiar defaults `v19.0`/`v20.0` en `FacebookConversionService/SendWebsiteEvent.ts:65` y `SendConversionEvent.ts:300` a la versión central.
- [ ] **P1-2**: agregar columna `tokenMetaExpiresAt` a `models/Whatsapp.ts`; poblarla en `metaEmbeddedSignupService.ts` (signup + `refreshLongLivedToken`); `MetaTokenRefreshService.ts` debe comparar contra ella (renovar si < 10 días), no contra `updatedAt`.

### P2 — Centralización de versión y config
- [ ] **P2-3**: crear `config/metaGraph.ts` con `GRAPH_API_VERSION` (env, default `v24.0`) + `graphBase()`/`graphUrl()`/`igGraphBase()`.
- [ ] **P2-3**: reemplazar los ~38 hardcodes `graph.facebook.com/v24.0` (base en `FacebookServices/graphAPI.ts:8` + `metaClient.ts:8` + `WhatsAppCloudAPI/CloudAPIService.ts:90,526` + `controllers/WhatsAppController.ts:767,785` + `SocialCommentServices/*` + `CommentAutoReplyServices/*` + `FacebookAuthHelper.ts`) por la config central.
- [ ] **P2-3**: unificar los defaults divergentes de `FB_GRAPH_VERSION` (v23 en `MetaMarketingService/TokenManager.ts:5`) y las consts fijas en `WhatsAppTemplateServices/*`.
- [ ] **P2-4**: migrar `UGCSocialProviders/FacebookProvider.ts:59` (v22.0) e `InstagramProvider.ts:60` (v21.0, cercano a EOL) a la config central.
- [ ] **P2-5**: alinear `MetaOfficialMCPClientService.ts:43-44` (v25.0) al esquema central; planear salto coordinado del repo a v25.0.
- [ ] **P2-6**: PIN de `POST /{phoneNumberId}/register` configurable por conexión (`graphAPI.ts:859`), no `"000000"` fijo.

### Seguridad (ya listado en seguridad.md P1-5/P1-6, aquí como cross-ref)
- [ ] Migrar `META_SIGNATURE_MODE=enforce` + `VERIFY_TOKEN`/`FACEBOOK_VERIFY_TOKEN` fuertes (quitar defaults `whaticket`/`chateam_fb_verify`).
- [ ] Añadir validación HMAC a `FBPageWebhookController` (webhook comentarios FB sin firma).
- [ ] Cifrar `tokenMeta`/`pageAccessToken`/tokens FB/IG en reposo.

### P3 — Limpieza / robustez
- [ ] **P3-7**: unificar `language.code` de plantillas (`metaSendService.ts:121` `es` vs `:306` `es_ES`) al code exacto aprobado en Meta.
- [ ] **P3-8**: eliminar código muerto (v17.0 comentado `graphAPI.ts:87`, `sendInstagramAttachment` duplicada) y logs de payload/token completos (`metaSendService.ts`, `metaClient.ts`).
- [ ] **P3-9**: verificar índice `(ticketId, companyId, fromMe, createdAt)` para `computeMetaWindow` (`OutboundRoutingService.ts:150`).
- [ ] Añadir test de contrato de `resolveOutbound` (5 modos + fallback + ventana 24h).
