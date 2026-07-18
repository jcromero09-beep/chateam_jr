# Benchmark competitivo — chateam_jr (resumen ejecutivo)

> Síntesis accionable de [`SPEC-FIRST/fase4/04-benchmark-competitivo.md`](../SPEC-FIRST/fase4/04-benchmark-competitivo.md)
> (detalle completo, tablas extensas, URLs de mercado y notas de método allí). Confronta `chateam_jr` contra 8
> competidores del sector CRM conversacional / atención omnicanal, combinando **sondas medidas** y
> **investigación web 2025-2026**. Fecha: 2026-07-12.
>
> Leyenda: ✅ nativo · 🟡 parcial/limitado · ❌ no · 🔴 roto/riesgo crítico.

---

## 0. Caveat de método (una línea)

Las cifras de peso de página de competidores se midieron sobre su **landing pública** (SSR/SSG optimizada);
las de chateam sobre la **app autenticada** (SPA tras login, caché tibia). Sirven como orden de magnitud y
lectura de arquitectura, **no** como ranking de velocidad. El número honesto de chateam a mejorar es el
**bundle 2.75 MB / 103 páginas eager** de la auditoría. Datos directamente comparables (nº de colores = consistencia
de marca; stack; axe a11y) sí se comparan de frente.

---

## 1. Tabla features × competidor

| Feature | **chateam_jr** | Chatwoot | Respond.io | Wati | Tidio | Intercom (Fin) | Zendesk | Botpress | ManyChat |
|---|---|---|---|---|---|---|---|---|---|
| WhatsApp Cloud API oficial | ✅ + Baileys + **Coexistencia** | ✅ | ✅ | ✅ (BSP) | ✅ | ✅ | ✅ | ✅ | ✅ |
| Multi-tenant (SaaS/reseller) | ✅ `companyId` 157/187 **🔴 sin defensa profundidad** | 🟡 accounts | 🟡 workspaces | 🟡 varios nº | ❌ | 🟡 workspaces | ❌ | 🟡 | ❌ |
| IA / RAG / agentes | ✅ RAG pgvector, 78 agentes, **UGC gen** | ✅ Captain | ✅ +voz | 🟡 co-pilot | ✅ Lyro | ✅ **Fin líder** | ✅ | ✅ **builder líder** | 🔴 débil |
| Self-hosted / open-source | ✅ (dif.) | ✅ **CE gratis** | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Reporting / analytics | 🟡 dashboard+atribución **🔴 13 endpoints 500** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Marketplace integraciones | 🟡 ~20 hardcoded, **sin marketplace** | ✅ | ✅ | ✅ | ✅ | ✅ App Store | ✅ **1000+** | ✅ Hub | ✅ |
| SLA / compliance (RGPD/SOC2) | 🔴 **ninguno** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 🟡 |
| Pricing 2026 | SaaS+créditos IA (sin precio público); **self-host ≈ 0 licencia** | $0-99 ag/mes · CE gratis | $79-279/mes | $59-279/mes | Free-$59 asiento | asientos + **Fin $0.99/resol.** | $19-115 ag/mes + IA ~$2/resol. | Free-$495 + LLM | $15-69/mes |

Canales extra de chateam: FB/IG/Messenger, comentarios FB/IG, Telegram, TikTok, WebChat, Email Marketing.

---

## 2. Métricas de sonda

### Competidores (landings públicas)
| Sistema | Stack | TTFB | Load | Transfer | Recursos | Colores | 
|---|---|---:|---:|---:|---:|---:|
| Chatwoot | Nuxt (Vue SSR) | 991ms | 4.685ms | 1.493 KB | 118 | **45** (más ruidoso) |
| Respond.io | Astro (SSG) | 96ms | 4.126ms | 1.321 KB | 106 | **21** (más limpio) |
| Intercom | custom | 1.181ms | 2.717ms | 2.816 KB | 98 | 28 |
| Tidio | Next.js | **45ms** | **1.299ms** | **853 KB** (más ligero) | 136 | 25 |
| Wati | — | 398ms | **6.161ms** | **2.862 KB** (más pesado) | **215** | 40 |

### chateam — app autenticada
| Página | TTFB | Load | Transfer | Colores | axe |
|---|---:|---:|---:|---:|---:|
| dashboard | 1ms | 239ms | 9 KB* | **38** | **10 violaciones** |
| tickets | 8ms | 349ms | 1.591 KB | 28 | 7 |
| tags | 3ms | 307ms | 7 KB* | 26 | 7 |

\* Caché tibia post-login (solo viajó JSON de API). Coste real de arranque en frío = **bundle 2.75 MB / 103
páginas eager**.

**Lecturas clave:**
- **Consistencia de marca:** chateam dashboard usa **38 colores** vs Respond.io 21 / Tidio 25 / Intercom 28.
  Combinado con 3 familias tipográficas mezcladas y doble MUI (Joy v5 + Material v7) → paleta y tipografía **sin gobernar**.
- **Arquitectura de entrega:** los líderes de UX (Tidio Next.js, Respond.io Astro, Chatwoot Nuxt) usan SSR/SSG.
  chateam no necesita SSR para app interna, pero **sí code-splitting** (hoy monolítico).
- **a11y:** patrón repetido de ~4 clusters (`button-name` crítico, `color-contrast` 51 nodos, `list/listitem`
  28+97 nodos, `region`/`<h1>` faltante). Arreglar el componente de lista + token de contraste cierra la mayoría.

---

## 3. Los 10 GAPS de chateam vs líderes

| # | Gap | Severidad | Quién lo tiene resuelto |
|---|---|---|---|
| **G1** | Compliance/SLA inexistente (sin SOC2, sin RGPD/borrado, secretos en claro, webhooks forjables, sin rate-limit; 14 P0, 2 fugas confirmadas en vivo) | 🔴 Bloqueante para vender | Todos los SaaS rivales |
| **G2** | Sin marketplace de integraciones (~20 hardcoded, no extensible por terceros) | Alta | Intercom, Zendesk (1000+), Botpress Hub |
| **G3** | Sin agente IA de resolución autónoma medible tipo Fin (tiene 78 agentes+RAG, falta el *producto* + métrica de % resolución) | Alta (dif. comercial 2026) | Intercom Fin, Zendesk AI, Tidio Lyro (67%) |
| **G4** | Reporting roto/inmaduro (13 endpoints 500, dashboards de tickets caídos) | 🔴 Alta | Todos |
| **G5** | Sin observabilidad / RUM (prom-client+Sentry desconectados, sin CWV real, `/health` sin monitor) | Alta | Intercom/Zendesk (RUM) |
| **G6** | Onboarding pobre (11 nodos FlowBuilder vacíos, sin seed de etapas Kanban, "plan demo" sin flujo guiado) | Media | Chatwoot (WA 30min), Respond.io (wizard) |
| **G7** | Design system sin gobernar (38 colores, 3 tipografías, doble MUI) | Media | Respond.io (21 colores) |
| **G8** | Bundle monolítico 2.75 MB (103 páginas eager, sin split) | Media | CRMs modernos (split por ruta) |
| **G9** | Sin i18n funcional (i18next instalado, 0 páginas lo usan; todo español hardcoded) | Media | Respond.io/Tidio (multi-idioma) |
| **G10** | Multi-tenant frágil (aislamiento 100% dependiente de `where companyId`, `tenantMiddleware` en 2/129 rutas) | 🔴 Alta | (chateam ya es más MT que Tidio/Zendesk, pero inseguro) |

---

## 4. Las 10 OPORTUNIDADES priorizadas (impacto × esfuerzo)

| Prio | Oportunidad | Referente | Impacto | Esfuerzo |
|---|---|---|---|---|
| **P1** | Cerrar los 14 P0 de seguridad/compliance (secretos cifrados, webhooks firmados, RBAC, rate-limit) → camino a SOC2/RGPD | Todos (SOC2/GDPR) | 🔥 Máximo — **sin esto no se puede vender ni operar en `live`** (G1) | Alto (~2-3 sem) |
| **P2** | Reparar reporting (13 endpoints 500 + dashboards de tickets) | Cualquiera | 🔥 Alto — un CRM sin reportes no es demostrable en venta (G4) | Bajo (~2d) |
| **P3** | Empaquetar "Agente IA de resolución" medible (reusar 78 agentes + RAG como "resuelve tickets solo" con % resolución) | Intercom Fin, Tidio Lyro | 🔥 Alto — ya tiene la infra, falta el producto/métrica (G3) | Medio |
| **P4** | Gobernar el design system (paleta ≤~22 tokens, 1 tipografía, resolver Joy vs Material) | Respond.io (21) | Medio — primera impresión consistente (G7) | Medio (~3-5d) |
| **P5** | Code-splitting + lazy-load del bundle 2.75 MB | CRMs modernos | Medio — TTI del primer login (G8) | Medio (~3-4d) |
| **P6** | Onboarding guiado (completar/ocultar nodos FlowBuilder, seed Kanban, wizard "conecta WhatsApp en 30 min") | Chatwoot, Respond.io | Medio — activación del plan demo (G6) | Medio |
| **P7** | Observabilidad/RUM (reconectar prom-client/Sentry, CWV reales, probe `/health`) | Intercom/Zendesk | Medio — necesario para SLA y no operar a ciegas (G5) | Medio (~2d) |
| **P8** | Arreglar los ~4 clusters axe (lista `<li>`, contraste, `button-name`, landmarks/`<h1>`) | Sector WCAG | Medio — requisito enterprise/gobierno (P8 cierra 10/7/7 de golpe) | Bajo-Medio |
| **P9** | Marketplace / API pública de integraciones | Intercom App Store, Zendesk, Botpress | Alto (largo plazo) — escala el ecosistema sin construir cada integración (G2) | Alto |
| **P10** | i18n real (activar i18next, extraer strings, EN/PT) | Respond.io/Tidio | Medio — abre mercado fuera de Ecuador; legado Gerencianet/PIX sugiere Brasil (G9) | Alto |

**Orden estratégico:** P1→P2→P7 (cerrar gaps de confianza) antes de P3→P4 (empaquetar y pulir lo que ya gana).

---

## 5. Diferenciadores a proteger (dónde ya gana)

1. **Self-hosted + multicanal + IA generativa/UGC en un solo panel** — ningún rival combina los tres (Chatwoot
   es self-host pero no genera contenido; ManyChat automatiza IG/FB pero su IA es débil; Intercom/Zendesk son
   SaaS puro, caros, sin self-host).
2. **Coexistencia Baileys ↔ Cloud API con failover por ticket** (`OutboundRoutingService`) — flexibilidad que
   los BSP puros (Wati) y los SaaS no ofrecen igual.
3. **Modelo económico agresivo** — self-host ≈ 0 licencia vs $79-279/mes o $0.99-2/resolución; IA por créditos
   prepago propios → margen y precio controlables.
4. **Amplitud funcional** superior a todos (187 tablas, 857 servicios, 20 módulos). **El problema no es falta de
   features sino gobierno** (seguridad, reporting, UX).

> **Conclusión estratégica:** chateam no debe competir en features (ya gana); debe **cerrar los gaps de
> confianza** (P1/P2/P7) y **empaquetar lo que ya tiene** (P3/P4) para volver vendible una plataforma hoy más
> amplia que sus rivales pero **no apta para operar en `live`** (veredicto de auditoría: CRÍTICO).

---

**Fuentes:** detalle, URLs de pricing 2026 y benchmarks de sector (HTTP Archive Web Almanac 2025, WebAIM
Million 2025) en [`SPEC-FIRST/fase4/04-benchmark-competitivo.md`](../SPEC-FIRST/fase4/04-benchmark-competitivo.md).
Datos de sonda: `SPEC-FIRST/sondas/sondas-competidores.json`, `sondas-padeldev.json`.
