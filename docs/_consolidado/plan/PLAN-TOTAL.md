> ## ⚠️ HISTÓRICO / DESACTUALIZADO (2026-07-17)
> **NO confíes en los checkboxes.** Las Fases B/C (Design System MUI) se ejecutaron con
> otro stack (Tailwind/shadcn/Radix, Ola G de PLAN-FASE-2); las Fases D/F tienen ítems
> ya hechos marcados `[ ]` (E2E 9/9, PM2 resurrect, limpieza 54MB). Contradicciones internas
> (ej. E.4 Automation Rules `[ ]` pero su propio PROGRESO dice hecho).
> Estado real y plan vigente: **`docs/PLAN_INTEGRAL_OLAS_2026_07.md`**.

# PLAN-TOTAL de Integración y Desarrollo — chateam_jr

> **El "cómo".** Fases ordenadas por dependencia, con checkboxes, priorizadas por impacto/severidad. Deriva de la auditoría de 16 dominios (`AUDITORIA_2026_07/`) + Playbook Spec-First (`SPEC-FIRST/`) + `/spec` consolidado. **Nada de código de producto sin spec + este plan aprobados.**
>
> Fuentes: `spec/SPEC.md`, `spec/modules/*`, `spec/design-system.md`, `spec/benchmark.md`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md`, `AUDITORIA_2026_07/99-sintesis/RESUMEN.md`.
>
> Veredicto de partida: **CRÍTICO** — bloqueadores de confianza (seguridad/pagos) antes de cualquier crecimiento. Estrategia (benchmark): **cerrar gaps de confianza y empaquetar lo que ya existe**, no añadir features.
>
> Responsables: skill/agente sugerido entre `()`. Esfuerzo: S (horas) · M (1-3 días) · L (semana+).

---

## PROGRESO DE EJECUCIÓN (2026-07-12) — todo en vivo en padeldev, sitio nunca cayó
- **OLA 0 ✅** — privesc/ATO `PUT /users` cerrado · fuga `/companies` (scope real + exclude) · fuga `/settingsFacebook` · **verificado con sonda** (perfil `user` → 403/sin secretos). Pendiente JC: rotar `facebookAppSecret` en Meta.
- **FASE A ✅** — worker de colas arriba · **13/13 endpoints 500** (rutas/isAuth/tsx-cjs/req.user/lodash/col ambiguo + 3 migraciones de schema: tabla `UserTermsAcceptances`, `AICreditTypes.category`, retipado `TicketTrakings.{ratingAt,closedAt,chatbotAt}`) · `/contacts/list` cap 500 (P-1) · **webhooks Stripe/PayPal fail-closed** (S-4/S-5, forjados → 400) · CI (`jest.integration.config.cjs`) · limpieza 54 MB.
- **FASE B ✅** — primario canónico **teal `#14B8A6`** (`ThemeContext`/`chateamTheme`), verificado con screenshots.
- **FASE C (en curso)** — fondos de chat WebP (**Tickets 1591→376 KB, −76%**) · `prefers-reduced-motion` · skip-link + `nav` landmark + `id=main-content` (AppLayout) · Login "¿Olvidaste?" → botón accesible · aria-labels barra de Tickets. *(Pendiente: resto de IconButtons por pantalla, unificar acentos de componentes.)*
- **FASE D (parcial)** — sourcemaps fuera de prod (`vite.config`) · **lazy-load de 101 páginas** (`App.tsx` → `React.lazy` + `Suspense`): **entry 2815 KB → 247 KB (−91%)**, 232 chunks, páginas pesadas on-demand · **nginx: assets pre-gzip -9 servidos por `gzip_static`** (entry 247→73 KB transferido) **+ `Cache-Control immutable` 1 año** en `/assets/` e `index.html` `no-cache`. *(brotli NO compilado en este nginx → usar gzip_static; instalar `ngx_brotli` daría ~15-20% extra. El pre-gzip debe re-generarse tras cada build del frontend.)*
- **FASE E — MVP motor de reglas ✅** (spec-first) — `spec/modules/automation-rules-spec.md` + tabla `AutomationRules` (migración+índice `automationrules_company_event`) + modelo `AutomationRule` + evaluador `RunTicketAutomationRules` (eventos/condiciones AND/acciones `assign_user|set_queue|add_tag|send_message-diferido`, **todo aislado en try/catch → nunca rompe el ticket**) + CRUD `AutomationRuleController` (admin-gated) + rutas `/automation-rules` (isAuth) + **hooks de los 3 eventos**: `ticket_created` (`CreateTicketService`) y `ticket_status_updated`/`ticket_queue_updated` (`UpdateTicketService`, en el happy-path L1008 comparando `oldStatus`/`oldQueueId`, antes del emit para que el socket refleje reasignaciones/tags). **Verificado E2E**: RBAC (`user`→403, `admin`→201, event inválido→400); `created`→reasignó `userId 1→2`; `queue_updated` (PUT queueId)→reasignó a `userId 2`; `status_updated` con condición `status eq pending`→reasignó a `userId 61`. Datos de prueba limpiados.
- **FASE E — UI de reglas ✅ desplegada** — `frontend/src/pages/AutomationRules.tsx` (MUI Joy, patrón Tags): lista con toggle activa/prioridad, modal crear/editar con **condiciones dinámicas** (campo/operador/valor) y **acciones dinámicas** con selectores reales de agente/cola/etiqueta (fetch `/users`,`/queue`,`/tags`). Ruta lazy `/automation-rules` + ítem de menú "Automatizaciones", ambos gateados por módulo **`settings`** (admin/super escritura, supervisor solo-lectura, user sin acceso — evita editar la matriz de permisos y su union TS). Build `vite build --outDir dist_stage` (21s, entry 253/74.6 KB gz) → pre-gzip -9 manual → **swap seguro** (dist→dist_bak_faseE, stage→dist) → verificado en vivo (SPA 200, asset gzip+immutable, chunk `AutomationRules` 200). *(Pendiente E: acción `send_message` real (difería para no tocar el path WhatsApp), macros/SLA/CSAT/bus de eventos, comercio conversacional E.5.)*
- **PERF BD — 19 índices FK ✅** (`CREATE INDEX CONCURRENTLY`, 0 inválidos, ANALYZE) en hot-paths sin índice: `Messages`(ticketTrakingId/contactId/queueId), `Tickets`(userId/queueId/whatsappId/integrationId/queueOptionId), `TicketTrakings`(ticketId/companyId/queueId/userId/whatsappId), `LogTickets`(ticketId/userId/queueId), `Contacts`(whatsappId), `CampaignMessages`(messageId/whatsappId). Verificado: `Tickets WHERE userId` pasó de Seq Scan → **Index Scan `idx_Tickets_userId`**. *(Quedan FKs sin índice en tablas <200 KB, bajo impacto.)*
- **FASE E — acción `send_message` real ✅** — usa `sendTicketText` (`CoexistenceAwareTextSender`, router agnóstico Meta/Baileys/coexistencia, persiste el Message). Con sesión DISCONNECTED devuelve `ok:false` sin lanzar → **verificado: ticket se creó igual pese al envío fallido** (motor fail-safe). UI actualizada (label "Enviar mensaje").
- **A11Y (Fase C cont.) — 37 aria-labels ✅** en 8 pantallas top (MessageInput 13, QuickReplies 8, AppLayout 4, Contacts/Users/Queues/ContactDrawer/Dashboard) vía subagente; tsc-limpio; respetó los que ya tenían title/aria-label. Rebuild + `.gz -9`/`.br -11` + swap seguro, verificado en vivo.
- **PERF nginx — Brotli ✅ en vivo** — módulos Debian `libnginx-mod-http-brotli-{static,filter}` (nginx host `1.22.1-9+deb12u2`, --with-compat) instalados vía **`dpkg -i`** (apt fallaba por conflicto AJENO libnode-dev↔libssl-dev). Directivas **scoped solo al vhost padeldev** (`brotli on` + `brotli_static on` en `/assets/`), `.br -11` pre-generados (Node zlib, 74.8% reducción; entry 63.6 KB br vs 74.6 KB gz, ~15% mejor). `nginx -t` OK + reload sin downtime; verificado `enc=br` con gzip como fallback; otros vhosts intactos (billiedev 200).

> Caveat webhooks: al ser fail-closed, para pagos LEGÍTIMOS en producción hay que configurar `STRIPE_WEBHOOK_SECRET` / `PAYPAL_WEBHOOK_ID` + creds en la Company del super-admin.

---

## OLA 0-bis — Fuga cross-tenant en reportes (HALLADA Y CERRADA 2026-07-15) · horas

> **No estaba en ninguna auditoría previa.** Apareció al depurar los 500 de C-1: el 500 era el
> *síntoma*, no el bug. Severidad real: **exposición pública de datos de todas las empresas**.

- [x] **0b.1** ✅ `GET /dashboard/ticketsUsers` y `/dashboard/ticketsDay` estaban **sin `isAuth`**
      (`routes/dashboardRoutes.ts`) **y** el controlador tomaba `companyId` del **query string**
      (`DashbardController.reportsUsers/reportsDay`). Combinado ⇒ **cualquiera sin token** podía leer
      los reportes de **cualquier empresa** enumerando `?companyId=N`.
      **Verificado antes**: `?companyId=8` sin token → `200` con nombres reales de agentes de otra
      empresa. **Verificado después**: → `401`. Con token, `?companyId=8` devuelve **solo** los datos de
      la empresa del JWT (el query se ignora).
- [x] **0b.2** ✅ `GET /campaigns/list` (`CampaignController.findList`) tenía `isAuth` pero **ignoraba
      `req.user`** y leía `companyId` del query ⇒ un usuario autenticado podía listar campañas de otra
      empresa. Ahora `companyId` sale del token. Además cerraba en 500 si faltaba el parámetro.
- [x] **0b.3** ✅ **Inyección SQL** en `ReportService/TicketsAttendance.ts` y `TicketsDayService.ts`:
      `initialDate`/`finalDate` venían del query e **interpolados crudos** en el SQL
      (`'${initialDate} 00:00:00'`). Migrado a **consultas parametrizadas** (`replacements`) + validación
      `YYYY-MM-DD` con rango por defecto (mes en curso). Esto además eliminó el 500 cuando faltaban fechas.
      Verificado: payload `' OR '1'='1` → `200` (neutralizado), antes habría roto el SQL.
- [x] **0b.4** ✅ **El bug era SISTÉMICO — auditado el resto y cerrados 2 más** (verificado con cuenta
      no-super `qa-role-agent` de company 1 pidiendo company 8):
      - `UserController.list` — `?companyId=8` devolvía **nombres + EMAILS (PII)** de otra empresa
        (`CARLOS PACHECO, charlie123088@gmail.com`). Ahora el override por query es **solo para `super`**.
      - `QueueController.index` — idéntico, devolvía las colas ajenas. Mismo fix.
      - `AICostController.getAIByCompany` → ya protegido (401 "Acesso não permitido") ✓
      - `SettingController.getPublicTerms` → `companyId` del query es **correcto** (documentos públicos) ✓
      - `SettingController` (228/411) → ya guardado por `requestUser?.super` ✓
      **Post-fix**: `?companyId=8` devuelve solo datos de company 1. Gate VERDE.
- **Regla derivada (para el resto del código)**: `companyId` **SIEMPRE del token, NUNCA del query**.
  Auditar el resto de controladores que hagan `req.query as ...Params` con `companyId`.

## OLA 0 — Contención inmediata (exposición pública en vivo) · horas
> El sistema está público en https://padeldev.codigo.plus con secretos reales y RBAC roto. Estos 3 son **explotables hoy** (confirmados con sonda). Ejecutar YA o cortar la salida pública hasta parchear.

- [x] **0.1** ✅ **VERIFICADO 2026-07-15** (sonda con cuenta no-super `qa-role-agent`) → `/companies` con perfil `user` responde 200 **sin** `stripeSecretKey/paypalSecretKey/facebookAppSecret`. ~~`GET /companies` filtra~~ `stripeSecretKey/paypalSecretKey/facebookAppSecret` a cualquier `user` (S-2) → añadir `attributes:{exclude:[...secretos]}` en `ListCompaniesService` + `isSuper` en `routes/companyRoutes.ts:8`. *(security-auditor)*
- [x] **0.2** ✅ **VERIFICADO 2026-07-15** (sonda con cuenta no-super `qa-role-agent`) → `/settingsFacebook` devuelve solo `{facebookAppId}`, sin `appSecret`. **Pendiente JC: rotar el secreto en Meta.** ~~`GET /settingsFacebook` expone~~ `facebookAppSecret` real (S-3) → gating por rol + **rotar** el secreto `8820dee9…` en Meta. *(security-engineer)*
- [x] **0.3** ✅ cerrado (guard `requesterPrivileged` en `UpdateUserService`; verificado en Ola 0). ~~`PUT /users/:id` privesc~~/ATO (S-1) → restaurar check de rol en `UserController.update` (`:323-325`) + lista-blanca en `UpdateUserService`. *(security-auditor)*
- [x] **0.4** ~~(mitigación temporal)~~ **NO aplica**: 0.1–0.3 parcheados en origen, no hace falta el bloqueo en vhost. bloquear en el vhost de padeldev `location = /be/companies` y `/be/settingsFacebook` para no-super, o `deny` de `/be/internal`, mientras se parchea. *(devops-troubleshooter)*
- **Aceptación**: sonda `probe.mjs` re-ejecutada → `user` recibe 403 en esos endpoints y 0 secretos en payloads. *(ref `spec/acceptance/super-admin.md`)*

---

## FASE A — Estabilización / quick wins · M
> Dejar el sistema sano, medible y sin bloqueadores de arranque. Reutiliza `plan/PLAN.md` (Fase 0-1 previas).

**A.1 Correctitud / arranque**
- [ ] Rematar worker de colas: `worker.ts:27` → `await startQueueProcess()` + `pm2 restart chateam-worker` (jobs Campaign/GenerationPoll ya migrados a `await import`). *(debugger)*
- [ ] Declarar `whatsapp-rust-bridge@0.5.4` en `package.json` + `patch-package` del `exports` (C-2). *(dependency-manager)*
- [ ] Migrar `xlsx` a `exceljs` o fork con fix del CVE (C-3). *(dependency-manager)*
- [~] **C-1 endpoints 500 — mayoría cerrada 2026-07-15.** Sonda: `/tickets/counts`, `/invoices/list`, `/contacts/list`, `/campaigns/list`, `/dashboard/ticketsUsers`, `/dashboard/ticketsDay` → **todos 200**. Los 3 últimos se arreglaron hoy y **destaparon una fuga cross-tenant sin autenticar** (ver OLA 0-bis abajo). **Quedan** (de sondas propias): `/ugc/creators` 500 · `/meta-marketing/rules` 500 · `/meta-marketing/ai/copy` 404+500 · `/meta-marketing/test-connection` 400 · `/company` 404 · `/appointments` **404 por doble prefijo** (`routes/index.ts:570` monta `/appointments` y `appointmentRoutes.ts:41` declara `/appointments` otra vez). ~~Depurar los 13 endpoints en 500 (C-1)~~ uno a uno (`/tickets/counts`, `/dashboard/ticketsUsers|ticketsDay`, `/campaigns/list`, `/invoices/list`, `/ai/credits/*`, …). *(debugger)*
- [ ] `/contacts/list` → usar `ListContactsService` paginado (P-1, riesgo OOM). *(performance-engineer)*

**A.2 Seguridad de pagos y webhooks (P0 restantes)**
- [ ] Webhook Stripe: rechazar si falta `STRIPE_WEBHOOK_SECRET`; nunca `JSON.parse` sin `constructEvent` (S-4). *(payment-integration)*
- [ ] Webhook PayPal: verificar firma (transmission-id/cert) antes de procesar (S-5). *(payment-integration)*
- [ ] Provisión de créditos IA idempotente por id de evento (S-10). *(payment-integration)*
- [ ] Eliminar/gated `MASTER_KEY` (S-6). *(security-auditor)*
- [ ] Montar `authLimiter`/`signupLimiter` en `/api/auth/login|signup` (P1-4). *(security-engineer)*
- [ ] Meta webhook `META_SIGNATURE_MODE=enforce` + verify token fuerte (S-8). *(ver `plan/PLAN.md#meta`)*

**A.3 CI / config / higiene**
- [ ] Reparar CI: crear `jest.integration.config.js` (falta → `test:integration` y deploy rotos); correr type-check/lint/test en pipeline (T-1). *(git-workflow-manager)*
- [ ] `.env.example` completo (192 vars detectadas), README y AGENTS.md al día. *(technical-writer)*
- [ ] Borrar 54 MB de builds muertos (`dist_orig_appro`, `dist_verify_tmp`) y 22 `.bak/copy/OLD`. *(unused-code-cleaner)*
- [ ] Fijar entrypoint canónico `server-distributed.ts` y documentar deuda de los 3 servers. *(backend-architect)*
- **Aceptación**: `npm run type-check` limpio, CI verde, worker `online`, 0 endpoints 500, `probe.mjs` sin P0.

---

## FASE B — Design System + IA de menú · M
> Fuente única de marca y navegación ordenada. Base para el rediseño. Ref: `spec/design-system.md` + `SPEC-FIRST/fase3/design-tokens.json`.

- [ ] Consolidar el theme: primario **teal `#14B8A6/#2DD4BF`** (hoy default azul `#3b82f6` en `chateamTheme.ts:419` choca con fondos teal). Aterrizar `design-tokens.json` en `frontend/src/theme/`. *(ui-designer)*
- [ ] Reducir sprawl: de **38 colores/pantalla → ≤12**; 1-2 tipografías (hoy 4); escala de tamaños/espaciado/radios única. *(design-system skill)*
- [ ] Componentes base con estados (hover/focus/disabled), grilla 12-col (`repeat(auto-fit,minmax(280px,1fr))`) para simetría. *(ui-designer)*
- [ ] Implementar la nueva IA de menú: **10 secciones/3 niveles → 9 grupos/2 niveles** (Bandeja/Organización arriba; Marketing/IA/Config/Canales colapsables; Sistema solo super) — mapa viejo→nuevo en `design-system.md`. *(frontend-developer)*
- [ ] Unificar librerías duplicadas: 1 toast (sonner), 1 gráficas, quitar MUI Material o Joy (hoy ambos). *(refactoring-specialist)*
- **Aceptación**: sonda A.1 en 3 pantallas → ≤12 colores, ≤2 fonts; menú con máx 2 niveles; storybook/tokens versionados.

---

## FASE C — Rediseño pantalla por pantalla · L
> Aplicar el design system a cada módulo SIN romper funcionalidad. Orden por frecuencia de uso.

- [ ] Bandeja/Tickets (hot path) → grilla, densidad, estados, quitar fondos PNG 1.5 MB. *(ref `spec/modules/tickets-spec.md`)*
- [ ] Dashboard → 12-col simétrica (hoy 13 bordes-izq/9 anchos), tarjetas KPI consistentes.
- [ ] Contactos, Conexiones, Campañas, Kanban/Funnel, Citas, Etiquetas, Config → aplicar tokens + a11y.
- [ ] **A11y por pantalla** (P0 de `12-accesibilidad`): `aria-label` a los 473 IconButton, onClick→`button`, skip-link + landmark `nav`, validación con `FormControl error`, `eslint-plugin-jsx-a11y` en CI. *(ui-ux-designer)*
- **Aceptación**: axe por pantalla < 3 violaciones serias; sonda A.2 grilla alineada; funcionalidad intacta (E2E).

---

## FASE D — Optimizaciones técnicas · L
- [ ] Frontend: code-splitting (103 páginas eager → lazy), sacar chunk `charts` del preload global, brotli + `Cache-Control immutable` en nginx padeldev, quitar sourcemaps de prod (bundle 2.75 MB → objetivo <1 MB inicial). *(web-vitals-optimizer)*
- [ ] Backend: N+1 y crons fuera del event loop del nodo web; cache Redis en Dashboard/Statistics; quitar `console.log` de payloads y del hot path WA (1918 `console.*`). *(performance-engineer)*
- [ ] BD: 152 FKs sin índice, `LogTickets` (225K) sin `companyId`/índices, política de retención; índices ANN en embeddings. *(postgres-pro)*
- [ ] TS `strict` por etapas; reducir `any` (2.902 backend); romper god-object `wbotMessageListener.ts` (7.501 líneas) y 49 ciclos de lógica. *(refactoring-specialist)*
- [ ] Cifrar secretos en BD (tokens Meta/FB/TikTok, `stripeSecretKey`) con AES-256-GCM (S-9). *(security-engineer)*
- [ ] Meta: centralizar versión Graph API en `config/metaGraph.ts` (ver `plan/PLAN.md#meta`, v19 expirada). *(backend-architect)*
- [ ] Observabilidad: montar `/metrics`, heartbeat del worker + watcher, Sentry `setupExpressErrorHandler`, pino JSON + traceId, alertas clave (O-1). *(monitoring-specialist)*
- [ ] **Bus de eventos desacoplado (patrón Chatwoot, prerequisito de automatizaciones)** — ref `SPEC-FIRST/fase4/04c-chatwoot-analysis.md`: dispatcher central + listeners independientes (`message.created`/`ticket.updated` → reglas + CSAT + webhooks + notificaciones + **reporting-as-events**). Sustituye el acoplamiento actual del god-object `wbotMessageListener`. Habilita reportes por rollups (mata la agregación en caliente que hace lentos los dashboards). *(backend-architect)* — **L**
- **Aceptación**: LCP móvil <2.5 s; pool DB sin saturar; `/metrics` sirviendo; alerta dispara si el worker cae; un evento dispara N listeners sin acoplarse.

---

## FASE E — Cierre de gaps competitivos · L
> Ref: `spec/benchmark.md` (líderes) + benchmarks `04b` (hermanos Whaticket) · `04c` (Chatwoot) · `04d` (MB Suite) · `04e` (ChatPion) · `04f` (WhatsJet) · `04g` (WhatsWay).
> **FUENTE DE VERDAD: `SPEC-FIRST/fase4/04h-paridad-verificada.md`** — matriz de 52 features contrastadas contra el código real de chateam (TIENE/PARCIAL/NO). Solo se listan aquí los **gaps CONFIRMADOS**. Ya se descartaron los falsos gaps: chateam YA tiene voz-IA (`RealtimeAudioService`+ElevenLabs), RAG en Postgres, comentario→DM private reply, idempotencia (`InboundEventLedger`), Embedded Signup, toggle IA por contacto, flow builder, atribución básica.

**E.1 Gaps vs líderes de mercado (Chatwoot/Respond.io/Intercom)**
- [ ] Reporting/analytics funcional (hoy 500s + stubs) — paridad con Chatwoot/Respond.io. *(data-analyst)*
- [ ] Compliance/seguridad como feature vendible (cerrada la Ola 0/A) — barrera de entrada; ningún rival la tiene abierta. *(compliance-auditor)*
- [ ] Onboarding guiado + marketplace/integraciones (gap vs líderes). *(product-manager)*
- [ ] Empaquetar créditos IA prepago vs "AI meter" ($0.99-2/resolución de Fin/Zendesk) como diferenciador de precio.

**E.2 Módulos operativos del benchmark de HERMANOS (Whaticket family) — los que faltan y el mercado local valora**
> Cada uno requiere spec de módulo + criterios de aceptación ANTES de codificar (crear en `spec/modules/`).
- [ ] **Canal de llamadas de voz** (WhatsApp + en vivo). NOTA (04h): la **voz con IA YA existe** (`RealtimeAudioService`+ElevenLabs); el gap es el **canal/UX de llamadas** y su registro. *(websocket-engineer)* — **M**
- [ ] **Canal SMS** (agenteia "SMS y Llamadas"): proveedor SMS + envío/recepción. *(backend-architect)* — **M**
- [ ] **Gmail / Email entrante conversacional** (superizing/agenteia): distinto del Email Marketing saliente que ya existe. *(backend-architect)* — **M**
- [ ] **Panel de Atendimentos** (monitor de asesores en vivo — isabox/autoatende): vista supervisor tiempo real (apalanca el rol `supervisor`). *(fullstack-developer)* — **M**
- [ ] **Plantão / turnos-guardias** de agentes (autoatende): asignación por horario/guardia. *(backend-architect)* — **M**
- [ ] **Tareas / ToDoList** por ticket/agente (isabox/superizing "Tasks"). *(fullstack-developer)* — **M**
- [ ] **Sectores** además de Colas (isabox "Filas e Setores"): jerarquía organizativa — evaluar necesidad. *(backend-architect)* — **S**
- [ ] **Anti-spam en masivos con rotación de QR** (agenteia): endurecer Campañas (throttling, rotación de conexión, warm-up). *(backend-architect)* — **M**
- [ ] **Agente IA conversacional visible** (Gemini+ChatGPT, "Talk.Ai"/"Open.Ai"): asegurar paridad de UX del agente IA (chateam ya tiene multi-provider + RAG). *(nlp-engineer)* — **S**
- [ ] **Export de datos** de un clic (superizing) — además de arreglar el export de contactos en 500. *(backend-developer)* — **S**

**E.3 Proteger diferenciadores (NO los copian los hermanos)**
- Coexistencia Baileys↔Cloud API, UGC/IA video, Meta Ads+CAPI, Afiliados, Créditos IA con panel de costos → mantener y destacar en marketing.
- **Ser el único de la familia con design system consistente (Fase B)** — el sprawl de color (29-39 colores) es endémico en TODOS los hermanos; nadie lo resolvió = ventaja barata.

**E.4 Automatizaciones y features CRM (benchmark Chatwoot + MB Suite)**
> Refs: `SPEC-FIRST/fase4/04c-chatwoot-analysis.md` y `04d-mbsuite-analysis.md`. **Requieren el bus de eventos de Fase D como base.**
- [ ] **Motor de Automation Rules** (evento→condiciones AND/OR→acciones: asignar, etiquetar, silenciar, resolver, enviar mensaje, webhook) — gap #1 vs Chatwoot; complementa (no reemplaza) FlowBuilder. *(backend-architect)* — **L**
- [ ] **Macros** (secuencia de acciones de 1 clic sobre un ticket). *(backend-developer)* — **M**
- [ ] **Auto-asignación / round-robin** por cola + capacidad de agente. *(backend-architect)* — **M**
- [ ] **SLA policies** (tiempos objetivo de 1ª respuesta/resolución + alertas de incumplimiento). *(backend-architect)* — **M**
- [ ] **CSAT** (encuesta de satisfacción post-cierre + reporte) — hoy satisfacción 0% en el dashboard. *(fullstack-developer)* — **M**
- [ ] **Sequences / cadencias** (drip con delays y ventanas de envío — Chatwoot + MB Suite). *(backend-architect)* — **M**
- [ ] **Web Forms** embebibles (captura de leads → contacto/ticket — MB Suite). *(fullstack-developer)* — **M**
- [ ] **Knowledge Base / Help Center público** (self-service — Chatwoot + MB Suite). *(documentation-engineer)* — **M**
- [ ] **Reportes as-events + rollups** (overview/agente/etiqueta/CSAT) — arregla dashboards lentos + los 500s. *(data-analyst)* — **M**
- [ ] **Atribución de ingresos multi-fuente** (UTM/origen de lead, más allá de FB CAPI — MB Suite). *(data-analyst)* — **M**
- [ ] **Portal white-label / multi-cuenta de agencia** (chateam se vende como reseller — MB Suite). *(saas-architect)* — **L**
- [ ] **Agentes IA con function-calling sobre datos CRM** (consultar métricas, crear tareas, generar respuestas — MB Suite; chateam ya tiene RAG). *(nlp-engineer)* — **M**
- **Fuera de alcance** (NO adoptar): Paid Media/SEO/Social Planner/Auto-Budget de MB Suite — chateam es CRM omnicanal de soporte, no gestor de pauta.

**E.5 Comercio conversacional + SaaS/venta (ChatPion + WhatsJet, verificados en 04h)**
- [ ] **Comercio conversacional en WhatsApp**: catálogo→carrito→checkout dentro del chat (ChatPion). El gap más grande de producto. *(fullstack-developer)* — **L**
- [ ] **Cupones/descuentos** (chateam: 0). *(backend-developer)* — **M**
- [ ] **Recordatorio de carrito abandonado** + re-engagement estilo OTN adaptado a plantillas WABA. *(backend-architect)* — **M**
- [ ] **Business-hours del bot/IA** (hoy solo `outOfHoursMessage` por cola; falta apagar bot/IA fuera de horario — WhatsJet). *(backend-developer)* — **S**
- [ ] **Requeue de campañas fallidas** (reintentar destinatarios en error — WhatsJet). *(backend-developer)* — **S**
- [ ] **Manual subscriptions** (activar plan sin tarjeta — venta SaaS LATAM — WhatsJet). *(saas-architect)* — **S**
- [ ] **Impersonation / login-as-tenant** para soporte (WhatsJet). *(security-engineer)* — **S** *(con auditoría)*
- [ ] **Bulk tag / acciones masivas** sobre contactos/tickets (ChatPion/Chatwoot). *(backend-developer)* — **S**
- [ ] **API pública v1 con API keys scoped** (hoy parcial, sin `/v1` ni keys — WhatsWay). *(api-designer)* — **M**
- [ ] **Webhooks salientes** configurables por tenant (WhatsWay). *(backend-architect)* — **M**
- [ ] **Template analytics + health/quality/tier de Meta** (hoy solo sync+status — WhatsJet). *(backend-developer)* — **S**

**E.6 Patrones de arquitectura a adoptar (WhatsWay TS moderno, 04g/04h)**
- [ ] Capas **controller→service→repository** explícitas al refactorizar (romper god-objects — cruza con Fase D). *(refactoring-specialist)*
- [ ] **Schema-first + validación Zod** en bordes; evaluar Drizzle para módulos nuevos. *(typescript-pro)*
- [ ] **Idempotencia por unique-index** como estándar (chateam ya lo hace en `InboundEventLedger`; extender a pagos/créditos — cierra S-10). *(backend-architect)*
- **Anti-patrones a EVITAR** (vistos en los nulled): schema monolítico único, doble capa realtime (ws + Socket.IO con globals), secretos en claro en BD (chateam ya lo sufre — cifrar, Fase D).

- **Aceptación (toda la Fase E)**: cada módulo nuevo con spec en `spec/modules/` + criterios `spec/acceptance/` + tests antes de codificar. Priorizar por demanda comercial real de JC: **automatización (E.4)** y **comercio conversacional (E.5)** suelen ser lo más vendible.

---

## FASE F — Verificación y despliegue · M
> **PROGRESO (2026-07-13):**
> - ✅ **Smoke RBAC** `tests/rbac-smoke.mjs` — re-testea los 3 P0 (privesc `PUT /users`, secretos `/companies`, `facebookAppSecret /settings/facebook`) como usuario no-privilegiado (`christian`, perfil user). **VERDE** (todos cerrados).
> - ✅ **PM2 resurrect** — `chateam-node`+`chateam-worker` ya en `~/.pm2/dump.pm2` (antes NO → morían en reboot); `pm2-jcromero09.service` systemd enabled. Sobreviven reboot.
> - ✅ **`npm audit`** (backend, prod): antes 42 vulns (2 crit). **Migradas las 2 críticas**: eliminado `request@2.88.2` (deprecado: SSRF + form-data unsafe-random) → único uso (`wbotMessageListener.ts`, POST a n8n) migrado a **axios** (auto-JSON/gzip/≥400). `npm install` podó 39 paquetes. **Ahora `crit=0`** (total 39). Node re-arranca OK, gate verde. **`xlsx` (C-3)**: en vez de reescribir 8 archivos a exceljs (alto riesgo), se aplicó la remediación oficial de SheetJS → `xlsx@0.20.3` desde su **CDN** (`https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz`), **misma API → cero cambios de código**, fix de prototype-pollution + ReDoS. Verificado: carga 0.20.3, API intacta, round-trip OK, high de xlsx fuera del audit (high 18→17, total 38). Highs con fix restantes se difieren (semver-safe, requieren la suite para bump seguro).
> - ✅ **Cuenta QA** `qa-agent@chateam.com`/`QaAgent.2026` (super, company 1) para no revocar la sesión web real (política sesión única).
> - ✅ **E2E Playwright** (`playwright.live.config.ts` + `tests/e2e/`, sin webServer, contra padeldev vivo): **9/9 verde** — `login.spec` (navegador: UI→dashboard sin errores CORS/red — habría cazado el bug de URL horneada), `rbac.spec` (3 P0 negativos), `automation-rules.spec` (CRUD + gating admin, Fase E). Scripts: `npm run test:e2e:live`, `test:smoke:rbac`.
> - ✅ **a11y axe** (`tests/e2e/a11y.spec.ts`, WCAG 2.0/2.1 A+AA): **críticas=0** en login y dashboard (gate duro). Pendiente menor: 1 `serious` `color-contrast` en ambas (advertencia, no bloquea).
> - ✅ **Gate local** `scripts/ci-gate.sh` (`bash scripts/ci-gate.sh`): ata RBAC smoke + E2E live (11) + audit (0 críticas nuevas vs baseline 2) + guard de URL horneada. **🟢 VERDE verificado.** CI GitHub (`.github/workflows/ci.yml`) ya cubre lint/type-check/unit/integration/**security (`npm audit`)**/build.
> - ⏭️ Pendiente (build-out dedicado): job E2E en el CI de GitHub (requiere boot del app + seed `qa-agent` en el runner), **Lighthouse budget**, migración de deps críticas (`request`→axios, `xlsx`→exceljs), healthcheck HTTP en systemd, cobertura de pagos/tenant, bajar el `color-contrast`.
> - **⚠️ SEGURIDAD**: el remoto git `origin` tiene un **PAT de GitHub (`ghp_…`) embebido en texto plano** → JC debe ROTARLO y re-setear el remoto sin token (credential helper / SSH).
- [x] Reactivar `probe.mjs` como smoke de RBAC → **`tests/rbac-smoke.mjs` VERDE**. *(qa-expert / test-automator)*
- [ ] Suite: cobertura P0 (auth/pagos/RBAC/tenant) + E2E Playwright (hoy 0). *(qa-expert / test-automator)*
- [ ] a11y CI (axe), performance budget (Lighthouse/RUM), `npm audit` limpio.
- [ ] Build reproducible; resolver perfil lean vs producción real (2 nodos requieren RAM — hoy NAS saturado); healthcheck systemd + PM2 resurrect.
- [ ] Deploy con rollback; runbook (`reference_chateam_padeldev_deploy`).
- **Aceptación**: checklist verde; deploy sin downtime; alertas activas.

---

## Orden de ejecución
**Ola 0 → A → (B y D-backend en paralelo) → C → D-frontend → E → F.** B (diseño) y D-backend no dependen entre sí. C depende de B. E depende de que A cierre los bloqueadores de confianza.

## Trazabilidad
Cada ítem enlaza a su hallazgo (ID en `02-auditoria-tecnica.md`), su spec de módulo (`spec/modules/`) y su criterio de aceptación (`spec/acceptance/`). Marcar `[x]` al cerrar con evidencia (comando/sonda).
