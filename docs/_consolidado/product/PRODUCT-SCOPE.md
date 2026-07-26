# PRODUCT-SCOPE — chateam_jr

> Fase 1 Spec-Driven · Alcance funcional del producto · 2026-07-23. Define **dominios**,
> **capacidades obligatorias vs opcionales** y **fuera de alcance**, en clave de negocio. No audita
> el estado del código (eso es la Fase de Auditoría técnica). Cada capacidad enlaza su ID
> (ver [BUSINESS-REQUIREMENTS.md](./BUSINESS-REQUIREMENTS.md)).
> Fuente principal de dominios: `CHATEAM.md:121-354` (referencia funcional construida del código
> real) + `spec/SPEC.md §5` + `01-vision-y-alcance.md §3`.

---

## 1. Dominios funcionales (10 secciones, como aparecen en la app)

Agrupación textual de `CHATEAM.md:138-354`:

| Sección de la app | Módulos | IDs |
|---|---|---|
| **INICIO** | Dashboard/KPIs, Leads Kanban, Analítica | FR-023, FR-006 |
| **OPERATIVO** | Tickets (bandeja), Contactos, Mensajes Rápidos, Chats Internos, Mensajes Programados | FR-001, FR-003, FR-004, FR-005 |
| **ORGANIZACIÓN** | Colas, Etiquetas, Automatizaciones, Funnel de Ventas | FR-008, FR-022, FR-006 |
| **CANALES** | Conexiones, Coexistencia Meta, Comentarios FB/IG, Moderación, WebChat, TikTok | FR-002, FR-009, FR-010 |
| **MARKETING** | Campañas CTWA, UGC & Contenido, Facebook Ads, Monitor de señales/EMQ, Email Marketing | FR-011, FR-017, FR-018, FR-016 |
| **CITAS Y FLUJOS** | Citas/Agendas, FlowBuilder | FR-007, FR-012 |
| **AFILIADOS** | Afiliados/Partners | FR-015 |
| **IA** | Agentes, Generación de contenido, Recomendaciones estadísticas, Proveedores, Fine-tuning, Costos IA | FR-020, FR-021, FR-013 |
| **CONFIGURACIÓN** | Ajustes de company, canales, integraciones | (transversal) |
| **PLATAFORMA (super-admin)** | Empresas, Planes, Usuarios y Roles, Facturación | FR-019, FR-014, FR-024 |

**Canales soportados** (`CHATEAM.md:121-132`): WhatsApp Baileys, WhatsApp Cloud API, FB Messenger,
Instagram, Telegram, WebChat, TikTok.

## 2. Capacidades OBLIGATORIAS (core — definen la categoría del producto)

Son must-have porque (a) la doc las declara «corazón del producto» o (b) el benchmark las trata como
must-have de categoría que todos los competidores tienen (`04b: Núcleo común`, `04-benchmark §1`).

| Capacidad core | Por qué es obligatoria | ID |
|---|---|---|
| Bandeja de tickets omnicanal | «Corazón del producto», «pantalla más rica» (`CHATEAM.md:237-242`) | FR-001 |
| WhatsApp oficial (Cloud API) + no-oficial (Baileys) con Coexistencia | Diferenciador y núcleo de mensajería | FR-002 |
| CRM de contactos (listas, etiquetas, campos custom) | Núcleo común Whaticket (`04b`) | FR-003 |
| Colas + asignación de agentes | Team inbox estándar de categoría (`04f §3`) | FR-001, FR-024 |
| Funnel/Kanban de leads | Núcleo común (`04b`) | FR-006 |
| Campañas WhatsApp | Núcleo común (`04b`) | FR-011 |
| Etiquetas, Mensajes rápidos | Núcleo común (`04b`) | FR-008, FR-004 |
| Reporting/Dashboard funcional | Must-have de categoría (`04-benchmark §1`) | FR-023 |
| Multi-tenant por planes | Modelo de negocio del producto | BR-001, BR-006 |
| RBAC sin fugas + secretos cifrados | Umbral de confianza para operar `live` | NFR-006, NFR-008 |
| Agente IA con RAG | AI-first es parte de la propuesta de valor | FR-020 |
| Moderación humana de comentarios sensibles | «Cola de revisión obligatoria, cero publicación automática» en cuentas en campaña política (`CHATEAM.md:269-274`) | FR-009 |
| Deduplicación CAPI por `event_id` | Regla obligatoria de integración Meta (`CHATEAM.md:359-365`) | FR-018 |
| Regla estadística: no reportar sin muestra mínima | Invariante del motor estadístico (`CHATEAM.md:328-334`) | FR-021 |

## 3. Capacidades OPCIONALES / avanzadas (diferenciadoras o por plan)

Activables por plan (`Plan.interfacePermissions`) o valor añadido no imprescindible para la categoría:

| Capacidad | Nota | ID |
|---|---|---|
| Generación IA de imagen/video/audio (UGC), HeyGen, fine-tuning | Avanzada, gateada por plan (`CHATEAM.md:304-326`) | FR-017 |
| A/B testing (email/campañas) | Avanzada | FR-016 |
| Afiliados/Partners | Opcional (`CHATEAM.md`, sección AFILIADOS) | FR-015 |
| Email Marketing multi-provider | Opcional; varios providers son stub (§4) | FR-016 |
| Sync Google/Outlook Calendar en citas | Avanzada | FR-007 |
| FlowBuilder (constructor visual de flujos) | Avanzada | FR-012 |
| WhatsApp Cloud API directa | «Oculto por defecto» (`CHATEAM.md:276`) | FR-002 |
| Marketing / Meta Ads insights + atribución multi-touch | Diferenciador | FR-018 |
| TikTok como canal | Opcional | FR-001 |

## 4. Fuera de alcance / no comprometido (requiere decisión de JC)

**No prometer comercialmente hasta confirmar.** Todo esto es material que la doc marca como
incompleto, dudoso o ausente — **[SUPUESTO]/HIPÓTESIS**, no veredicto de auditoría:

| Ítem | Estado declarado | Fuente | Decisión pendiente |
|---|---|---|---|
| 11 nodos FlowBuilder (Audio/Img/List/Pdf/Text/URL/Video/Interval/Menu/Randomizer/SingleBlock) | Carpetas de UI vacías | `01-vision-y-alcance.md:139-141` | ¿Completar o descartar? |
| Doble sistema de Afiliados (plataforma vs IA) | Dos sistemas coexistiendo | `01-vision-y-alcance.md:154-156` | ¿Consolidar o intencional? |
| Providers Email (SendGrid/SES/Carbonio) | Stubs según heurística | `01-vision-y-alcance.md:158-160` | ¿Cuáles son vendibles? |
| i18n (inglés/portugués) | Dependencia instalada, 0 páginas la usan | `01-vision-y-alcance.md:366` | ¿Se requiere multi-idioma? |
| 5º rol (ej. facturación / portal cliente) | Sin evidencia | `SPEC.md:69-70` | ¿Basta el modelo actual? |
| Marketplace de integraciones, KB pública | Ausentes (gap competitivo) | `benchmark.md §3` | ¿Entran al roadmap? |
| Compliance LOPDP/RGPD, derecho al olvido | No evaluado | `SPEC.md:291` | Requiere revisión legal |
| Expansión fuera de Ecuador | Inferida del legado PIX/Brasil | `04-benchmark §6 P10` | HIPÓTESIS de mercado |

## 5. Roadmap futuro declarado (no es alcance de esta ronda)

De `ROADMAP.md:24-30`: dashboard de plataforma, cuotas/feature-flags por empresa, visor de auditoría
de impersonación, migración de storage a S3, romper el monolito `wbotMessageListener.ts`. Sistema
autoevaluado ~75/100 y declarado «funcional en producción» (`ROADMAP.md:8-11`) — **HIPÓTESIS** de la
propia doc, no verificado en esta fase.

## 6. Límite explícito de esta fase

Este documento describe **alcance de producto**, no estado de implementación. La clasificación
EXISTE/PARCIAL/AUSENTE/MOCK/NO-VERIFICABLE de cada capacidad se produce en la **Fase de Auditoría
técnica** (parcialmente hecha en `audit/parts/`, ver `audit/00_ESTADO_PROGRAMA.md`).
