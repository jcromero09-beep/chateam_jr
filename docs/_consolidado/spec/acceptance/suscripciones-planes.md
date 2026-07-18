# Criterios de Aceptación — Suscripciones Planes

> Fuente: spec/modules/suscripciones-planes-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

- **Dado** un webhook Stripe SIN header `stripe-signature`, **cuando** llega, **entonces** la API responde 400 y NO activa plan ni créditos.
