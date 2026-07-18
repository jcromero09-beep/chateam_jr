# Criterios de Aceptación — Chats Internos

> Fuente: spec/modules/chats-internos-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un usuario autenticado participante de un chat, **When** hace `GET /be/chats/:id/messages`, **Then** recibe 200 con los mensajes del chat en orden cronológico.
