# BUSINESS-REQUIREMENTS — chateam_jr

> Fase 1 Spec-Driven · Catálogo maestro de requisitos con **IDs estables** · 2026-07-23.
> Este es el registro canónico de IDs `BR-*` (negocio), `FR-*` (funcionales) y `NFR-*` (no
> funcionales). Cada requisito es una **necesidad**, no un diseño. Estado del requisito (cumplido /
> parcial / ausente) **no** se decide aquí: se confronta en la Fase de Auditoría. La columna
> «Realidad declarada» solo cita lo que la doc/auditoría previa ya dijo, marcado como referencia.
>
> Prioridad de negocio (AGENTS.md Regla 5): seguridad → datos → auth → continuidad → funcionalidad →
> contratos → rendimiento → UI.

---

## 1. Requisitos de negocio (BR)

| ID | Requisito | Fuente | Realidad declarada (referencia, no veredicto) |
|---|---|---|---|
| **BR-001** | SaaS **multi-tenant** con aislamiento por `companyId` entre empresas | `CHATEAM.md:66-68`, `MULTI-TENANT.md` | Por columna en 157/187 tablas; sin defensa en profundidad [DEUDA] `SPEC.md:161-162` |
| **BR-002** | Producto **self-hosted** desplegable (ventaja de costo: ≈0 licencia) | `benchmark.md §5.3` | EXISTE (corre en padeldev) |
| **BR-003** | **Onboarding** con Plan Demo / trial al alta | `SignUp.tsx:280`, `Plan.ts:trial/trialDays` | NOMBRE en código |
| **BR-004** | **Monetización dual**: suscripción por plan + **créditos IA prepago** | `01-vision-y-alcance.md:34-39`, `Company.aiTokenBalance` | EXISTE (tablas de créditos) |
| **BR-005** | **Multi-gateway de pago**: Stripe, PayPal, Gerencianet/PIX, Coingate (+MercadoPago/Apple IAP) | `suscripciones-planes-spec.md:4,12` | EXISTE; webhooks **sin validar firma** [P0] `01-vision-y-alcance.md:152` |
| **BR-006** | **Gating de features por plan** vía `interfacePermissions` (~90 flags) | `permissions.ts`, `Plan.ts:26-155` | EXISTE; es la fuente real del RBAC de menú [DEUDA] |
| **BR-007** | **Marca única / white-label** por empresa | `design-system.md`, `04h` (white-label PARCIAL) | PARCIAL |
| **BR-008** | **ROI de marketing medible**: atribución multi-touch + Meta Conversions API con dedup | `CHATEAM.md:359-365`, `FR-018` | EXISTE parcial; Graph API expirada [P0] `SPEC.md:96` |
| **BR-009** | Programa de **afiliados/partners** con comisiones y retiros | `01-vision-y-alcance.md:154-156` | PARCIAL; doble sistema a consolidar |
| **BR-010** | **[HIPÓTESIS]** Segmento, vertical, tamaño de cliente y **pricing** objetivo definidos | `SPEC.md:36,284` | AUSENTE en código — pendiente JC |
| **BR-011** | **[HIPÓTESIS]** Estrategia de expansión geográfica (¿LATAM/Brasil?) | `04-benchmark §6 P10` | Inferido de legado PIX — pendiente JC |

## 2. Requisitos funcionales (FR)

| ID | Requisito (capacidad de usuario/sistema) | Módulo | Fuente |
|---|---|---|---|
| **FR-001** | Bandeja **omnicanal** de tickets: ver/filtrar/asignar/cerrar tickets de todos los canales; notas, etiquetas, SLA | Tickets | `01-vision-y-alcance.md §3.2` |
| **FR-002** | WhatsApp **dual** Baileys + Cloud API con **Coexistencia** y failover por ticket | Conexiones | `§3.3`, `04h §C` |
| **FR-003** | CRM de **contactos**: CRUD, import/export, listas, etiquetas, campos custom, temperatura, memoria semántica | Contactos | `§3.4` |
| **FR-004** | **Mensajes rápidos** con sugerencia semántica (embeddings) | Quick Replies | `§3.5` |
| **FR-005** | **Chats internos** entre agentes | Chats Internos | `§3.6` |
| **FR-006** | **Funnel/Kanban** de leads con log de movimientos y clasificación IA | Funnel | `§3.7` |
| **FR-007** | **Citas/agendas**: servicios, disponibilidad, reservas, recordatorios, sync Google/Outlook, sugerencias IA | Citas | `§3.8` |
| **FR-008** | **Etiquetas** de color para tickets/contactos | Etiquetas | `§3.9` |
| **FR-009** | **Comentarios FB/IG**: auto-responder + **moderación humana obligatoria** en cuentas sensibles | Comentarios | `§3.10`, `CHATEAM.md:269-274` |
| **FR-010** | **WebChat** embebible público con `apiKey` por company | WebChat | `§3.11` |
| **FR-011** | **Campañas WhatsApp** masivas (CTWA): crear, lista, plantilla, envío escalonado | Campañas | `§3.12` |
| **FR-012** | **FlowBuilder**: constructor visual de flujos con nodos | FlowBuilder | `§3.13` |
| **FR-013** | **Créditos/Costos IA**: saldo, uso, rentabilidad global (super) | Créditos IA | `§3.14` |
| **FR-014** | **Suscripciones/Planes**: definir planes, pagar/renovar (multi-gateway) | Billing | `§3.15` |
| **FR-015** | **Afiliados/Partners**: links referido, comisiones, retiros | Afiliados | `§3.16` |
| **FR-016** | **Email Marketing**: campañas, plantillas, automatizaciones, A/B, tracking | Email | `§3.17` |
| **FR-017** | **UGC & contenido IA**: generación imagen/video/audio; creadores/device farm | UGC | `§3.18` |
| **FR-018** | **Marketing Meta Ads**: insights, atribución multi-touch, Conversions API con dedup por `event_id` | Marketing | `§3.19`, `CHATEAM.md:359-365` |
| **FR-019** | **Super-admin**: gestionar companies, planes, consumo de tokens IA, T&C | Super-admin | `§3.20` |
| **FR-020** | **Agentes IA** conversacionales con **RAG** sobre base de conocimiento propia (pgvector) | IA | `CHATEAM.md:26-38`, `SPEC.md:26` |
| **FR-021** | **Motor estadístico** de recomendaciones con regla de **muestra mínima** | IA | `CHATEAM.md:328-334` |
| **FR-022** | **Automatizaciones** (reglas sobre eventos de ticket) | Automatizaciones | `CHATEAM.md` sección ORGANIZACIÓN |
| **FR-023** | **Dashboard/Analítica**: KPIs agregados de conversación/IA, Origen de Cliente, Reportes | Dashboard | `§3.1` |
| **FR-024** | **Roles y usuarios / RBAC**: 4 roles + permisos por plan; modelo nuevo `Role.ts` en migración | Roles | `roles-usuarios-spec.md`, `Role.ts:42-57` |

## 3. Requisitos no funcionales (NFR)

Metas objetivo en [SUCCESS-METRICS.md](./SUCCESS-METRICS.md). Aquí solo el enunciado y su ID.

| ID | Requisito | Categoría | Fuente |
|---|---|---|---|
| **NFR-001** | Latencia de dashboard acotada (meta p95 < 800 ms) | Rendimiento | `SPEC.md:216` |
| **NFR-002** | Listados grandes paginados (meta p95 < 1.500 ms) | Rendimiento | `SPEC.md:217` |
| **NFR-003** | **0 endpoints en 500** antes de release; error-rate < 0.1 % | Continuidad | `SPEC.md:218` |
| **NFR-004** | Disponibilidad de plataforma (meta **[PROPUESTA]** 99.5 %/mes; sin SPOF de worker) | Continuidad | `SPEC.md:219` |
| **NFR-005** | Capacidad del host sana (swap < 80 %, RAM libre > 2 Gi) | Continuidad | `SPEC.md:220` |
| **NFR-006** | **100 % de secretos de terceros cifrados en reposo** (AES-256-GCM) | Seguridad | `SPEC.md:221` |
| **NFR-007** | **Rate limiting** montado en login (5/15min) y signup (3/h) | Auth | `SPEC.md:222` |
| **NFR-008** | **RBAC sin fugas cross-tenant** (0 fugas verificadas por suite de sondas) | Seguridad | `SPEC.md:223` |
| **NFR-009** | Hash de contraseña **bcrypt cost ≥ 12** | Auth | `SPEC.md:224` |
| **NFR-010** | **[SUPUESTO]** Meta de tenants a 12 meses para dimensionar | Escalabilidad | `SPEC.md:225` |
| **NFR-011** | Límite real de sesiones WhatsApp/nodo validado bajo carga | Escalabilidad | `SPEC.md:226` |
| **NFR-012** | Política de **retención + particionado** de tablas de alto crecimiento | Datos | `SPEC.md:227` |
| **NFR-013** | **[SUPUESTO]** i18n (EN/PT) si el negocio lo requiere | Alcance | `SPEC.md:228` |
| **NFR-014** | **[SUPUESTO]** Compliance PII (LOPDP/RGPD): borrado/exportación/retención | Compliance | `SPEC.md:229` — requiere legal |
| **NFR-015** | **Observabilidad** activa: `/metrics`, probe de `/health`, dashboards | Continuidad | `SPEC.md:230` |
| **NFR-016** | Bundle inicial del frontend ≤ 300 KB gz (lazy por ruta) | Rendimiento UI | `SPEC.md:231` |
| **NFR-017** | Accesibilidad **WCAG 2.1 AA** en flujos core (0 críticas axe) | UI | `SPEC.md:232` |
| **NFR-018** | **Design system** consistente (≤12 colores/pantalla, 2 familias, escala de 8) | UI | `SPEC.md:233` |
| **NFR-019** | **Webhooks de pago con firma verificada** (Stripe/PayPal) antes de activar plan/crédito | Seguridad | `01-vision-y-alcance.md:152` |
| **NFR-020** | **Envelope HTTP** de respuesta declarado y consistente por API | Contratos | `SPEC.md:157-158` |

## 4. Trazabilidad y reglas del catálogo

- **IDs estables:** una vez asignado, un ID no se reutiliza ni se renumera. Requisitos retirados se
  marcan `DEPRECATED`, no se borran.
- **Un requisito → ≥1 módulo/acceptance.** Los criterios de aceptación ejecutables viven en
  `spec/acceptance/*.md` (22 archivos existentes) y `spec/modules/*.md` (25). La Fase Plan mapeará
  cada FR/NFR a su acceptance concreto.
- **Regla 6 (AGENTS.md):** ninguna tarea de implementación se abre sin spec + acceptance ligada a un
  ID de este catálogo.
- **Confrontación:** el estado real (EXISTE/PARCIAL/AUSENTE/MOCK/NO-VERIFICABLE) por ID se produce en
  la Fase de Auditoría técnica, no aquí.
