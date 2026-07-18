# Criterios de Aceptación — Comentarios Fbig

> Fuente: spec/modules/comentarios-fbig-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un admin con una conexión de canal facebook/instagram, **When** hace `GET /be/social-comments/connections`, **Then** recibe 200 solo con conexiones cuyo canal es facebook o instagram (excluye WhatsApp/Telegram).
