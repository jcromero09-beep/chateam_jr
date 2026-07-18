# Criterios de Aceptación — Whatsapp Conexiones

> Fuente: spec/modules/whatsapp-conexiones-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un admin autenticado, **When** hace `GET /be/whatsapps`, **Then** recibe 200 con solo las conexiones de su `companyId` y ningún campo `tokenMeta`/`pageAccessToken`/`facebookUserToken` en claro en el payload.
