# Fase 4d — Análisis de MB Suite (mb-suite.com)

> Fuente: WebFetch de mb-suite.com/es + WebSearch. MB Suite es una **plataforma de marketing digital + CRM all-in-one para agencias/empresas/freelancers** ($97/mes; tiers agencia 10-100 cuentas; 14 días trial). Más amplia en marketing que chateam; el valor está en sus piezas CRM y de agencia.

## Qué es (9 áreas, 45+ módulos)
Analytics · Paid Media · Social Media · SEO · Email Marketing · **CRM** (Sales Pipeline, WhatsApp Business nativo, telefonía multi-país, Calendar Booking, **Sequences**, Sales AI, atribución de ingresos) · **Management** (Tasks, Projects, Contacts, Media Library, **Knowledge Base**, Activity, Vault, **Web Forms**) · Workspace (roles, partners, branding) · **Agency** (cuentas cliente, vistas cross-account, **portal white-label**).

**IA**: 4 motores (Gemini, OpenAI, Anthropic + "MIA" propia) con **function-calling sobre datos reales** (consultan métricas, crean tareas, generan contenido). OAuth 2.0 oficial a 14 plataformas; cifrado en tránsito y reposo.

## Features/automatizaciones × ¿chateam las tiene? × acción
| Feature MB Suite | chateam hoy | Acción |
|---|---|---|
| **Sequences / cadencias** (flujos con delays y ventanas de envío) | Campañas puntuales; FlowBuilder chatbot | **Implementar** motor de secuencias (drip) |
| **Web Forms** (captura de leads → CRM) | No | **Implementar** (lead-gen) |
| **Knowledge Base / Help Center** público | Solo "Help" interno | Implementar KB (coincide con Chatwoot) |
| **Atribución de ingresos** (UTM real, origen de lead) | Solo FB CAPI | Mejorar (atribución multi-fuente) |
| **AI agents con function-calling** sobre datos CRM | RAG/AIAgent existe | Mejorar (herramientas sobre datos propios) |
| **Portal white-label / multi-cuenta agencia** | Multi-tenant sí; white-label parcial | **Implementar** (monetización reseller) |
| **Dashboards drag-and-drop + entrega programada de reportes + alertas/monitores** | Dashboards fijos (varios en 500) | Mejorar (refuerza reporting) |
| **Calendar Booking** | Citas/Appointments ✅ | Paridad OK |
| **Tasks/Projects con subtareas y recurrencia** | No (Tasks lo tienen los hermanos) | Implementar (coincide con benchmark hermanos) |
| Paid Media / SEO / Social Planner / Auto-Budget | Fuera de alcance | **NO adoptar** (chateam es omnicanal/soporte, no gestor de pauta) |

## Qué adoptar (priorizado para chateam)
1. **Web Forms** (captura de leads embebible → contacto/ticket) — lead-gen barato, alto valor comercial.
2. **Sequences/cadencias** (drip con delays/ventanas) — encaja sobre el motor de eventos de Chatwoot (04c).
3. **Knowledge Base público** — soporte self-service (también en Chatwoot).
4. **Portal white-label de agencia** — chateam se vende como reseller (familia whatzardilapp); empaquetar white-label multi-cuenta es diferenciador de negocio.
5. **AI agents con function-calling sobre datos** + **reportes programados/alertas**.

## Fuera de alcance (no confundir el foco)
MB Suite es marketing-suite (pauta, SEO, social planning). chateam es **CRM omnicanal de conversación/soporte**. No perseguir paridad de marketing; sí tomar las piezas CRM+agencia arriba.

Fuentes: [mb-suite.com/es](https://www.mb-suite.com/es) · [mb-suite.com/features/management/tasks](https://mb-suite.com/features/management/tasks) · [mb-suite.com/about](https://mb-suite.com/about)
