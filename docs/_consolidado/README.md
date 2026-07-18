# 📚 Documentación consolidada (2026-07-17)

Todos los `.md` que estaban dispersos por la raíz del proyecto, reunidos aquí.
Los originales están en `_cuarentena/docs-originales/` — **copiados, no borrados**.

| Carpeta | md | Origen | Qué es |
|---|---|---|---|
| `raiz/` | 5 | raíz del repo | `AGENTS.md`, `CHATEAM.md` (arquitectura + diagramas mermaid), `INFORME_CAMPAIGNS_INSIGHTS_2026.md`, `PLAN_ACCION_CAMPAIGNS_INSIGHTS.md`, `WHATSAPP_COEXISTENCE_PLAN.md` |
| `spec/` | 53 | `spec/` | Specs por módulo (25) y criterios de aceptación (22) |
| `spec-first/` | 12 | `SPEC-FIRST/` | Metodología spec-first por fases (fase0→fase4) |
| `auditoria-2026-07/` | 18 | `AUDITORIA_2026_07/` | Auditoría de julio 2026 |
| `plan/` | 5 | `plan/` | Planes de trabajo |
| `workflows/` | 1 | `workflows/` | — |
| `tasks/` | 1 | `tasks/` | — |

**Total en `docs/`: 144 `.md`** (los 95 consolidados aquí + 36 que ya estaban en `docs/` + 13 de `docs/reparaciones-finales-chateam/`).

## Solo se copiaron los `.md`

Las carpetas de origen tenían archivos que **no** son documentación y se quedaron en cuarentena:

- `SPEC-FIRST/sondas/` → sondas `.mjs` reutilizables, `design-tokens.json`, capturas `.png`, logs
- `AUDITORIA_2026_07/08-sondas-runtime/` → `probe.mjs`, `resultados.json`
- `spec/acceptance/nav_before.txt`

Si alguno hace falta, está en `_cuarentena/docs-originales/`.

## Los .md que NO están aquí (y por qué)

Estos son **funcionales**: moverlos rompe cosas.

- `.claude/skills/chateam-jr/**` y `.claude/agents/*.md` → los carga Claude Code en sesión
- `data/agent-skills/creative-hook-15s/**` → contenido de producto (hooks UGC)
- `services/UGCProviders/fal/*.md` → READMEs junto al código que documentan
- `README.md` (raíz), `meta-marketing/README.md`, `scripts/README_VALIDATION.md` → documentan su propia carpeta

## Documentos vivos

- **`../SPEC_MAQUETAS_INTEGRACIONES.md`** — 🗄️ archivado por JC (el módulo de integraciones se archivó "por lo pronto"), pero contiene la investigación verificada del estado real: el backend de integraciones responde **500 en producción** por desalineación modelo↔tabla. Si se retoma, se empieza por ahí.
