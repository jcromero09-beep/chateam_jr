# Spec · Versión centralizada de Graph API (Plan Fase 2 · Ola A · A2.1)

## Qué (comportamiento)
- Existe **una sola fuente de verdad** para la versión de la Graph API de Meta: `config/metaGraph.ts`.
- Todo servicio que llame a `graph.facebook.com` usa `GRAPH_API_VERSION` / `GRAPH_BASE_URL` / `graphUrl()` de ese módulo.
- La versión es overridable por env `FB_GRAPH_VERSION`; default canónico **v24.0**.
- Las rutas CAPI (`SendConversionEvent`, `SendWebsiteEvent`, `SyncDatasets`) **dejan de defaultear a versiones expiradas** (v18/v19/v20) — la causa raíz de los HTTP 400 en el envío de conversiones del Kanban (deuda M-1).

## Por qué
- La versión estaba hardcodeada/dispersa en ~26 archivos con 7 valores distintos (v17→v25).
- Meta deprecia versiones cada ~12–24 meses; una versión expirada hace fallar el CAPI en runtime (400) de forma silenciosa, degradando la calidad de señal y el ROAS.

## Aceptación
1. `grep -rnE "graph\.facebook\.com/v[0-9]+\.[0-9]+|['\"]v[0-9]{2}\.[0-9]+['\"]" services/ meta-marketing/src/` (excluyendo comentarios) → **0 defaults por debajo de v24** en rutas CAPI.
2. Cambiar `FB_GRAPH_VERSION` en env re-apunta TODAS las llamadas sin editar código.
3. El nodo arranca OK; un envío CAPI de prueba usa la versión canónica (verificable en el log de la request).

## Fuera de alcance (fase posterior)
- Barrido de los ~20 literales `v24.0` ya correctos hacia el config (consistencia, sin urgencia).
- Estrategia de actualización semestral documentada en el runbook de deploy.
