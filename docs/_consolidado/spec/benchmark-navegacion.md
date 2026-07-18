# Benchmark de Arquitectura de Información — CRM Conversacionales / Help Desks

> N0.1 del [`plan/PLAN-FASE-3-NAVEGACION.md`](../plan/PLAN-FASE-3-NAVEGACION.md). Fecha: 2026-07-15.
> Objetivo: comparar la navegación de primer nivel (sidebar de agente) de 5 competidores
> para reubicar la IA de chateam. Evidencia con URL oficial por fila; "no verificado"
> donde no se pudo confirmar en fuente oficial. Complementa [`benchmark.md`](benchmark.md) (features/perf).

## Tabla comparativa

| Competidor | Nº ítems nivel-1 (agente) | Criterio agrupación | Dónde va config | Menú por rol (sí/no + cómo) | ⌘K / búsqueda global | Contenedor config/acciones |
|---|---|---|---|---|---|---|
| **Chatwoot** | ~7 | Por tarea (Conversations, Contacts, Reports) | Ícono Settings al pie del rail → páginas `/settings` | **Sí**: agente no ve Account Settings; solo ve bandejas donde es miembro; Custom Roles (Enterprise) | **Sí**: Command Bar (⌘K), context-aware | Páginas `/settings` + command bar overlay |
| **Respond.io** | ~6 | Por capacidad/módulo (Broadcasts, Workflows, Reports) | Módulo **Settings** (Workspace Settings) en el nav | **Sí**: Broadcasts solo Owners/Managers; "restricted contact visibility" limita Inbox a "Mine"; roles Owner/Manager/Agent | No verificado | Páginas de módulo |
| **Intercom** | ~7–8 | Mixto: tarea (Inbox, Tickets, Reports) + capacidad (Outbound, Help Center, Fin) | Engranaje → hub `/settings` aparte | **Sí**: seats/permissions gating (detalle exacto de menú no verificado) | **Sí**: Command-K palette maduro (navegar/acciones) | Inbox con Views ancladas (Manage > Edit sidebar); config como páginas; apps en right drawer |
| **Tidio** | ~8 | Por capacidad/módulo (Lyro, Flows, Integrations) | Sección **Settings** (con pestañas) + engranaje | Parcial: roles Owner/Admin/Operator y gating por **plan**; menú-por-rol poco documentado | Parcial: "Search actions" dentro del Inbox; ⌘K global no verificado | Páginas + Settings con tabs |
| **Wati** | ~7 | Por capacidad/módulo (Broadcast, Automations, Analytics) | **Settings** + User Management + Billing | **Sí**: Admin / Agent (Operator) / Broadcast Manager; Broadcast restringido; Chat Visibility para Operator (plan Business); gating por plan/trial | No verificado | Páginas |

## Ítems de nivel-1 (lista literal por competidor)

**Chatwoot** — `Conversations` · `Captain` (IA, si habilitado) · `Contacts` · `Reports` · `Campaigns` · `Help Center` · `Settings`

**Respond.io** — `Inbox` · `Contacts` · `Broadcasts` · `Workflows` · `Reports` · `Settings`
*(verificados en docs; podrían existir módulos adicionales de IA/Growth — no verificado)*

**Intercom** — `Inbox` · `Tickets` · `Fin / AI Agent` · `Help Center (Knowledge)` · `Outbound` · `Reports` · `Contacts` · `Settings (engranaje)`

**Tidio** — `Dashboard` · `Inbox` · `Lyro` · `Flows` · `Contacts (Customers)` · `Analytics` · `Integrations` · `Settings`

**Wati** — `Dashboard` · `Team Inbox` · `Broadcast / Campaigns` · `Contacts` · `Automations (Chatbot)` · `Analytics` · `Settings` (+ `API Docs`)

## Patrones convergentes (apuestas seguras)

1. **Inbox/Conversaciones es el ítem #1 y ancla del trabajo diario** en los 5.
2. **Contactos es siempre nivel-1** y siempre separado del Inbox.
3. **Reports/Analytics es nivel-1** en los 5.
4. **La configuración sale del flujo diario**: engranaje al pie, hub `/settings` o módulo Settings; nunca mezclada con las tareas de atención.
5. **Rango estrecho de nivel-1: 6–8 ítems.** Ninguno supera ~8 en el sidebar del agente.
6. **Diferenciación por ROL** de capacidades admin (broadcasts, settings, user management) — ocultas o restringidas a admin/manager/owner en 4 de 5 (Tidio parcial).
7. **La automatización/bot es un módulo propio de nivel-1** (Workflows, Flows, Automations, Captain, Fin).

## Divergencias (dónde difieren y por qué)

- **Criterio de agrupación**: Chatwoot e Intercom se inclinan a **tarea/trabajo**; Respond.io, Tidio y Wati a **capacidad/módulo del sistema**. Los agent-centric (soporte puro) priorizan el "job to be done".
- **Broadcasts/Campaigns como nivel-1**: presente en los WhatsApp-first (Wati, Respond, Tidio parcial); en Chatwoot/Intercom vive dentro de Campaigns/Outbound. Refleja el canal dominante del producto.
- **Command palette (⌘K) maduro** solo en los agent-centric (Intercom, Chatwoot); ausente o parcial en Tidio/Wati (más orientados a PyME/no-power-user).
- **Contenedor de config**: engranaje/página (Chatwoot, Intercom, Tidio) vs. **módulo en el nav** (Respond, Wati).

## Implicaciones para chateam

1. **104 destinos / 10 secciones triplica/cuadruplica el techo de la industria (6–8 nivel-1).** El trabajo diario real de chateam (6) ya coincide con la industria: el sidebar de agente debe colapsar a ~6–7.
2. **Los 5 sacan config del flujo diario.** Los ~88 ítems admin/config de chateam deben moverse a un hub `/settings` o engranaje, fuera del sidebar de trabajo (invariante: reubicar, no borrar).
3. **Filtrar por PLAN (88) y casi nada por ROL (16) es la causa raíz** de que agente y admin vean lo mismo. La industria gatea el **menú por ROL**: introducir gating agente vs admin sobre el mismo plan.
4. **Sin perder rutas**: reubicar los 88 bajo hub Settings/Admin visible por rol; ninguna ruta se elimina, solo cambia de contenedor y de gate.
5. **Anclar el sidebar de agente al patrón universal**: Inbox → Contactos → (Automatización) → Reports; el resto fuera del nivel-1.
6. **Añadir command palette ⌘K** para exponer las 104 rutas por búsqueda sin recargar el sidebar (uso de Intercom y Chatwoot). Mitiga "los usuarios no entienden las opciones" sin borrar destinos.
7. **Broadcasts/Campaigns merece nivel-1** (chateam es WhatsApp-first como Wati/Respond), pero visible solo para roles con permiso.
8. **El testing (no comprensión) apunta a la agrupación por capacidad/módulo actual**: migrar a agrupación por tarea/trabajo (Intercom/Chatwoot) reduce carga cognitiva.

## Recomendación de cierre — cuántos ítems de nivel-1 para el agente

**6 ítems** (techo duro 7), por convergencia de industria, no por opinión:
Respond ~6, Chatwoot ~7, Wati ~7, Intercom ~7–8, Tidio ~8 → rango 6–8, mediana ~7.
El trabajo diario ya medido de chateam es **6** (N0.3), en el extremo inferior del rango.

Sidebar de agente propuesto (patrón universal):
`Inbox` · `Contactos` · `Automatización/Bot` · `Broadcasts` (gated por rol) · `Reportes` · `Ayuda/KB`
+ `Settings` como engranaje separado (no cuenta como nivel-1) + `⌘K` para el resto de las 104 rutas.

## Fuentes

- Chatwoot Dashboard Basics — https://www.chatwoot.com/hc/user-guide/articles/1677231493-lesson-2-dashboard-basics
- Chatwoot Roles & Permissions — https://www.chatwoot.com/hc/user-guide/articles/1741923706-manage-team-access-control-with-flexible-role_based-permissions
- Chatwoot Command Bar — https://www.chatwoot.com/hc/user-guide/articles/1677697180-working-with-command-bar
- Respond.io Inbox Overview — https://respond.io/help/inbox/inbox-overview
- Respond.io Broadcasts Overview — https://help.respond.io/l/en/broadcasts-module/broadcasts-overview
- Respond.io Reports Overview — https://help.respond.io/l/en/dashboard-reporting/reports-overview
- Intercom Helpdesk — https://www.intercom.com/helpdesk
- Intercom Command-K — https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox
- Intercom Custom Views — https://www.intercom.com/help/en/articles/6588834-organize-your-help-desk-with-custom-views-and-folders
- Tidio Panel — https://help.tidio.com/hc/en-us/articles/5391464363548-Start-using-the-Tidio-panel
- Tidio Live chat conversations — https://help.tidio.com/hc/en-us/articles/5401394437020-Live-chat-conversations
- Wati Roles & Permissions — https://support.wati.io/en/articles/11463020-understanding-different-roles-and-permissions
- Wati Platform Overview — https://support.wati.io/en/articles/11375155-what-is-wati-platform-overview-and-key-features
