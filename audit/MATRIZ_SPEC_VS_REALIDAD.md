# Matriz SPEC vs Realidad — chateam_jr

> Auditoría técnica multiagente · 2026-07-23 · SOLO LECTURA. Confronta cada requisito de
> `product/BUSINESS-REQUIREMENTS.md` (BR/FR/NFR) contra el **código de hoy**. Clasificación:
> **EXISTE · PARCIAL · AUSENTE · MOCK · NO VERIFICABLE · OBSOLETO** (esta última = la afirmación de
> la SPEC quedó desactualizada respecto al código actual). Evidencia = parte de auditoría + ruta.

Partes fuente: `audit/parts/*.md` (arquitectura, frontend, api-inventario, api-contratos, backend-canales, db-esquema, seguridad, seguridad-appsec, seguridad-privacidad, devops, qa, rendimiento).

## Requisitos de negocio (BR)

| ID | Clasificación | Evidencia (parte · ruta) |
|---|---|---|
| BR-001 multi-tenant | **PARCIAL** | Por-query companyId; `tenantMiddleware` en 0 rutas (arquitectura H-7); brechas P0 socket/static/LogTickets |
| BR-002 self-hosted | **EXISTE** | Corre en padeldev (devops) |
| BR-003 onboarding/trial | **EXISTE** | `Plan.trial/trialDays`, signup demo |
| BR-004 monetización dual | **EXISTE** | Tablas créditos + 4 gateways |
| BR-005 multi-gateway pago | **PARCIAL** | Stripe/PayPal firmados OK; Coingate forjable, Apple IAP sin verificar (seguridad, api-contratos) |
| BR-006 gating por plan | **EXISTE** | `interfacePermissions` = RBAC real de menú (frontend) |
| BR-007 white-label / marca única | **PARCIAL** | 3 design systems coexisten (frontend) |
| BR-008 ROI marketing medible | **PARCIAL** | Atribución + CAPI existen; cuenta Ads sin permisos (#200); InsightsDaily con fallos |
| BR-009 afiliados | **PARCIAL** | Doble sistema plataforma/IA |
| BR-010 segmento/pricing | **AUSENTE** | Pendiente JC (sin posicionamiento en código) |
| BR-011 expansión geográfica | **NO VERIFICABLE** | Hipótesis (legado PIX) |

## Requisitos funcionales (FR)

| ID | Clasificación | Evidencia |
|---|---|---|
| FR-001 Tickets omnicanal | **PARCIAL** | Core inbox EXISTE y pagina; endpoints de conteo/reporte en 500 (SPEC, no re-ejecutado) |
| FR-002 WhatsApp dual/Coexistencia | **EXISTE** | `CoexistenceServices/`, routing con failover (backend-canales) |
| FR-003 Contactos | **EXISTE** | CRUD paginado; `xlsx` ya parcheado 0.20.3 |
| FR-004 Mensajes rápidos | **PARCIAL** | Embeddings EXISTE; `/quick-messages/list` 500 (SPEC, no re-ejecutado) |
| FR-005 Chats internos | **EXISTE** | Tablas + socket |
| FR-006 Funnel/Kanban | **EXISTE** | `KanbanMovementLogs`, worker clasificador |
| FR-007 Citas | **PARCIAL** | Core existe; `AppointmentsReports.tsx` = **MOCK** (frontend) |
| FR-008 Etiquetas | **EXISTE** | `Tags` |
| FR-009 Comentarios FB/IG + moderación | **PARCIAL** | Cola moderación existe; webhook FB sin `rawBody` → HMAC roto (C-04) |
| FR-010 WebChat | **EXISTE** | Público por diseño; `sessionId` adivinable (C-07) |
| FR-011 Campañas WhatsApp | **PARCIAL** | `CampaignController` real; 5 `fetch()` crudos en página **huérfana** (frontend); `Campaigns`=0 filas |
| FR-012 FlowBuilder | **PARCIAL** | Modales **SÍ implementadas** (OBSOLETO "11 vacías"); `WebhookModel` muerto (DB-02) |
| FR-013 Créditos IA | **PARCIAL** | IDOR SEC-P1-1; transactions/analytics 500 (SPEC) |
| FR-014 Suscripciones/Planes | **EXISTE** | Webhooks firmados; privesc `POST /plans` (H-02, ronda previa) a re-confirmar |
| FR-015 Afiliados | **PARCIAL** | Doble sistema |
| FR-016 Email Marketing | **PARCIAL** | Providers SendGrid/SES/Carbonio = stub |
| FR-017 UGC | **EXISTE** | fal.ai robusto (Ed25519) |
| FR-018 Meta Ads/atribución | **PARCIAL** | Atribución + dedup CAPI existen; HMAC Meta `warn` |
| FR-019 Super-admin | **EXISTE** | `isSuper` ahora aplicado (seguridad) |
| FR-020 Agentes IA/RAG | **EXISTE** | pgvector; tasa de resolución **NO VERIFICABLE** |
| FR-021 Motor estadístico | **EXISTE** | Regla muestra mínima (CHATEAM.md) |
| FR-022 Automatizaciones | **EXISTE** | Motor de reglas |
| FR-023 Dashboard | **PARCIAL** | Lento (2.629ms, ~15 count sin caché); `ticketsUsers`/`ticketsDay` 500 |
| FR-024 Roles/RBAC | **PARCIAL** | `Role.ts` nuevo **nunca evaluado en backend** (decorativo); `profile` legacy en uso |

## Requisitos no funcionales (NFR)

| ID | Clasificación | Evidencia |
|---|---|---|
| NFR-001 dashboard p95<800ms | **INCUMPLE** | 2.629ms admin (rendimiento R-06) |
| NFR-002 listados p95<1500ms | **INCUMPLE** | `/dashboard/moments` 8.067ms, sin `limit` (R-02) |
| NFR-003 0 endpoints 500 | **PARCIAL / NO VERIFICABLE** | 13/79 en SPEC; no re-ejecutado (regla read-only) |
| NFR-004 uptime / sin SPOF worker | **PARCIAL (mejor que SPEC)** | worker **ONLINE** 11d (devops); nodo único sigue SPOF |
| NFR-005 capacidad host | **PARCIAL** | swap 39% OK; RAM libre 2,1Gi al límite |
| NFR-006 secretos cifrados reposo | **PARCIAL** | AES-256-GCM solo 2 columnas; pago/IA en claro (S-2) |
| NFR-007 rate-limit auth | **EXISTE (corrige SPEC)** | Montado 5/15min+3/h; memory store multinodo |
| NFR-008 RBAC sin fugas cross-tenant | **AUSENTE** | 3 P0 vivos (socket, /public, LogTickets) |
| NFR-009 bcrypt≥12 | **AUSENTE** | cost 8 (S-1) |
| NFR-010 meta tenants | **AUSENTE** | Sin meta declarada |
| NFR-011 sesiones WhatsApp bajo carga | **NO VERIFICABLE** | Sin prueba de carga autorizada |
| NFR-012 retención/particionado | **AUSENTE** | 0 tablas particionadas, sin TTL (db-esquema) |
| NFR-013 i18n | **AUSENTE** | 0 `useTranslation`; `i18n.t()` legacy en 4 páginas |
| NFR-014 compliance PII | **PARCIAL** + [jurídico] | Módulo LOPDP con olvido lógico; sin retención/exportación (seguridad-privacidad) |
| NFR-015 observabilidad | **AUSENTE** | `/metrics` 404; Prometheus/Grafana no corren (devops) |
| NFR-016 bundle ≤300KB gz | **INCUMPLE (SPEC obsoleta)** | Ya code-split (159 lazy); ruta eager 355KB gz (rendimiento R-07) |
| NFR-017 a11y WCAG 2.1 AA | **NO VERIFICABLE** | axe no ejecutado |
| NFR-018 design system | **PARCIAL** | 3 sistemas (Joy + Material + Tailwind/shadcn) (frontend) |
| NFR-019 webhooks pago firmados | **PARCIAL** | Stripe/PayPal EXISTE; Coingate/Telegram AUSENTE |
| NFR-020 envelope HTTP consistente | **AUSENTE** | 82 `{success,data}` vs 85 planos, 11 mixtos, sin helper (api-contratos) |

## Resumen de clasificación

| Clase | BR | FR | NFR | Total |
|---|---|---|---|---|
| EXISTE | 4 | 10 | 1 | 15 |
| PARCIAL | 5 | 11 | 6 | 22 |
| AUSENTE | 1 | 0 | 7 | 8 |
| INCUMPLE (NFR) | — | — | 3 | 3 |
| NO VERIFICABLE | 1 | 0 | 2 | 3 |
| MOCK (dentro de FR-007) | — | (1) | — | — |
| OBSOLETO (afirmaciones SPEC corregidas) | — | — | — | ≥5 (worker, bundle, FlowBuilder, xlsx, meta-debug) |

## Afirmaciones de la SPEC corregidas (OBSOLETO)

1. Worker "HOY STOPPED" → **ONLINE** 11d (devops).
2. Bundle "monolítico 2.75MB/703KB gz" → **code-split** (159 lazy), eager 355KB gz.
3. FlowBuilder "11 modales vacías" → **implementadas** (frontend).
4. `xlsx@0.18.5` con CVE → **0.20.3 parcheado** (seguridad-privacidad).
5. `wbotMessageListener.ts` 7.501 líneas → **6.764** (arquitectura, rendimiento).
6. Varios P0 de seguridad (webhooks pago sin firma, `/companies` filtra secretos, financiero sin `isSuper`, rate-limit sin montar) → **corregidos** (seguridad).
