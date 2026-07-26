# SPEC — chateam_jr (chateam-platform)

> **Fuente única de verdad del "qué"** (metodología Spec-Driven v7.0). Consolidación de la Fase 5
> del Playbook Spec-First a partir de `SPEC-FIRST/fase0..fase4`. El código debe reflejar este
> documento; si difiere, se corrige el código (salvo lo marcado como deuda conocida).
>
> Fecha de consolidación: 2026-07-12 · Alcance de la ronda: solo lectura de código + sondas GET ya
> ejecutadas. Toda afirmación técnica está trazada a `SPEC-FIRST/*` y/o `AUDITORIA_2026_07/*`.
>
> **Convención de estados:**
> - **[SUPUESTO]** = inferido de código/UI, requiere confirmación de negocio de JC (heredado de Fase 1).
> - **[PROPUESTA]** = meta numérica o decisión sugerida por el analista, requiere validación de JC antes
>   de ser un requisito contractual.
> - **[DEUDA]** = discrepancia código↔realidad conocida y aceptada temporalmente (a resolver en `/plan`).

---

> ## Capa de negocio (Fase 1 · 2026-07-23)
>
> Sobre este SPEC técnico se añadió una **capa de producto/negocio** con requisitos de **ID estable**
> (`BR-*`, `FR-*`, `NFR-*`). Este documento sigue siendo la fuente del "qué" técnico; la capa de
> negocio vive en [`../product/`](../product/) y **no reemplaza** nada de aquí:
> - [PRODUCT-VISION.md](../product/PRODUCT-VISION.md) — problema, propuesta de valor, diferenciación.
> - [PRODUCT-SCOPE.md](../product/PRODUCT-SCOPE.md) — dominios, must-have vs opcional, fuera de alcance.
> - [BUSINESS-REQUIREMENTS.md](../product/BUSINESS-REQUIREMENTS.md) — **catálogo maestro de IDs** BR/FR/NFR.
> - [BUYER-PERSONAS.md](../product/BUYER-PERSONAS.md) — actores (verificados) y compradores (HIPÓTESIS).
> - [SUCCESS-METRICS.md](../product/SUCCESS-METRICS.md) — métricas-faro y metas de RNF.
>
> El mapeo módulo→FR y RNF→NFR está en [§10](#10-índice-de-requisitos-con-id-estable-fase-1) al final.

---

## 1. Visión y propuesta de valor

**Qué es.** `chateam_jr` (backend `chateam-platform@1.1.0`, frontend `jrchateam-frontend@6.0.0`) es un
**CRM conversacional omnicanal multi-tenant, self-hosted, con IA generativa**. Centraliza en una sola
bandeja de tickets todos los canales de mensajería de una empresa —WhatsApp (Baileys no-oficial + WhatsApp
Cloud API oficial de Meta, con **Coexistencia** y failover entre ambos), Facebook/Instagram Messenger,
comentarios FB/IG, Telegram, TikTok y un WebChat propio embebible— y añade encima una capa comercial
(pipeline Kanban de leads, citas, campañas masivas de WhatsApp, Email Marketing, atribución Meta Ads) y una
capa de **Inteligencia Artificial** (agentes IA con RAG sobre pgvector, generación de imagen/video/audio
"UGC", créditos IA prepago).

La promesa se resume en el propio login: *"Plataforma de comunicación omnicanal"* (`frontend/src/pages/Login.tsx:94`).

**Propuesta de valor [SUPUESTO — confirmar segmento/pricing con JC].** Un solo panel para que una PyME o
agencia atienda todos sus canales con un equipo (roles admin/supervisor/agente) y escale la atención con IA
sin perder trazabilidad comercial. Modelo de negocio observado en código: **SaaS multi-tenant por planes**
con onboarding vía **"Plan Demo incluido"** (`frontend/src/pages/SignUp.tsx:280`) y **consumo de IA por
créditos prepago** (gateways Stripe/PayPal/Gerencianet-PIX/Coingate). **No hay** posicionamiento de mercado
explícito en código (vertical, tamaño de cliente, precio) → pendiente de negocio, no de ingeniería.

**Diferenciadores reales (dónde ya gana — proteger, no rehacer).** Detalle en [`benchmark.md §7`](./benchmark.md):
1. Self-hosted + multicanal + IA generativa/UGC en un solo panel (ningún rival combina los tres).
2. Coexistencia Baileys ↔ Cloud API con failover por ticket (`OutboundRoutingService.ts`).
3. Modelo económico: self-host ≈ 0 costo de licencia + créditos IA prepago propios (vs $79-279/mes o $0.99/resolución de los líderes).
4. Amplitud funcional: 187 tablas, 857 servicios, ~20 módulos. **El problema no es falta de features, es gobierno** (seguridad, reporting, UX).

**Estrategia de producto derivada.** No competir en features (ya gana); **cerrar los gaps de confianza**
(seguridad/compliance, reporting, observabilidad) y **empaquetar lo que ya tiene** (agente IA medible, design
system) para volver vendible una plataforma hoy más amplia que sus rivales pero **no apta para operar en
`live`** (veredicto de auditoría: **CRÍTICO**).

---

## 2. Usuarios y roles

**Modelo real de autorización.** El rol vive en `Users.profile` (string libre, `models/User.ts:55`) + flag
booleano `Users.super` (`middleware/isSuper.ts`). El frontend traduce `profile` a 4 roles con
`mapProfileToRole()` (`frontend/src/utils/permissions.ts:879-894`). **[DEUDA]** El gating real de menú y ruta
**no es por rol sino por PLAN de la company** (`user.company.plan.interfacePermissions`, ~90 flags booleanos
parseados por `hasAccessByPlan()`); el rol solo decide (a) acceso total si `super===true` y (b) ítems marcados
`roles:['super']`. En la práctica **admin, supervisor y user tienen hoy el mismo techo de acceso salvo
diferencias de plan** — los 3 roles legacy se mantienen por compatibilidad, no son la fuente de verdad del RBAC.

| Rol | Identificación | Acciones clave | Pantallas principales |
|---|---|---|---|
| **super-admin** | `super===true` | Gestionar TODAS las companies/planes; configurar IA global y ver costos/rentabilidad; administrar permisos por plan | `/companies`, `/plans`, `/permissions-manager`, `/admin/ai-token-usage`, `/ai-rentability`, `/ugc/settings` + todo lo de admin |
| **admin** | `profile` contiene "admin" | Gestionar usuarios/colas de SU company; configurar canales y campañas; dashboard admin de IA | Dashboard, Tickets, Kanban/Funnel, Conexiones, Campañas, Config General, Usuarios, Facturación |
| **supervisor** | `profile` = supervisor | Supervisar tickets/agentes; ver reportes; mover leads en Kanban | Tickets, Funnel, Citas, Reportes |
| **user** (agente) | default | Atender tickets/chats asignados; usar mensajes rápidos; agendar citas | Tickets, Contactos, Mensajes Rápidos, Chats Internos, Citas |

- **Actor no autenticado:** visitante del widget WebChat público (sin login), `POST /webchat/public/message`.
- **[SUPUESTO]** No hay evidencia de un 5º rol (ej. "facturación" o "cliente con portal propio"). Si el negocio
  lo requiere, el mecanismo natural es un flag de plan en `interfacePermissions`, sin tocar el enum de `profile`.
- **[DEUDA de seguridad, crítica]** Hoy el RBAC está roto en vivo: perfiles `user`/`supervisor` reciben 200 en
  endpoints financieros de IA que deberían ser solo-admin, y `GET /companies` filtra secretos de todos los
  tenants a cualquier `user` (ver RNF §6 y `benchmark.md` G1/G10).

---

## 3. Stack tecnológico

| Capa | Tecnología | Versión |
|---|---|---|
| Backend | Node.js + TypeScript (ESM, tsx) · Express 4 | node 22.x |
| ORM/DB | Sequelize · **PostgreSQL 17 + pgvector 0.8.5** | pg17 |
| Cache/colas | Redis 7 · Bull (~34 colas) | redis 7 |
| Tiempo real | Socket.IO (namespace por `companyId`) | 4.x |
| Frontend | React 18 + Vite 7 + TypeScript · **MUI Joy (beta) + Material 7** [DEUDA: doble sistema] | |
| Mensajería | Baileys 7.0.0-rc13 + WhatsApp Cloud API (Meta) + Coexistencia | |
| Runtime | PM2 (1 nodo lean `:3010` + worker), Docker (pg/redis), nginx | |
| Observabilidad | prom-client, Sentry, pino/winston (**mayormente desconectada** [DEUDA]) | |
| Multi-tenant | por columna `companyId` (157/187 tablas) [DEUDA: sin defensa en profundidad] | |

**Conteos reales:** 129 rutas · 142 controladores · 857 servicios · 198 modelos · 187 tablas (344 MB, 670
índices) · 336 archivos frontend · 121+32 dependencias.

**Deuda de dependencias (detalle en `SPEC-FIRST/fase2`):** `xlsx@0.18.5` con CVE sin fix (C-3, P0);
`whatsapp-rust-bridge` fuera de `package.json` → `npm install` limpio rompe WhatsApp (C-2, P0); Graph API
v19.0 **expirada** en CAPI (M-1, P0); MUI v5+v7 coexistiendo; libs redundantes (moment+dayjs+date-fns,
winston+pino, chart.js+recharts).

---

## 4. Arquitectura

### 4.1 Entrypoint canónico

**Decisión canónica de este SPEC: el entrypoint soportado es `server-distributed.ts`.** Es el que PM2 corre
realmente en producción (`chateam.config.cjs`, perfil lean 1-nodo, `pm2 id 10 chateam-node online`), con
`NODE_ID` y `MAX_SESSIONS=60`; solo `node-1` corre colas/cron.

**[DEUDA D-P0/P1 — 3 entrypoints coexistiendo]:**

| Candidato | Declarado en | Realidad |
|---|---|---|
| `server-simple.ts` | `package.json:6` (`main`), `npm start` | Mono-proceso. Lo que `npm start` cree que es "el" entrypoint — **NO es el de producción**. |
| **`server-distributed.ts`** | `chateam.config.cjs` (PM2 activo) | **El que realmente corre.** Multi-nodo, sharding de sesiones. **← canónico.** |
| `server.ts` | wrapper legacy 1.4KB | Redundante, sin uso confirmado. |

Riesgo: un operador que lea `package.json`/`npm start` desplegaría el entrypoint equivocado (mono-proceso, sin
sharding). **Acción en `/plan` (Fase 2):** declarar `server-distributed.ts` como único entrypoint en
`package.json` (`main`+`start`), borrar `server.ts`, degradar `server-simple.ts` a modo "dev/single-tenant"
documentado, y canonizar `chateam.config.cjs` como único ecosystem PM2.

### 4.2 Diagrama de componentes (textual, verificado contra el sistema vivo)

```
INTERNET  ──  https://padeldev.codigo.plus
   ▼
Router/NAT (port-forward :443)
   ▼
nginx :443 (TLS Let's Encrypt) — /etc/nginx/server.d/padeldev.codigo.plus.conf
   ├─ location /            → frontend/dist (SPA React/Vite estática, try_files → index.html)
   ├─ location /be/         → proxy_pass http://127.0.0.1:3010/   (strippea /be)
   └─ location /socket.io/  → proxy_pass http://127.0.0.1:3010    (WS upgrade, timeout 3600s)
                                        │
                          chateam-node (PM2 fork, tsx/esm, *:3010)
                          server-distributed.ts · heap 2GB · Express 4 + Sequelize + Socket.IO
                                        │
                     ┌──────────────────┼───────────────────┐
                     ▼                  ▼                   ▼
        127.0.0.1:5434 (Docker)   127.0.0.1:6390 (Docker)   Integraciones externas
        chateam-postgres pg17     chateam-redis 7           Meta/WhatsApp Cloud API,
        + pgvector · 187 tablas   Bull queues + adapter     Stripe/PayPal/Gerencianet/Coingate,
        344 MB · 670 índices      Socket.IO                 fal.ai/Higgsfield/ComfyUI,
                                                            SendGrid/Listmonk/SES, Google
                                                            Calendar/Drive, S3/MinIO, Telegram, TikTok

        [chateam-worker] — proceso PM2 separado (worker.ts) — [DEUDA: HOY STOPPED]
        Debería consumir ~34 colas Bull (CampaignQueue, EmailSend, FacebookConversionQueue,
        UGCVideoGeneration, AppointmentReminder, MessageQueue, NotificationQueue, ...)
```
Fuente: `AUDITORIA_2026_07/07-infra-runtime/infra-runtime.md:75-109` (verificado con `pm2 list`, `docker ps`,
`ss -ltnp`, `curl /health`).

### 4.3 Capas y patrones

- **Flujo de capas:** `routes/` (encaminar, 129 archivos vía `routes/index.ts`) → `controllers/` (recibir/responder)
  → `services/` (lógica, 857 en 124 subdominios) → `models/` (datos Sequelize).
- **[DEUDA] Envelope HTTP inconsistente:** 75 archivos `{success,message,data}`, 85 `res.json(x)` plano,
  `{error,message}` en el handler global. Cualquier API nueva DEBE declarar explícitamente su envelope.
- **[DEUDA] 154 dependencias circulares** (105 modelos benignas + 49 de lógica reales), concentradas en el
  god-object `wbotMessageListener.ts` (7.501 líneas, hub de ~40 ciclos).
- **[DEUDA] Multi-tenant por columna sin defensa en profundidad:** el aislamiento depende 100% de que cada
  query filtre `companyId`; `tenantMiddleware` montado solo en 2 de 129 rutas.

### 4.4 Superficie de configuración

**192 variables `process.env.X` únicas** referenciadas en código (Meta ~15, Facebook ~8, TikTok 4, IA/UGC:
fal.ai 16 + Higgsfield 12 + ComfyUI 5 + OpenAI/Anthropic 2, Pagos: Stripe 5 + PayPal 2 + Gerencianet 4 +
Coingate 2, S3/MinIO 5, Google/MS 4, Email: Listmonk 9 + SMTP 6, auth `JWT_SECRET`/`JWT_REFRESH_SECRET`/`MASTER_KEY`).
**[PROPUESTA]** `/plan` Fase 2 debe generar un `.env.example` canónico y documentado (nombre | requerida |
default | descripción) a partir de este grep.

---

## 5. Índice de módulos

Cada módulo lista qué puede hacer el usuario, con su ruta/controlador. Detalle completo con criterios de
aceptación en [`SPEC-FIRST/fase1/01-vision-y-alcance.md §3`](../SPEC-FIRST/fase1/01-vision-y-alcance.md). Las
specs por módulo se depositarán en [`spec/modules/`](./modules/) (hoy vacío — pendiente de poblar en `/plan`).

| Módulo | Qué hace | Estado destacado |
|---|---|---|
| **Gestión / Dashboard** | KPIs agregados de conversación/IA, Origen de Cliente, Reportes, Leads Kanban | 🔴 `/dashboard/ticketsUsers`, `/ticketsDay` en 500 |
| **Tickets** (bandeja omnicanal) | Ver/filtrar/asignar/cerrar tickets de todos los canales; notas, etiquetas, SLA (`TicketTrakings`) | 🔴 `/tickets/counts`, `/ticketreport/reports` en 500; `LogTickets` = 225.613 filas |
| **WhatsApp / Conexiones** | Conectar por QR (Baileys) o Embedded Signup (Cloud API); routing por ticket con failover | 22/29 en `qrcode`, 7 `DISCONNECTED`, **0 CONNECTED** hoy (entorno restaurado) |
| **Contactos (CRM)** | CRUD, import Excel/export, listas, etiquetas, campos custom, temperatura, memoria semántica | 🔴 import usa `xlsx` con CVE (P0) |
| **Mensajes Rápidos** | Respuestas predefinidas con embeddings (sugerencia semántica) | 🔴 `/quick-messages/list` en 500 |
| **Chats Internos** | Chat entre agentes (no WhatsApp) | OK |
| **Funnel / Kanban** | Mover leads entre etapas (drag&drop), log de movimientos, clasificación por worker IA | `stageClassifier.worker.ts` es el único worker |
| **Agendas / Citas** | Servicios, disponibilidad, reservas, recordatorios, sync Google/Outlook, sugerencias IA | Recordatorios dependen del worker (hoy caído) |
| **Etiquetas** | Etiquetas de color para tickets/contactos | OK |
| **Comentarios FB/IG** | Auto-responder de comentarios, bandeja | 🔴 webhook FB sin verificación de firma (P1) |
| **WebChat** | Widget embebible público con `apiKey` por company | Mensajes públicos sin auth (por diseño) |
| **Campañas WhatsApp** | Crear campaña, lista, plantilla, lanzar escalonado (Bull) | 🔴 P0: 5 `fetch()` sin baseURL/token → roto en prod; `Campaigns`=0 filas |
| **FlowBuilder** | Constructor de flujos con nodos (reactflow) | 🔴 11 carpetas de nodo-Modal **vacías** |
| **Créditos IA / Costos IA** | Saldo/uso de créditos; rentabilidad global (super) | 🔴 P1 fuga financiera a user/supervisor; transactions/analytics en 500 |
| **Suscripciones / Planes** | Definir planes (`interfacePermissions`), pagar/renovar (4 gateways) | 🔴 P0: webhooks Stripe/PayPal sin validar firma |
| **Afiliados / Partners** | Links referido, comisiones, retiros | 🟡 2 sistemas coexistiendo (plataforma + IA) |
| **Email Marketing** | Campañas, plantillas, automatizaciones, A/B, tracking (factory de 6 providers) | 🟡 SendGrid/SES/Carbonio son stubs |
| **UGC & Contenido IA** | Generar imagen/video/audio (fal.ai/Higgsfield/ComfyUI); creadores/device farm | ✅ webhook fal.ai es el único robusto (Ed25519+anti-replay) |
| **Marketing / Meta Ads** | Insights, atribución multi-touch, auditoría, Facebook Conversions | v19.0 Graph API expirada (M-1) |
| **Super-admin** | Companies, planes, consumo tokens IA, T&C | 🔴 P0: `GET /companies` y `/settingsFacebook` filtran secretos a cualquier user |

**Flujos de usuario críticos** (happy path + ramas de error, en `fase1 §4`): (1) recibir/responder WhatsApp;
(2) crear/asignar ticket; (3) mover lead en Kanban; (4) lanzar campaña WhatsApp [roto]; (5) agendar cita.

---

## 6. Requisitos No Funcionales (RNF)

Cada RNF con valor observado (evidencia), meta objetivo medible y estado. Detalle y notas de método en
[`fase1 §6`](../SPEC-FIRST/fase1/01-vision-y-alcance.md). Las metas marcadas **[PROPUESTA]** requieren
validación de JC antes de ser SLA contractual.

| Categoría | Métrica | Observado | Meta objetivo | Estado |
|---|---|---|---|---|
| Rendimiento — Dashboard | `GET /dashboard` | super 363ms · **admin 2.629ms** · sup 392ms · user 706ms | **[PROPUESTA] p95 < 800ms** cualquier perfil | admin excede 3x |
| Rendimiento — listados | `GET /dashboard/moments` | admin (2.046 tickets) → **8.067ms** | **[PROPUESTA] p95 < 1.500ms** con paginación obligatoria | Incumple |
| Disponibilidad — endpoints | Handlers GET siempre-500 | **13 endpoints** (list/counts/dashboard/campaigns/invoices/...) | **[PROPUESTA] 0 en 500** antes de release; error rate < 0.1% | 13/79 sondados (16%) rotos |
| Disponibilidad — plataforma | Nodo único (SPOF) + worker | 1 instancia; worker de colas `stopped` | **[PROPUESTA] 99.5% uptime/mes**; **[SUPUESTO]** decidir con JC si se necesita 99.9%+ | No medible hoy |
| Capacidad — host | RAM/swap | 15Gi total, 14Gi usados, **swap 100%**, load 34.5 | **[PROPUESTA]** swap < 80%, RAM libre > 2Gi | Al borde de OOM |
| Seguridad — secretos en reposo | Columnas de credenciales de terceros | 0% cifrado salvo `IntegrationConnection` (AES-256-CBC) | **[PROPUESTA] 100% cifrado (AES-256-GCM)** antes de claves `live` | 0% hoy |
| Seguridad — autenticación | Rate limiting login/signup | limiters definidos, **0 montados** | **[PROPUESTA]** 5 intentos/15min login, 3/h signup | No aplicado |
| Seguridad — RBAC | Fugas cross-tenant | 2 fugas P0 en vivo (`/companies`, `/settingsFacebook`) | **[PROPUESTA] 0 fugas** verificadas por suite de sondas (79+ endpoints × 4 perfiles) | 2 P0 confirmadas |
| Seguridad — contraseñas | Costo bcrypt | `hash(password, 8)` | **[PROPUESTA] cost ≥ 12** (OWASP 2026) | Por debajo del estándar |
| Escalabilidad — tenants | Companies activas | 15 (mayor: Smarttrack, 2.714 tickets) | **[SUPUESTO]** meta de tenants a 12m (¿100? ¿500?) para dimensionar | Sin meta declarada |
| Escalabilidad — mensajería | Sesiones WhatsApp/nodo | `MAX_SESSIONS=60`; 29 registradas, 0 CONNECTED | **[PROPUESTA]** validar límite real Baileys con prueba de carga antes de vender >30/tenant | No probado |
| Escalabilidad — datos | Tablas de alto crecimiento | `LogTickets` 225.613 filas, `InboundEventLedger` 77.310, sin partición/TTL | **[PROPUESTA]** retención 90-180d + particionado antes de 12m | Sin política |
| i18n | Multi-idioma | `i18next` en deps, **0 páginas** lo usan (todo español hardcoded) | **[SUPUESTO]** decidir con JC si se requiere EN/PT | Sin i18n funcional |
| Compliance — PII/RGPD | Datos personales en claro | `Contacts` 11.406, `Messages` 79.025 sin borrado/exportación | **[SUPUESTO]** definir con JC si aplica LOPDP/RGPD → proceso de borrado/retención | No evaluado (requiere legal) |
| Observabilidad | Métricas/tracing | prom-client/Sentry desconectados; healthcheck `health=none` | **[PROPUESTA]** `/metrics` montado + probe externo de `/health` + dashboards antes de cualquier SLA | Sin monitoreo activo |
| Frontend — arranque | Bundle inicial | Entry monolítico **2.75 MB (703 KB gz)**, 103 páginas eager | **[PROPUESTA]** entry ≤ 300 KB gz vía `lazy()` por ruta | Incumple |
| Frontend — a11y | Violaciones axe | 10/7/7 por pantalla; 473 IconButton sin `aria-label` | **[PROPUESTA]** 0 críticas axe; WCAG 2.1 AA en flujos core | 2 bloqueos sistémicos P0 |
| Frontend — consistencia | Colores/tipografías por pantalla | 38/28/26 colores, 4 familias, 8-13 tamaños, 9 radios | **[PROPUESTA] ≤12 colores de marca visibles/pantalla**, 2 familias, escala de 8 | Sin gobernar (ver `design-system.md`) |

**[PENDIENTE §6]** Re-ejecutar sonda GET autenticada contra `/dashboard` capturando el body completo para
validar/descartar las 3 cifras del brief de negocio (~20.8 días de respuesta, 117 tickets sin asignar,
satisfacción 0%) antes de fijarlas como línea base contractual.

---

## 7. Índice de specs y entregables

### Documentos de esta carpeta (`spec/`)
- **[`SPEC.md`](./SPEC.md)** (este documento) — fuente de verdad del "qué".
- **[`design-system.md`](./design-system.md)** — marca única (paleta canónica teal-first, tipografía,
  espaciado, radios, sombras), inventario de componentes base y Arquitectura de Información final del menú
  (10 secciones/22 grupos/3 niveles → 9 grupos/2 niveles). Fuente de tokens: `SPEC-FIRST/fase3/design-tokens.json`.
- **[`benchmark.md`](./benchmark.md)** — resumen ejecutivo del benchmark competitivo (features vs 8
  competidores, métricas de sonda, 10 gaps, 10 oportunidades priorizadas).
- **[`meta-coexistencia-spec.md`](./meta-coexistencia-spec.md)** — estado objetivo de la integración Meta +
  Coexistencia (Graph API v24.0 única centralizada, invariantes verificables).
- **[`testing-spec.md`](./testing-spec.md)** — cómo correr toda la suite (Jest + Playwright, scripts, CI).
- **[`spec/modules/`](./modules/)** — specs detalladas por módulo (vacío, a poblar en `/plan`).
- **[`spec/acceptance/`](./acceptance/)** — criterios de aceptación ejecutables por módulo (vacío, a poblar en `/plan`).

### Fuentes Spec-First (`SPEC-FIRST/`)
- `fase0/00-baseline.md` — preparación, acceso, stack, módulos, objetivo de la ronda.
- `fase1/01-vision-y-alcance.md` — el "qué" completo (visión, roles, 20 módulos con criterios de aceptación, 5 flujos, arquitectura, RNF).
- `fase2/02-auditoria-tecnica.md` — 16 informes consolidados: **14 P0 · 41 P1 · 42 P2 · 35 P3**, veredicto CRÍTICO.
- `fase3/03-auditoria-frontend.md` — auditoría UX/diseño/a11y, backlog F-1..F-19.
- `fase4/04-benchmark-competitivo.md` — investigación competitiva + sondas (detalle de `benchmark.md`).
- `sondas/` — datos medidos (`sondas-padeldev.json`, `sondas-competidores.json`) y scripts de sonda.

### Auditoría base (`AUDITORIA_2026_07/`)
16 dominios spec-driven previos (backend, DB, frontend, deps, integraciones, seguridad, infra, sondas RBAC,
pagos, Meta/Coexistencia, rendimiento, a11y, observabilidad, deuda, testing, síntesis). Ver `99-sintesis/RESUMEN.md`.

---

## 8. Criterios de aceptación globales

- Compila sin errores: `npm run type-check` (tsc --noEmit) → 0 errores. **[DEUDA]** hoy `strict:false`, 2.902 `any`; objetivo `strict` por etapas.
- Lint sin errores críticos: `npm run lint` (hoy ~1.440 findings).
- Tests: `npm run test:unit` y `test:integration` en verde (ver `testing-spec.md`). **[DEUDA]** hoy ~8% cobertura, CI roto.
- Build de producción: `npm run build` genera `dist/`.
- Health check responde: `routes/healthRoutes.ts`.
- **Bloqueadores de release comercial (de `benchmark.md` P1-P2):** 0 fugas cross-tenant, 0 webhooks de pago sin
  firma, 0 endpoints en 500, secretos cifrados en reposo, rate-limit montado en auth.

---

## 9. Pendientes de validación por JC (heredados de Fase 1)

1. **[SUPUESTO]** Segmento de mercado, tamaño de cliente objetivo y modelo de pricing exacto.
2. **[SUPUESTO]** Si se requiere un 5º rol o el modelo actual (super/admin/supervisor/user + permisos por plan) basta.
3. **[SUPUESTO]** Si los 11 nodos de FlowBuilder sin implementar se completan o se descartan.
4. **[SUPUESTO]** Si el doble sistema de afiliados (plataforma vs. IA) es intencional.
5. **[SUPUESTO]** Qué providers de Email Marketing están realmente operativos (varios son stub).
6. **[PROPUESTA]** Validar cada meta numérica de RNF (§6) antes de convertirla en compromiso contractual.
7. **[PENDIENTE]** Re-ejecutar sonda de `/dashboard` para confirmar las cifras del brief de negocio.
8. **[SUPUESTO]** Alcance real de compliance (LOPDP Ecuador / RGPD) — requiere revisión legal.
9. **[PENDIENTE]** Logo/manual de marca oficial para fijar la paleta canónica definitiva (hoy propuesta en `design-system.md`).

---

## 10. Índice de requisitos con ID estable (Fase 1)

> Añadido en la Fase 1 (business-first). Catálogo canónico y detalle en
> [`../product/BUSINESS-REQUIREMENTS.md`](../product/BUSINESS-REQUIREMENTS.md). Aquí solo el mapeo
> rápido módulo/tema → ID. El **estado** (EXISTE/PARCIAL/AUSENTE/MOCK/NO-VERIFICABLE) por ID se
> resuelve en la Fase de Auditoría, no en este índice.

**Negocio (BR):** BR-001 multi-tenant · BR-002 self-hosted · BR-003 onboarding/trial ·
BR-004 monetización dual (planes + créditos IA) · BR-005 multi-gateway pago · BR-006 gating por plan ·
BR-007 white-label · BR-008 ROI marketing medible · BR-009 afiliados · BR-010 segmento/pricing
[HIPÓTESIS] · BR-011 expansión geográfica [HIPÓTESIS].

**Funcionales (FR) — mapeo con §5:** FR-001 Tickets · FR-002 WhatsApp dual/Coexistencia ·
FR-003 Contactos · FR-004 Mensajes rápidos · FR-005 Chats internos · FR-006 Funnel/Kanban ·
FR-007 Citas · FR-008 Etiquetas · FR-009 Comentarios FB/IG · FR-010 WebChat · FR-011 Campañas ·
FR-012 FlowBuilder · FR-013 Créditos IA · FR-014 Suscripciones/Planes · FR-015 Afiliados ·
FR-016 Email Marketing · FR-017 UGC · FR-018 Meta Ads/atribución · FR-019 Super-admin ·
FR-020 Agentes IA/RAG · FR-021 Motor estadístico · FR-022 Automatizaciones · FR-023 Dashboard ·
FR-024 Roles/RBAC.

**No funcionales (NFR) — mapeo con §6:** NFR-001 dashboard p95 · NFR-002 listados p95 ·
NFR-003 0 endpoints 500 · NFR-004 uptime · NFR-005 capacidad host · NFR-006 secretos cifrados ·
NFR-007 rate-limit auth · NFR-008 RBAC sin fugas · NFR-009 bcrypt≥12 · NFR-010 meta tenants ·
NFR-011 sesiones WhatsApp · NFR-012 retención/particionado · NFR-013 i18n · NFR-014 compliance PII ·
NFR-015 observabilidad · NFR-016 bundle ≤300KB · NFR-017 a11y AA · NFR-018 design system ·
NFR-019 webhooks pago firmados · NFR-020 envelope HTTP.
