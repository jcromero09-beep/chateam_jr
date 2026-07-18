# chateam_jr — Síntesis Ejecutiva de Auditoría Spec-Driven (2026-07-12)

> Consolidación de los 9 informes de dominio de `AUDITORIA_2026_07/`. Código = solo lectura; sondas = solo GET (excepto login) contra `https://padeldev.codigo.plus/be`.
> BD viva: `chateam-postgres` (`chateamjr`). Backend vivo: `chateam-node` (PM2, :3010).

---

## 1. Resumen ejecutivo

`chateam_jr` (chateam-platform v1.1.0 / frontend jrchateam v6.0.0) es una **plataforma CRM omnicanal multi-tenant** (WhatsApp Baileys + Meta Cloud API + Facebook/Instagram + Telegram + TikTok + WebChat + Email Marketing + IA generativa/UGC), Node.js 22 + TypeScript (ESM/tsx) + Express + Sequelize + PostgreSQL 17/pgvector + Redis/Bull + Socket.IO + React/Vite, corriendo restaurada de backup en `padeldev.codigo.plus`. **Tamaño real verificado:** 129 archivos de ruta, 142 controladores, 857 servicios (124 subdominios), ~34 colas Bull; 187 tablas (344 MB, 670 índices); 336 archivos fuente frontend (163 rutas SPA, chunk de 2.75 MB); 121 deps backend + 32 frontend. **Estado general:** funcionalmente muy amplio pero con deuda de seguridad severa y sistémica, infraestructura al límite (RAM/swap 100%, worker de colas caído, nodo único sin HA) y secretos de terceros sin cifrar. **Veredicto de riesgo: CRÍTICO** — hay fuga de secretos de pasarelas de pago y del App Secret de Facebook confirmada EN VIVO a cualquier usuario autenticado, escalada de privilegios explotable, y webhooks de pago forjables en código; multi-tenant frágil (aislamiento por `companyId` sin defensa en profundidad). No apto para operar con claves `live` hasta remediar la Ola 0/1.

---

## 2. Inventario tecnológico consolidado

| Capa | Tecnología | Versión (real en runtime) |
|---|---|---|
| Runtime | Node.js (nvm, PM2) | **22.22.0** (host `/usr/bin/node` v18.20.4 incumple `engines>=20`) |
| Lenguaje / ejecución | TypeScript ESM vía `tsx` | tsx 4.21.0 (sin build; Dockerfiles compilan a dist pero NO reflejan runtime) |
| Framework HTTP | Express | 4.22.1 (con `body-parser@2` de Express 5 — mismatch) |
| ORM | Sequelize + sequelize-typescript | 6.37.7 / 2.1.6 · `pg` 8.18.0 |
| Base de datos | PostgreSQL + pgvector | **pgvector/pgvector:pg17** (:5434) — compose declara pg15, STALE |
| Cache / colas | Redis + Bull | redis:7-alpine (:6390) / bull 4.16.5 |
| Realtime | Socket.IO (+ redis-adapter) | 4.x (namespace por `companyId`) |
| WhatsApp | Baileys + whatsapp-rust-bridge | baileys **7.0.0-rc13** (RC) · bridge **0.5.4 (no declarada en package.json)** |
| IA | OpenAI / Anthropic / fal.ai / MCP | openai 4.104.0 · @anthropic-ai/sdk 0.82 · @fal-ai/client 1.10.1 |
| Pagos | Stripe / PayPal / Gerencianet / Coingate / MercadoPago / Apple IAP | stripe 14.25.0 · @paypal/checkout-server-sdk 1.0.3 (archivado) |
| Proceso | PM2 (fork) + systemd resurrect | `chateam-node` online, `chateam-worker` **stopped** |
| Frontend | React + Vite | React 18.3.1 · Vite 7.x |
| UI | MUI Joy (beta) + MUI Material | @mui/joy 5.0.0-beta.52 + @mui/material 7.3.7 (doble `@mui/system` v5+v7) |
| Estado FE | React Context + hook local (sin Redux/Zustand) | — |
| Proxy / TLS | nginx + Let's Encrypt | `/be/` strippea prefijo → :3010; `/socket.io/` WS |

---

## 3. Tabla P0 consolidada (ordenada por criticidad)

Leyenda "En vivo padeldev": **SÍ-sonda** = confirmado con sonda GET en producción · **SÍ** = ruta proxeada y explotable · **NO-mitigado** = bloqueado por el despliegue actual (nginx no proxea la ruta raíz / flag) pero explotable en código o contra `:3010` directo.

| ID | Título | Dominio | ¿Explotable EN VIVO? | Impacto | Fix de 1 línea |
|---|---|---|---|---|---|
| **P0-A** | Fuga de `stripeSecretKey`/`paypalSecretKey`/`facebookAppSecret` de TODOS los tenants vía `GET /companies` | Pagos/RBAC (09 P0-3, 08 P0-1) | **SÍ-sonda** (perfil `user` c6 → 15 companies con `sk_test_…` en claro) | Toma total de la cuenta Stripe/PayPal al pasar a `live`; IDOR total | `attributes.exclude` de secretos + `isSuper` en `CompanyController.index`/`ListCompaniesService` |
| **P0-B** | `GET /settingsFacebook` devuelve `facebookAppSecret` real a cualquier `user` | RBAC (08 P0-2) | **SÍ-sonda** (`8820dee9…` 32 chars expuesto) | Suplantación de la app FB, abuso Graph API | Gatear `showFacebook` con `isSuper` y no emitir el secreto; **rotar** la clave |
| **P0-C** | Escalada de privilegios + toma de cuenta intra-tenant vía `PUT /users/:id` (check admin comentado) | Seguridad (06 P0-1) | **SÍ** (`/be/users/:id` proxeado; check `DEMO` off en prod) | user→admin; cambiar password de cualquier cuenta del tenant | Reinstaurar check de rol en `UserController.update`; whitelist de campos |
| **P0-D** | Webhook Stripe: firma HMAC de-facto opcional (procesa sin `stripe-signature`) → plan/tokens IA gratis | Pagos (09 P0-1, 05 P0-2, 06 P1-7) | **NO-mitigado** (`/subscription/stripewebhook` raíz NO proxeado por padeldev; sí contra :3010 o si se añade proxy) | Fraude: activar planes y acreditar tokens IA arbitrarios | Exigir `stripe-signature` (400 si falta) + `STRIPE_WEBHOOK_SECRET` fail-fast; borrar ramas sin validar |
| **P0-E** | Webhook PayPal SIN verificación de firma → falsificar pagos + comisión de afiliado real | Pagos (09 P0-2, 05 P0-1) | **NO-mitigado** (`/paypal/webhook` raíz NO proxeado; explotable en código/:3010) | Plan gratis, tokens IA ilimitados, retiro de comisión afiliado no cobrada | `verify-webhook-signature` con `PAYPAL_WEBHOOK_ID` + re-consultar orden |
| **P0-F** | Secretos/tokens de terceros en claro en BD (Stripe/PayPal/Meta/TikTok/IA/OAuth) | BD/Seguridad (02 P0-1, 06 P1-6, 05 P1-6, 09 P1-4) | N/A (requiere dump/SQLi/backup) | Un dump expone credenciales de pago+redes de los 15 tenants | Cifrar en reposo (AES-256-GCM/pgcrypto) reusando el AES de `BaseIntegrationService` |
| **P0-G** | `/internal/*` sin auth (`req.ip` localhost por falta de `trust proxy`); `wbot-call` ejecuta métodos arbitrarios | Backend/Seguridad (01 P0-1, 06 P0-2) | **NO-mitigado** (padeldev solo proxea `/be` y `/socket.io/`; explotable contra :3010 o si se proxea root) | Enviar/borrar/editar WhatsApp de cualquier tenant; RCE parcial de `wbot` | `deny /internal` en nginx + `app.set('trust proxy',1)` + validar `req.socket.remoteAddress` |
| **P0-H** | `chateam-worker` (colas Bull) CAÍDO por `require()` de módulos ESM `.ts` | Infra (07 P0) | N/A (defecto operativo activo) | 0 colas procesadas: email, FB Conversions, Meta coexistence, limpieza citas | Migrar `require("./jobs/Email*")` a `await import(...)` en `queues.ts:434`; `pm2 restart` |
| **P0-I** | RAM/swap del host agotados (15 Gi usados, swap 9.7 Gi 100%, load 34) | Infra (07 P0) | N/A (riesgo operativo) | OOM-killer puede tumbar backend o contenedores en cualquier pico | Liberar RAM de procesos co-residentes / limitar heaps; no subir a 2 nodos |
| **P0-J** | SPOF: backend de nodo único sin HA/failover | Infra (07 P0) | N/A | Caída del proceso = plataforma inaccesible (API+WS+webhooks) | Documentar runbook; evaluar `instances:2` + adapter Redis cuando haya RAM |
| **P0-K** | `LogTickets` (225.613 filas, tabla más grande) sin `companyId` ni índice en FKs | BD (02 P0-2) | N/A | Seq scan 225K filas al abrir historial; sin defensa de aislamiento por fila | `ALTER TABLE` add `companyId` denormalizado + `CREATE INDEX (companyId, ticketId)` |
| **P0-L** | `whatsapp-rust-bridge@0.5.4` instalada y usada (≥8 archivos) pero NO declarada en `package.json` | Tech (04 H-00) | N/A (riesgo build) | `npm ci`/`npm install` limpio rompe envío/recepción de WhatsApp | Re-declarar en `dependencies` + regenerar lock; borrar `package.json.bak` |
| **P0-M** | `xlsx@0.18.5` (SheetJS npm) con Prototype Pollution (CVE-2023-30533) + ReDoS (CVE-2024-22363) | Tech (04 H-01) | Parcial (import/export contactos) | Prototype pollution / DoS sin fix en registro npm | Migrar al tarball oficial `cdn.sheetjs.com` 0.20.3+ o `exceljs` |
| **P0-N** | `WhatsAppCampaigns.tsx` usa `fetch()` crudo sin baseURL ni token (módulo 100% roto) | Frontend (03 H-0) | **SÍ** (módulo no funciona en prod) | Campañas WhatsApp inoperantes (404/HTML/401) | Reemplazar los 5 `fetch()` por `api.get/post` |

> Nota de superficie: los webhooks de pago (P0-D/E) y `/internal` (P0-G) están hoy **fuera del alcance de padeldev** porque nginx solo enruta `/be/` y `/socket.io/` (infra 07 P1: webhooks raíz caen al SPA). El riesgo se materializa si se corrigen esas rutas para que los proveedores lleguen al backend, o si alguien alcanza `:3010` directo (bind en `*:3010`, infra P2). Deben arreglarse ANTES de rutear los webhooks.

---

## 4. Tabla P1 consolidada (resumida)

| ID | Título | Dominio |
|---|---|---|
| P1-01 | Socket.IO sin auth ni aislamiento tenant (namespace = `companyId` de la URL, `origin:"*"`+credentials) | Backend (01 P1-1/P1-4) |
| P1-02 | Firma Meta en modo `warn`/fail-open por defecto → inyección de webhooks forjados | Backend/Seg/Integr (01 P1-2, 06 P1-5, 05 P2-5) |
| P1-03 | Tokens logueados en claro (`tokenAuth`, `envTokenAuth`, secretos Stripe/Meta) | Backend/Seg (01 P1-3, 06 P2-8) |
| P1-04 | Backdoor `MASTER_KEY`: password maestra global omite `checkPassword` para cualquier email | Seguridad (06 P1-3) |
| P1-05 | Sin rate-limit en login/signup/forgot (limiters definidos, no montados) → fuerza bruta/DoS de tenants | Seguridad (06 P1-4) |
| P1-06 | Webhooks Facebook Messenger, comentarios FB, Telegram (sin `secret_token`) sin firma | Integraciones (05 P1-1/2/3) |
| P1-07 | Coingate/MercadoPago sin firma y sin cablear a entitlement (pagan y no reciben) | Integr/Pagos (05 P1-4, 09 P1-2) |
| P1-08 | `INTEGRATION_ENCRYPTION_KEY` con fallback `'default-key-change-in-production'` | Integraciones (05 P1-7) |
| P1-09 | Apple IAP S2S sin verificación de firma JWS ni `verifyReceipt` | Pagos (09 P1-5) |
| P1-10 | `/subscription/refund` y `/cancel` sin ownership → sabotaje/cancelación cross-tenant | Pagos (09 P1-1/P1-7) |
| P1-11 | `/invoices/list` sin `isAuth`, `PUT /invoices/:id` sin ownership → corrupción contable cross-tenant | Pagos (09 P1-6) |
| P1-12 | Provisión de créditos IA no idempotente (`renew` resetea) → replay = créditos infinitos | Pagos (09 P1-3) |
| P1-13 | Datos de costos/créditos IA y catálogo de 78 agentes (`systemPrompt`+`tools`) accesibles a `user` | RBAC (08 P1-1/P1-2) |
| P1-14 | 13 endpoints GET rotos (500) en producción, idénticos en los 4 perfiles | RBAC (08 P1-3) |
| P1-15 | 152 columnas FK sin índice (Baileys.whatsappId, Messages.contactId, Tickets.userId, …) | BD (02 P1-1) |
| P1-16 | `AIChunks.embedding`/`AISemanticCache.queryEmbedding` sin índice ANN (ivfflat) | BD (02 P1-2) |
| P1-17 | Sin retención/purga en `InboundEventLedger` (77K) y `LogTickets` (225K) | BD (02 P1-3) |
| P1-18 | `useAuth` no es contexto: estado de auth duplicado en 32 componentes (re-init frágil) | Frontend (03 H-1) |
| P1-19 | Bundle monolítico 2.75 MB (103 páginas eager) + `socket.onAny` loguea todo en prod | Frontend (03 H-2/H-3) |
| P1-20 | Deps deprecadas directas: `request`, `dialogflow@4` (dup), `multer@1.x`, MUI v5/v7 doble system | Tech (04 H-02/03/05/06) |
| P1-21 | Sin healthcheck real (Docker/systemd) ni probe externo; webhooks raíz no ruteados al backend | Infra (07 P1) |

---

## 5. Temas transversales (patrones repetidos)

1. **Secretos de terceros en claro en BD** — Stripe/PayPal secret keys, `facebookAppSecret`, `tokenMeta`, tokens TikTok/Instagram, `AIProviderConfig.apiKey`, `email_provider_configs`, `googleDriveTokens`, `integration_connections.credentials`. Aparece en 4 informes (02/05/06/09). Único subsistema que SÍ cifra: `IntegrationServices` (AES-256-CBC) — patrón reutilizable para el resto.
2. **Webhooks sin verificación de firma** — PayPal, Facebook Messenger, comentarios FB, Telegram, Coingate, Gerencianet sin HMAC; Stripe y Meta con verificación evadible (bypass si falta header / modo `warn`). Solo fal.ai (JWKS Ed25519) es robusto. `rawBody` solo se captura para Stripe/Meta/fal, imposibilitando añadir HMAC al resto sin tocar middleware.
3. **RBAC inconsistente / checks comentados** — el gate real es dispar: unos usan `isSuper`, otros re-decodifican el JWT en el controller, otros checan `profile` y varios no checan nada o tienen el check **comentado** (`UserController.update`). Gating a mitad de módulo (ej. `AICostController`: `/summary` con `isSuper` pero `/report` solo `isAuth`). Denegaciones mezclan 401 y 403.
4. **Aislamiento tenant frágil por `companyId`** — `tenantMiddleware` existe pero montado en solo 2 rutas; el aislamiento depende de que cada query filtre `companyId`. 119 `findByPk` cross-tenant en 26 controladores (deuda en `docs/SECURITY_DEBT.md`), 30 tablas sin `companyId`. Un solo query sin `where companyId` = fuga (confirmado en `/companies`).
5. **Código muerto y duplicación** — 7 route files no montados + `debugRoutes`; `BillingController` (454 líneas, Stripe multi-tenant) muerto; 3 implementaciones de Stripe con 3 versiones de API; ChromaDB legado aún en el camino crítico de Facebook/IG; doble AWS SDK v2+v3, doble toast (toastify+sonner), doble charts (recharts+chart.js), triple lib de fecha.
6. **Deps deprecadas/vulnerables** — `xlsx` (P0), `request`, `dialogflow@4`, `multer@1.x`, `aws-sdk@2` EOL, `eslint@8` EOL, `baileys` RC, bridge fantasma; frontend con 466 usos de `any`, sourcemaps de prod publicados (19 MB).
7. **Infra al borde** — worker de colas caído, RAM/swap 100%, nodo único (SPOF), sin healthcheck, backend en `*:3010`, webhooks raíz no ruteados, 22/29 sesiones WhatsApp en `qrcode` (0 CONNECTED).
8. **13 endpoints en 500** — `/tickets/counts`, `/campaigns/list`, `/invoices/list`, `/quick-messages/list`, `/announcements/list`, `/ai/credits/transactions`, etc.: bug de código (idéntico en los 4 perfiles), no RBAC.

---

## 6. Roadmap de remediación priorizado

### Ola 0 — Contención inmediata de exposición pública (horas)
| # | Acción | Cubre | Esfuerzo |
|---|---|---|---|
| 0.1 | `attributes.exclude` de secretos en TODOS los reads de `Company` + `isSuper` en `/companies`/`showCompany` | P0-A | 1-2 h |
| 0.2 | Gatear `/settingsFacebook` con `isSuper` y no emitir el secreto; **rotar `facebookAppSecret`** | P0-B | 1 h |
| 0.3 | **Rotar** `sk_test`/`pk_test` expuestas (y planificar que nunca entre `sk_live` sin cifrar) | P0-A | 0.5 h |
| 0.4 | Reparar `chateam-worker` (`await import` en `queues.ts:434`) + `pm2 restart && save` | P0-H | 1 h |
| 0.5 | Aliviar RAM del host (revisar 13 procesos PM2 co-residentes); no escalar chateam | P0-I | 1-2 h |
| 0.6 | NO rutear los webhooks de pago a `:3010` hasta cerrar P0-D/E; confirmar bind `*:3010` filtrado | P0-D/E/G | 0.5 h |

### Ola 1 — P0 de código (días)
| # | Acción | Cubre | Esfuerzo |
|---|---|---|---|
| 1.1 | Reinstaurar check de rol en `UserController.update` + whitelist de campos; corregir IDOR `mediaUpload` | P0-C | 0.5 d |
| 1.2 | Stripe: exigir `stripe-signature` + `STRIPE_WEBHOOK_SECRET` (fail-fast); borrar ramas sin validar; re-consultar objeto | P0-D | 1 d |
| 1.3 | PayPal: `verify-webhook-signature` + `PAYPAL_WEBHOOK_ID`; re-consultar orden; no confiar en `custom_id` | P0-E | 1-1.5 d |
| 1.4 | Cifrar secretos de terceros en reposo (AES-256-GCM), reusando `BaseIntegrationService`; eliminar fallback `default-key` | P0-F, P1-08 | 2-3 d |
| 1.5 | `/internal`: `deny` en nginx + `trust proxy` + validar `remoteAddress` + secreto interno | P0-G | 0.5 d |
| 1.6 | `LogTickets`: add `companyId` + índices (`CONCURRENTLY`) | P0-K | 0.5 d |
| 1.7 | Re-declarar `whatsapp-rust-bridge`; parchear `xlsx` a tarball oficial | P0-L, P0-M | 0.5 d |
| 1.8 | Arreglar `WhatsAppCampaigns.tsx` (`fetch`→`api`) | P0-N | 0.5 d |
| 1.9 | `io.use()` en Socket.IO (verificar JWT + namespace==companyId); `origin` = `FRONTEND_URL` | P1-01 | 1 d |
| 1.10 | `META_SIGNATURE_MODE=enforce`; quitar `VERIFY_TOKEN` default `whaticket`; firmar webhooks FB/Telegram | P1-02/06 | 1 d |
| 1.11 | Eliminar/aislar `MASTER_KEY`; montar `authLimiter`/`signupLimiter` (RedisStore) | P1-04/05 | 0.5 d |
| 1.12 | `isSuper`+ownership en `refund`/`cancel`/`invoices`; idempotencia de créditos IA por `event.id`; cablear Coingate/MP; Apple JWS | P1-07/09/10/11/12 | 3-4 d |
| 1.13 | Redactar tokens en logs; homogeneizar guards `AICostController`/`ai/agents`; depurar los 13 handlers 500 | P1-03/13/14 | 2 d |

### Ola 2 — P1 restante / deuda (semanas)
| # | Acción | Cubre | Esfuerzo |
|---|---|---|---|
| 2.1 | Crear 152 índices FK (`CONCURRENTLY`) + índices ANN ivfflat en AIChunks/AISemanticCache | P1-15/16 | 1-2 d |
| 2.2 | Política de retención/particionado para `InboundEventLedger` y `LogTickets` | P1-17 | 2-3 d |
| 2.3 | Montar `AuthProvider` real; lazy-load de páginas + chunking; `sourcemap:false`; strip `console.*` | P1-18/19, FE P2 | 3-4 d |
| 2.4 | Retirar deps deprecadas (`request`, `dialogflow@4`, `multer@1`, `aws-sdk@2`, `eslint@8`); resolver MUI Joy vs Material | P1-20 | 3-5 d |
| 2.5 | Healthchecks Docker/systemd + probe externo; decidir ruteo de webhooks a `/be`; bind `127.0.0.1:3010` | P1-21, infra P2 | 2 d |
| 2.6 | Borrar código muerto (7 routes + `debugRoutes` + `BillingController`); migrar Facebook de ChromaDB a pgvector; consolidar Stripe/entry points/ecosystems PM2 | Transversal 5 | 3-5 d |
| 2.7 | Housekeeping BD: 4 índices duplicados, `CHECK` en `AiTokenTransactions`, convención snake/camel; subir bcrypt a 12; uploads `limits`+`fileFilter`+saneo nombre | P2/P3 varios | 2-3 d |

---

## 7. Índice de los 9 informes

| # | Informe | En una línea |
|---|---|---|
| 00 | `CONTEXT.md` | Plantilla spec-driven, credenciales de sonda (4 perfiles) y reglas del sistema/BD. |
| 01 | `01-backend/backend-inventory.md` | Backend HTTP/colas/socket: 129 rutas, 142 controladores, 857 servicios; `/internal` expuesto, socket sin auth, Meta fail-open. |
| 02 | `02-database/db-inventory.md` | 187 tablas/344 MB: secretos en claro, `LogTickets` sin companyId/índice, 152 FK sin índice, ANN faltantes. |
| 03 | `03-frontend/frontend-inventory.md` | SPA React/Vite 336 archivos: `fetch` crudo roto, `useAuth` sin contexto, bundle 2.75 MB, sourcemaps en prod. |
| 04 | `04-tecnologias/tech-stack.md` | Stack y deps: bridge fantasma, `xlsx` vulnerable, MUI v5/v7, worker caído, compose/ecosystems divergentes. |
| 05 | `05-integraciones/integraciones.md` | ~20 integraciones/webhooks: PayPal sin firma, Stripe bypass, FB/Telegram/Coingate sin firma, secretos sin cifrar. |
| 06 | `06-seguridad/seguridad.md` | Auth/RBAC/tenant: privesc+ATO `PUT /users`, `/internal`, `MASTER_KEY`, sin rate-limit, tokens en claro. |
| 07 | `07-infra-runtime/infra-runtime.md` | Runtime vivo: worker caído, RAM/swap 100%, nodo único (SPOF), sin healthcheck, webhooks raíz no ruteados. |
| 08 | `08-sondas-runtime/sondas-rbac.md` | 79×4 sondas GET en vivo: fuga `/companies` y `/settingsFacebook` (secreto FB), 13 endpoints 500, gating dispar. |
| 09 | `09-pagos/payment-audit.md` | Pagos: Stripe/PayPal forjables, fuga `stripeSecretKey` confirmada en vivo, entitlement no idempotente, Apple sin firma. |

---

## 8. Conteo total de hallazgos

Suma de severidades declaradas en los 9 informes (con solapamiento entre dominios — el mismo hallazgo aparece en varios informes; ver dedup en §3):

| Severidad | Total (suma por informe) | Por informe (01·02·03·04·05·06·07·08·09) |
|---|---|---|
| **P0** | **18** | 1·2·1·2·2·2·3·2·3 |
| **P1** | **41** | 4·4·3·4·8·5·2·3·8 |
| **P2** | **42** | 6·5·5·5·7·5·2·2·5 |
| **P3** | **35** | 6·3·7·6·4·3·2·2·0 |
| **TOTAL** | **136** | — |

Tras deduplicar por causa raíz, los P0 se consolidan en **14 issues únicos** (P0-A … P0-N en §3). Los confirmados EN VIVO con sonda son **2** (fuga `/companies`, fuga `/settingsFacebook`); **1** más (`PUT /users`) es explotable vía ruta proxeada; los webhooks Stripe/PayPal y `/internal` son forjables en código pero hoy no alcanzables por el nginx de padeldev (deben arreglarse antes de rutear webhooks).
