# Fase 0 — Preparación y Línea Base (Spec-First · chateam_jr)

> Playbook Spec-First. Regla de oro: primero el *qué* (spec), luego el *cómo* (plan), recién después el código. Esta fase evita "auditar a ciegas".

## 1. Acceso confirmado
- **Código**: `/home/jcromero09/chateam_jr` (restaurado de backup 2026-07-12). Solo lectura para auditoría.
- **Sistema corriendo**: https://padeldev.codigo.plus (SPA en `/`, backend `/be/`, socket `/socket.io/`). Backend local `127.0.0.1:3010`.
- **Credenciales demo (copia restaurada, reseteadas)**:
  | perfil | email | pass |
  |---|---|---|
  | super-admin | admin@chateam.com | Chateam.Admin2026 |
  | admin | bryan@gmail.com | Probe.2026 |
  | supervisor | dinaspa@gmail.com | Probe.2026 |
  | user | christian@smarttrack.com | Probe.2026 |

## 2. Stack confirmado
| Capa | Tecnología | Versión |
|---|---|---|
| Backend | Node.js + TypeScript (ESM, tsx) · Express 4 | node 22.22 |
| ORM/DB | Sequelize · **PostgreSQL 17 + pgvector 0.8.5** | pg17 |
| Cache/colas | Redis 7 · Bull | |
| Tiempo real | Socket.IO (namespace por companyId) | 4.x |
| Frontend | React 18 + Vite 7 + TypeScript · **MUI Joy (beta) + Material 7** | |
| Mensajería | Baileys 7.0.0-rc13 + WhatsApp Cloud API (Meta) + Coexistencia | |
| Runtime | PM2 (1 nodo lean :3010 + worker), Docker (pg/redis), nginx | |
| Observabilidad | prom-client, Sentry, pino/winston (mayormente **desconectada**) | |
| Multi-tenant | por columna `companyId` (157/187 tablas) | |

Conteos reales: **129 rutas, 142 controladores, 857 servicios, 198 modelos, 187 tablas (344 MB), 336 archivos frontend, 121+32 dependencias.**

## 3. Módulos / pantallas (del menú + routes)
Gestión (Dashboard, Origen de Cliente, Reportes, Leads Kanban) · Analítica · Tickets · Contactos · Mensajes Rápidos · Chats Internos · Funnel de Ventas · Dashboard Kanban · Agendas/Citas · Etiquetas · Conexiones · Comentarios FB/IG · WhatsApp API · WebChat · Campañas · UGC & Contenido · Marketing (Meta Ads) · Email Marketing · Auto-Responder · FlowBuilder · Créditos IA · Suscripciones/Planes · Afiliados/Partners · Super-admin.

163 páginas / 163 rutas en el frontend (03-frontend-inventory).

## 4. Objetivo de la ronda (SUPUESTO — confirmar con JC)
Combinado: **(a) ordenar/modernizar el frontend** (marca consistente, simetría, menú ordenado), **(b) reducir bugs y deuda** (13 endpoints en 500, worker caído, seguridad), **(c) preparar para escalar/vender** (multi-tenant sólido, RNF medibles). Si el foco real es distinto (p.ej. solo vender, o solo estabilizar), se re-prioriza el PLAN-TOTAL (Fase 6).

## 5. Qué ya está auditado (para NO repetir) — `AUDITORIA_2026_07/`
16 dominios spec-driven ya producidos (veredicto **CRÍTICO**, ~136 hallazgos, 14 P0 únicos):
| # | Dominio | # | Dominio |
|---|---|---|---|
| 01 | backend (rutas/ctrl/svc) | 09 | pagos (Stripe/PayPal/Efí/Coingate) |
| 02 | base de datos (187 tablas) | 10 | Meta API + Coexistencia (versiones) |
| 03 | frontend (componentes) | 11 | rendimiento back + web-vitals front |
| 04 | tecnologías/deps | 12 | accesibilidad (WCAG) |
| 05 | integraciones | 13 | observabilidad |
| 06 | seguridad (auth/RBAC/tenancy) | 14 | deuda técnica/arquitectura |
| 07 | infra/runtime | 15 | testing/QA |
| 08 | sondas RBAC en vivo (79 endpoints×4 perfiles) | 99 | síntesis global |

**Este playbook EXTIENDE eso** hacia: Spec-First formal (Fase 1), design system + IA de menú (Fase 3, con sondas de estilos computados que la auditoría de código NO cubrió), benchmark competitivo profundo con sondas (Fase 4), y consolidación en `/spec` + `/plan/PLAN-TOTAL.md` (Fases 5-6).

## 6. Métricas línea-base observables (Dashboard) — a confirmar en vivo (Fase 1.6)
Del brief: tiempo de respuesta ~20.8 días (meta <1h), 117 tickets sin asignar, satisfacción 0%. Se validarán con sonda en la Fase 1.

## Pendiente de tu input (Apéndice B) — no bloquea, refina
- Objetivo real de negocio de la ronda (§4).
- Logo/manual de marca oficial (fija la paleta canónica, Fase 3).
- Acceso a demos públicas de competidores (Fase 4; si no, uso landings públicas).
