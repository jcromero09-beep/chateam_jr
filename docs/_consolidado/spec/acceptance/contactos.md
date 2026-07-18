# Criterios de Aceptación — Contactos

> Fuente: spec/modules/contactos-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un usuario autenticado, **When** hace `GET /be/contacts?pageNumber=1`, **Then** recibe 200 con `{contacts,count,hasMore}` limitado a una página y solo contactos de su `companyId`.
