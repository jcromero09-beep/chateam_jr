// [Plan Fase 2 · Ola A · A2.1] FUENTE ÚNICA de la versión de la Graph API de Meta.
// Ver spec/modules/marketing-meta-graph-version-spec.md
//
// Antes: la versión estaba hardcodeada en ~26 archivos (v17..v25). Las rutas CAPI
// arrastraban v18/v19/v20 → HTTP 400 por versión expirada (M-1 del repo).
//
// Actualización SEMESTRAL: cambiar GRAPH_API_VERSION aquí (o vía env FB_GRAPH_VERSION),
// validar en staging y desplegar. Ningún otro archivo debe hardcodear la versión.
export const GRAPH_API_VERSION = process.env.FB_GRAPH_VERSION || "v24.0";

export const GRAPH_BASE_URL = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

/** Construye una URL de Graph API con la versión canónica. `path` sin slash inicial. */
export const graphUrl = (path = ""): string =>
  `${GRAPH_BASE_URL}/${String(path).replace(/^\/+/, "")}`;

export default { GRAPH_API_VERSION, GRAPH_BASE_URL, graphUrl };
