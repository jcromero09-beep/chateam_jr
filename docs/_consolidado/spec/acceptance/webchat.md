# Criterios de Aceptación — Webchat

> Fuente: spec/modules/webchat-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

1. **Given** un widget con `apiKey` válida, **When** un visitante hace `GET /be/webchat/public/config/:apiKey`, **Then** recibe 200 con la config pública del widget (colores, estado) y ningún secreto de la company.
