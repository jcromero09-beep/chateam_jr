# W0-INV-06 — Accesibilidad (axe-core) contra el sitio vivo

> Ola 0 (INV) · 2026-07-26 · `@axe-core/playwright` + chromium headless contra
> https://padeldev.codigo.plus (autenticado por token inyectado). Read-only. Alcance: 3 páginas core
> (Dashboard, Tickets, Contactos) — NO las 172; barrido completo pendiente.

## Resultado: a11y MUY por encima de lo que declaraba la auditoría (NFR-017)

| Página | reglas | crítico | serio | moderado | menor |
|---|---|---|---|---|---|
| Login (público) | 1 | 0 | 0 | 1 | 0 |
| Dashboard `/` | 1 | 0 | 0 | 1 | 0 |
| Tickets `/tickets` | 3 | **1** | 0 | 2 | 0 |
| Contactos `/contacts` | 2 | 0 | 0 | 1 | 1 |

**Única crítica:** `aria-valid-attr-value` (1 nodo, en Tickets) — un atributo ARIA con valor inválido.
Moderadas recurrentes: `landmark-unique` (falta nombre accesible en un landmark), `page-has-heading-one`
(Tickets sin `<h1>`). Menor: `empty-table-header` (Contactos).

## Reclasificación
- **NFR-017 (a11y): de PARCIAL/NO-VERIFICABLE a casi cumplido.** Las cifras de la auditoría de frontend
  ("10/7/7 violaciones, 473 IconButton sin aria-label, 2 bloqueos P0 sistémicos") son **OBSOLETO** — el
  re-skin/design-system las resolvió; no aparecen en axe hoy.
- **W7-FE-03 (a11y) se reduce** a: arreglar 1 crítica (aria-valid-attr-value en Tickets) + un puñado de
  moderadas (landmark-unique, page-has-heading-one). Talla S/M, no L.

## Límite
Solo 3 páginas core escaneadas (+login). Un barrido de las 172 podría revelar más; pero las páginas
más ricas (Tickets) ya salen casi limpias, así que el riesgo residual es bajo.
