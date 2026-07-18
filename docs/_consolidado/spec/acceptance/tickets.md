# Criterios de Aceptación — Tickets

> Fuente: spec/modules/tickets-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un agente autenticado con al menos un ticket abierto en su cola, **When** hace `GET /be/tickets?status=open`, **Then** recibe 200 con un array de tickets scopeados a su `companyId` y ninguno de otra company.
