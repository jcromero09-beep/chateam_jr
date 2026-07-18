# Spec — Etiquetas (Tags) · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` real (solo lectura) +
> Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.9` + Fase 2 `02-auditoria-tecnica.md`. Fecha: 2026-07-12.

## Propósito

Sistema de etiquetas de color para clasificar tickets y contactos, y para **definir las etapas del Kanban**
(las tags con marca kanban son las columnas del embudo). Es el eje de segmentación del CRM: una misma tabla
`Tags` sirve tanto para etiquetado libre (prioridad, tema, campaña) como para el pipeline de ventas. Incluye
recomendación de etiquetas por IA y sincronización de tags.

## Actores y capacidades

- **El usuario puede** listar, ver, crear, editar y eliminar etiquetas (`GET /tags`, `/tags/list`,
  `/tags/:tagId`; `POST /tags`; `PUT /tags/:tagId`; `DELETE /tags/:tagId`).
- **El usuario puede** ver las etiquetas en modo Kanban (etapas del embudo) (`GET /tag/kanban`).
- **El usuario puede** asignar/quitar una etiqueta a un ticket (`PUT /ticket-tags/:ticketId/:tagId`,
  `DELETE /ticket-tags/:ticketId`) y quitar la etiqueta de un contacto
  (`DELETE /tags-contacts/:tagId/:contactId`).
- **El usuario puede** pedir recomendaciones de etiquetas por IA
  (`POST /tags/ai-recommend`, `/tags/meta-conversion/ai-recommend`).
- **El sistema permite** sincronizar etiquetas (`POST /tags/sync`, `TagController.syncTags`).
- **El sistema permite** exponer métricas y embudo derivados de las tags kanban
  (`GET /tag/kanban/metrics`, `/tag/kanban/funnel`).

## Rutas/Controladores (evidencia) y modelo de datos

Montaje `routes/index.ts:504` (tags) y `:519` (ticketTags). Todas con `isAuth` (multi-tenant por `companyId`).
Controladores: `TagController` (`controllers/TagController.ts`), `KanbanMetricsController`,
`TicketTagController`.

| Método | Ruta | Handler | Evidencia |
|---|---|---|---|
| GET | `/tags/list` | `TagController.list` | `routes/tagRoutes.ts:9`, `controllers/TagController.ts:187` |
| GET | `/tags` | `TagController.index` | `routes/tagRoutes.ts:10`, `controllers/TagController.ts:28` |
| GET | `/tags/:tagId` | `TagController.show` | `routes/tagRoutes.ts:11` |
| GET | `/tag/kanban` | `TagController.kanban` | `routes/tagRoutes.ts:12`, `controllers/TagController.ts:196` |
| POST | `/tags` | `TagController.store` | `routes/tagRoutes.ts:14`, `controllers/TagController.ts:44` |
| POST | `/tags/ai-recommend` | `TagController.aiRecommend` | `routes/tagRoutes.ts:15` |
| POST | `/tags/meta-conversion/ai-recommend` | `TagController.metaConversionAiRecommend` | `routes/tagRoutes.ts:16` |
| POST | `/tags/sync` | `TagController.syncTags` | `routes/tagRoutes.ts:17` |
| PUT | `/tags/:tagId` | `TagController.update` | `routes/tagRoutes.ts:19` |
| DELETE | `/tags/:tagId` | `TagController.remove` | `routes/tagRoutes.ts:21` |
| DELETE | `/tags-contacts/:tagId/:contactId` | `TagController.removeContactTag` | `routes/tagRoutes.ts:22` |
| GET | `/tag/kanban/metrics` | `KanbanMetricsController.getMetrics` | `routes/tagRoutes.ts:24` |
| GET | `/tag/kanban/funnel` | `KanbanMetricsController.getFunnel` | `routes/tagRoutes.ts:25` |
| PUT/DELETE | `/ticket-tags/:ticketId/:tagId`, `/ticket-tags/:ticketId` | `TicketTagController.store/remove` | `routes/ticketTagRoutes.ts:8-9` |

**Modelo de datos (tablas):**
- `Tags` (`models/Tag.ts`, tabla `Tags`, 155 filas, **37 columnas** — la de más columnas del CRM;
  incluye color, marca kanban, orden, y campos de conversión Meta).
- `TicketTags` (`models/TicketTag.ts`) — relación ticket↔tag.
- `ContactTags` (`models/ContactTag.ts`) — relación contacto↔tag.

## Flujos clave

**Happy path — crear y aplicar una etiqueta:**
1. El usuario crea la tag (`POST /tags` con nombre + color) → `TagController.store`.
2. La asigna a un ticket (`PUT /ticket-tags/:ticketId/:tagId`) o la usa como etapa kanban.
3. El ticket aparece etiquetado en la bandeja y (si es tag kanban) en la columna correspondiente del embudo.

**Happy path — recomendación IA:**
1. El usuario invoca `POST /tags/ai-recommend` con contexto del ticket/contacto.
2. El sistema devuelve etiquetas sugeridas (cobrando créditos IA).

**Ramas de error:**
- *Eliminar una tag en uso:* borrar una tag que es etapa kanban o está asignada a tickets debe limpiar
  `TicketTags`/`ContactTags` asociados (o rechazar) para no dejar referencias colgantes.
- *Tag de otra company:* asignar `tagId` de otra company a un ticket propio debe fallar por scope
  (hoy sólo `isAuth`; el filtro de `companyId` es responsabilidad del query — Fase 2 §1).
- *Sin créditos IA:* `ai-recommend` sin saldo debe devolver error controlado, no 500.

## Deuda/bugs conocidos (Fase 2)

- **Multi-tenant sin defensa en profundidad** — todas las rutas de tags sólo montan `isAuth`; el aislamiento
  por `companyId` depende de cada query (`02-auditoria-tecnica.md` §1, patrón transversal).
- **C-1 (P0) endpoints en 500** — validar que `getMetrics`/`getFunnel` y los list de tags respondan 200 en
  la misma tanda de saneo de handlers (varios `*/list` del sistema devuelven 500).
- **M-1 (P0)** — Las tags con configuración de conversión Meta (columnas de conversión en `Tags`) alimentan
  CAPI, que falla por Graph API v19.0 expirada hasta centralizar en `v24.0`
  (`02-auditoria-tecnica.md:22,67`).
- **Tabla `Tags` sobrecargada (37 columnas)** — mezcla etiquetado, kanban y conversión Meta en un solo
  modelo; deuda de diseño a considerar antes de crecer el módulo.

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un usuario autenticado de la company X, **When** hace `POST /tags` con `{name, color}`, **Then**
   responde 200/201 y la tag creada tiene `companyId=X`.
2. **Given** una tag G y un ticket T de la company X, **When** hace `PUT /ticket-tags/T/G`, **Then** responde
   200 y existe un `TicketTags` que enlaza T con G.
3. **Given** una tag G asignada a un ticket, **When** se hace `DELETE /tags/G`, **Then** la tag se elimina y
   no quedan filas `TicketTags`/`ContactTags` huérfanas apuntando a G.
4. **Given** un usuario de la company X, **When** hace `GET /tags`, **Then** responde 200 y ninguna tag
   devuelta pertenece a otra company.
5. **Given** una company con saldo de créditos IA, **When** hace `POST /tags/ai-recommend`, **Then** responde
   200 con una lista de etiquetas sugeridas; **When** no hay saldo, **Then** responde un error controlado
   (4xx), no 500.
6. **Given** `GET /tag/kanban`, **When** un usuario lo invoca, **Then** responde 200 y sólo devuelve tags con
   marca kanban de su company, ordenadas por su campo de orden.
