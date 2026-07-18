# Criterios de Aceptación — Quick Messages

> Fuente: spec/modules/quick-messages-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** cualquier perfil autenticado con mensajes rápidos, **When** hace `GET /be/quick-messages/list`, **Then** responde 200 con la lista de sus mensajes rápidos (hoy 500 — bloqueador C-1).
