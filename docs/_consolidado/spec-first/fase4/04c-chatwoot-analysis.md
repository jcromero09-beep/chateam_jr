# Fase 4c — Análisis de Chatwoot para chateam_jr

> Extracción de features, **automatizaciones** y patrones de arquitectura del repo OSS de Chatwoot ([github.com/chatwoot/chatwoot](https://github.com/chatwoot/chatwoot), 34.3k★, 8.1k forks, licencia MITenterprise-dual). Método: WebFetch sobre GitHub API (metadata, `app/`, `enterprise/app/`) + docs oficiales chatwoot.com/developers.chatwoot.com. **No se clonó el repo.**
> Contraste con chateam (familia Whaticket): FlowBuilder chatbot, campañas, tickets, kanban, quick messages, IA/RAG, colas/chatbot, contactos, etiquetas, chat interno, conexiones, financiero, agendas, reportes.

---

## 1. Stack y arquitectura de Chatwoot

**Stack:** Ruby on Rails (monolito) + Vue.js/Sass frontend + PostgreSQL + Redis + **Sidekiq** (jobs) + **ActionCable** (realtime, tópico del repo). Docker/Heroku. Comparado con chateam (Node 20 + TS + Express + Sequelize + PostgreSQL + Redis + React + Socket.IO + Baileys), los dos comparten el modelo **Postgres + Redis + realtime + worker de background**, así que los patrones de Chatwoot son **portables casi 1:1** a chateam.

**Patrón clave — motor de eventos desacoplado (esto es lo que a chateam le falta).** Chatwoot organiza `app/` en capas explícitas que separan "qué pasó" de "qué hacer":

| Capa (`app/…`) | Rol | Equivalente en chateam |
|---|---|---|
| `dispatchers/` + `event_dispatcher_job.rb` | Bus de eventos central (publica `conversation.created`, `message.created`, etc.) | **No existe** — lógica acoplada en controllers/services |
| `listeners/` (12 archivos) | Suscriptores por dominio: `automation_rule_listener`, `csat_survey_listener`, `webhook_listener`, `notification_listener`, `reporting_event_listener`, `campaign_listener`, `agent_bot_listener` | Parcial (Socket.IO emite, pero sin reglas) |
| `jobs/` (Sidekiq) | Trabajo async: `auto_assignment/`, `macros_execution_job`, `trigger_scheduled_items_job`, `webhooks/`, `campaigns/`, `reporting` | chateam tiene worker (roto, ver ref) |
| `builders/` `finders/` `presenters/` `policies/` | Construcción/consulta/serialización/autorización aisladas | Mezclado en controllers |
| `services/automation_rules/` `services/macros/` `services/auto_assignment/` `services/reports/` | Lógica de negocio por feature | Servicios existen, sin motor de reglas |

**Un solo evento (`message.created`) alimenta en paralelo:** reglas de automatización, envío de webhooks, CSAT, notificaciones, métricas de reporting y campañas — **sin que ningún módulo conozca a los otros**. Ése es el diseño a adoptar.

**Multi-inbox:** `inbox` es la abstracción de canal (WhatsApp, email, web, Telegram, FB, IG, Line, TikTok…), con `inbox_member`, `agent_bot_inbox`, `inbox_assignment_policy`. La conversación pertenece a un inbox; el enrutamiento (teams/assignment/SLA) cuelga del inbox, no del canal concreto. chateam ata la lógica a la conexión de WhatsApp; Chatwoot la abstrae.

**Enterprise (licencia aparte, `enterprise/app/`):** SLA (`sla_policy`, `applied_sla`, `sla_event`), **Captain** AI (`captain/`, `copilot_thread`, `article_embedding` = RAG), `custom_role`, `agent_capacity_policy`/`inbox_capacity_limit`, `call.rb` (voz), `account_saml_settings`, audit logs. Útil como referencia de diseño aunque no se pueda copiar código.

Fuentes: [repo](https://github.com/chatwoot/chatwoot) · GitHub API `contents/app`, `contents/app/{services,models,listeners,jobs}`, `contents/enterprise/app/models`.

---

## 2. Features / automatizaciones × ¿chateam lo tiene? × acción

Leyenda acción: **IMPL** = implementar desde cero · **MEJ** = existe pero mejorar/cablear · **OK** = paridad · **EVAL** = evaluar valor local.

| # | Feature / Automatización Chatwoot | Qué hace | chateam hoy | Acción |
|---|---|---|---|---|
| 1 | **Automation Rules** (`automation_rule` + `automation_rule_listener` + `services/automation_rules/`) | Motor **evento→condiciones(AND/OR)→acciones**. Eventos: conversation_created, conversation_opened, message_created. Acciones: assign agent/team, add label, mute, snooze, resolve, send email/transcript, **send webhook**, send message/attachment | **No hay motor de reglas CRM general** (solo FlowBuilder, que es chatbot conversacional, no reglas backend) | **IMPL** ⭐ |
| 2 | **Macros** (`macro` + `macros_execution_job`) | Secuencia de acciones multi-paso ejecutada con **1 clic** por el agente (ej. asignar Sales + enviar msg + label + snooze) | No (quick messages solo insertan texto) | **IMPL** ⭐ |
| 3 | **SLA Policies** (enterprise: `sla_policy`/`applied_sla`/`sla_event`) | Metas FRT/NRT/RT, respeta business hours, marca breaches, dispara alertas | No | **IMPL** |
| 4 | **Auto-assignment / Round-robin / Balanced** (`services/auto_assignment/`, `jobs/auto_assignment/`, `assignment_policy`) | Reparte conversaciones: round-robin (equitativo), balanced (por carga), respeta **capacity limits** por agente | Colas existen; sin round-robin/capacidad real | **MEJ** |
| 5 | **CSAT surveys** (`csat_survey_response` + `csat_survey_listener` + `csat_survey_service`) | Al resolver, encuesta automática al cliente; disparo por label; reporte de score/response rate; plantillas WhatsApp | No | **IMPL** |
| 6 | **Business/Working hours** (`working_hour`) | Horario por inbox, auto-respuesta fuera de horario, pausa el reloj SLA | Parcial (agendas ≠ horario de atención por inbox) | **IMPL** |
| 7 | **Webhooks salientes** (`webhook` + `webhook_listener` + `jobs/webhooks/`) | Emite eventos a URLs externas por evento; usable como **acción** de una regla | API existe; sin webhooks de eventos salientes por regla | **IMPL** |
| 8 | **Custom Attributes** (`custom_attribute_definition`) | Campos personalizados tipados en contacto/conversación, usables en condiciones de reglas y filtros | Limitado | **IMPL** |
| 9 | **Contact segments / Custom filters** (`custom_filter`, `folder`) | Segmentos guardados y vistas filtradas reutilizables | No (listado plano) | **IMPL** |
| 10 | **Teams + routing** (`team`, `team_member`) | Equipos como unidad de asignación/reporte, separado de colas/inbox | Colas sí; teams como capa aparte no | **EVAL** |
| 11 | **Agent bots / Captain AI** (`agent_bot`; enterprise `captain/` + `article_embedding` RAG) | Bot handoff a humano; Captain sugiere respuestas, resume, corrige tono, responde desde KB | IA/RAG multi-provider **ya existe** (ventaja de chateam) | **OK** (asegurar handoff visible) |
| 12 | **Canned responses** (`canned_response`) | Respuestas predefinidas con atajos `/` | Quick messages ✓ | **OK** |
| 13 | **Reports** overview/agent/label/inbox/team/CSAT (`services/reports/`, `reporting_event` + `reporting_event_listener` + `reporting_events_rollup`) | Métricas registradas como eventos + **rollups** precalculados (no agregación en caliente) | Reportes existen; probable agregación en caliente | **MEJ** (patrón rollup) |
| 14 | **Help Center / KB** (`portal`, `category`, `article`, `kbase`) | Base de conocimiento pública multi-portal; alimenta al bot de IA | No como KB pública | **EVAL** |
| 15 | **Campaigns** ongoing + one-off (`campaign` + `campaign_listener` + `jobs/campaigns/`) | Ongoing (trigger por evento en web widget) + one-off (envío programado) | Campañas ✓ (masivos) | **OK** (falta anti-spam, ver 4b) |
| 16 | **Audit logs** (enterprise) | Registro inmutable de acciones de usuarios (compliance) | No | **IMPL** (multi-tenant sensible) |
| 17 | **Scheduled automation** (`trigger_scheduled_items_job`) | Runner periódico que dispara ítems programados (reminders, reopen, campañas) | Parcial | **MEJ** |
| 18 | **Bulk actions** (`bulk_actions_job`) | Acciones masivas async sobre conversaciones (label/assign/resolve en lote) | No | **EVAL** |

---

## 3. Top automatizaciones a adoptar (impacto × esfuerzo)

Ordenado por ROI. El motor de eventos (#0) es prerequisito y **multiplica** el valor de todo lo demás.

| Prioridad | Adopción | Impacto | Esfuerzo | Notas de implementación en chateam |
|---|---|---|---|---|
| **0** | **Bus de eventos + listeners** (dispatcher central que emite `conversation.created/opened`, `message.created`, `conversation.resolved`) | 🔴 Alto (habilitador) | M | Ya hay Socket.IO + worker; añadir un `EventDispatcher` en Node que publique a Redis/BullMQ y suscriptores por dominio. Desacopla reglas/CSAT/webhooks/reportes |
| **1** | **Automation Rules** (evento→condiciones AND/OR→acciones) | 🔴 Alto | M-L | Tabla `automation_rules(event, conditions_jsonb, actions_jsonb)`. Acciones reusan servicios existentes (assign, addLabel, sendMessage, mute, resolve, **webhook**). Es el gap #1: chateam **no tiene motor de reglas CRM** |
| **2** | **Macros** (1 clic multi-acción) | 🔴 Alto | S-M | Reusa el mismo ejecutor de acciones de las reglas; UI de botón en el ticket. Barato una vez hecho #1 |
| **3** | **Auto-assignment round-robin/balanced + capacity** | 🟠 Medio-alto | M | Extiende colas actuales con estrategia + límite por agente. Alto valor operativo (los hermanos tampoco lo hacen bien) |
| **4** | **CSAT automático al resolver** (disparo por label, reporte score) | 🟠 Medio-alto | M | Listener sobre `conversation.resolved`; plantilla WhatsApp para post-24h. Diferenciador medible |
| **5** | **Business hours por inbox + pausa SLA** | 🟠 Medio | S-M | Prerequisito de SLA; auto-respuesta fuera de horario |
| **6** | **SLA policies (FRT/NRT/RT) + breach alerts** | 🟠 Medio | M-L | Depende de #0 y #5. Diferencia B2B |
| **7** | **Webhooks salientes por evento** (como acción de regla) | 🟢 Medio | S | Cae solo con #0+#1; abre integraciones sin código |
| **8** | **Custom attributes + segments/filters** | 🟢 Medio | M | Potencia condiciones de reglas y campañas segmentadas |

**Camino recomendado:** #0 → #1 → #2 en una sola ola (comparten el ejecutor de acciones), luego #3–#5, después SLA. El 80% del valor "automatización CRM" sale de #0+#1+#2.

---

## 4. Cosas que Chatwoot resuelve mejor (correcciones para chateam)

1. **Motor de reglas backend ≠ chatbot.** chateam confunde automatización con FlowBuilder (flujo conversacional cara al cliente). Chatwoot separa: FlowBuilder-equiv = agent bot; **Automation Rules = reglas de negocio server-side** que actúan sobre cualquier conversación (asignar, etiquetar, notificar, webhook) sin hablar con el cliente. chateam necesita **ambas capas**, hoy solo tiene una. → adoptar #1.

2. **Desacople por bus de eventos.** En Chatwoot un `message.created` alimenta reglas, CSAT, webhooks, notificaciones y reporting **en paralelo y sin acoplamiento**. En forks Whaticket esta lógica típicamente vive incrustada en el handler del mensaje, lo que hace frágil agregar features. → adoptar #0 primero.

3. **Reporting como eventos + rollups** (`reporting_event`, `reporting_events_rollup`) en vez de agregar en caliente. Esto es exactamente el problema que ya documentaste en otros proyectos (dashboards >10s por agregación sobre datos crudos). Chatwoot **registra el evento de métrica en el momento** y precalcula rollups → dashboards O(1). → adoptar patrón en #13.

4. **Canal abstraído (inbox) vs conexión.** Enrutamiento, teams, SLA y assignment cuelgan del `inbox`, no del WhatsApp concreto. Permite email/web/Telegram con **la misma** lógica de asignación. chateam ata reglas a la conexión Baileys/Cloud. → refactor de mediano plazo hacia "inbox".

5. **Capacity-aware assignment.** Round-robin que **salta al agente saturado** (límite de capacidad). Evita repartir a quien ya está full — algo que las colas simples de chateam no contemplan. → incluir en #3.

6. **CSAT con higiene de métricas.** Disparo por label (excluye spam/internos) y Review Notes internas por respuesta. Mantiene el score limpio. → incluir en #4.

7. **Audit logs** para multi-tenant (compliance). Dada la sensibilidad multi-tenant ya conocida en tu infra, es una brecha de gobernanza. → #16.

**Dónde chateam ya va adelante (no copiar):** IA/RAG multi-provider ya existe (Captain es enterprise en Chatwoot), coexistencia Baileys↔Cloud API, UGC/video IA, Meta Ads/CAPI, afiliados, créditos IA prepago. El gap real de chateam **no es features de canal, es el motor de automatización CRM y el desacople por eventos.**

---

## Fuentes
- Repo y metadata: https://github.com/chatwoot/chatwoot · GitHub API `repos/chatwoot/chatwoot`, `contents/app`, `contents/app/services`, `contents/app/models`, `contents/app/listeners`, `contents/app/jobs`, `contents/enterprise/app/models`
- Automation Rules: https://www.chatwoot.com/features/automations · https://www.chatwoot.com/hc/user-guide/articles/1677689800-how-to-use-automation
- Macros: https://www.chatwoot.com/hc/user-guide/articles/1679978392-how-to-use-macros
- Assignment/Round-robin/Capacity: https://www.chatwoot.com/features/assignments/ · https://www.chatwoot.com/hc/user-guide/articles/1763978164-chatwoot-assignment-v2
- CSAT: https://www.chatwoot.com/features/csat-reports/ · https://www.chatwoot.com/hc/user-guide/articles/1677693868-how-to-read-csat-reports
- Reports: https://www.chatwoot.com/hc/user-guide/en/categories/reports
- Captain AI: https://www.chatwoot.com/captain
- Webhooks: https://www.chatwoot.com/hc/user-guide/articles/1677693021-how-to-use-webhooks
- API automation-rule: https://developers.chatwoot.com/api-reference/automation-rule/add-a-new-automation-rule
- Changelog / release audit log: https://www.chatwoot.com/changelog · https://www.chatwoot.com/blog/v2-16/
