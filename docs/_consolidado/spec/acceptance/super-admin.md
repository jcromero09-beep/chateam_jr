# Criterios de Aceptación — Super Admin

> Fuente: spec/modules/super-admin-spec.md (metodología Spec-Driven). Cada criterio debe ser verificable por un test.

- **Dado** un perfil `user`/`supervisor`/`admin` (no super), **cuando** consulta `GET /companies`, `/ai/costs/report`, `/ai/credits/*`, `/ai/agents`, **entonces** recibe 403 (o solo su propia company, sin secretos).
