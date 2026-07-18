# Fase 4 — Investigación competitiva + sondas · chateam_jr

> Playbook Spec-First. Regla de oro: primero el *qué* (spec), luego el *cómo*. Esta fase confronta
> `chateam_jr` contra los sistemas similares del mercado para decidir **qué mejorar y cómo**, combinando
> (a) **datos de sonda medidos** sobre landings públicas de competidores y sobre nuestro propio sistema, y
> (b) **investigación web 2025-2026** con precios y features verificados.
> Fecha: 2026-07-12. Solo lectura. Toda afirmación de mercado cita URL; toda métrica cita el JSON de sonda.
>
> **Fuentes de sonda:**
> - Competidores: `SPEC-FIRST/sondas/sondas-competidores.json` (A.4 peso/CWV, A.5 stack, A.1 nº colores —
>   medido sobre las landings de marketing públicas de chatwoot / respond.io / intercom / tidio / wati).
> - chateam: `SPEC-FIRST/sondas/sondas-padeldev.json` (A.1 colores/tipografía, A.2 cards, A.3 axe a11y,
>   A.4 peso — medido sobre la **app autenticada** en `https://padeldev.codigo.plus/` páginas
>   `dashboard`, `tickets`, `tags`).
> - Contexto de producto: `SPEC-FIRST/fase0/00-baseline.md`, `SPEC-FIRST/fase1/01-vision-y-alcance.md`,
>   `AUDITORIA_2026_07/05-integraciones/integraciones.md`, `AUDITORIA_2026_07/99-sintesis/RESUMEN.md`.
>
> **Convención:** ✅ = sí/nativo · 🟡 = parcial/limitado/con asterisco · ❌ = no · 🔴 = roto o riesgo crítico.

---

## 0. Caveat metodológico honesto (leer antes de las tablas de rendimiento)

Las dos sondas **no son 100% comparables** y hay que decirlo:

- Las cifras de **competidores** se midieron sobre su **landing de marketing pública** (home comercial, SSR/SSG,
  optimizada para SEO y primera impresión), no sobre su producto autenticado.
- Las cifras de **chateam** se midieron sobre la **app ya logueada** (SPA React tras login), con caché tibia:
  por eso `dashboard` transfiere 9 KB y `tags` 7 KB (solo viajó el JSON de la API; el shell JS/CSS ya estaba
  cacheado), mientras `tickets` transfiere 1.591 KB (`sondas-padeldev.json` a4). chateam **no tiene landing
  pública equivalente** que sondear (es un producto interno restaurado en `padeldev`).
- Conclusión: las comparaciones de **peso de página** sirven como orden de magnitud y para leer *arquitectura*
  (SSR vs SPA, nº de recursos, nº de colores), **no** como un ranking de "quién carga más rápido". Donde el dato
  es directamente comparable (nº de colores = consistencia de diseño; stack; accesibilidad axe) sí se compara
  de frente. El peso real del bundle de chateam está en la auditoría: **chunk monolítico 2.75 MB, 103 páginas
  eager** (`RESUMEN.md:83`, P1-19), y ése es el número honesto a mejorar.

---

## 1. Tabla comparativa maestra (features × competidor, con chateam en columna)

Leyenda: ✅ nativo · 🟡 parcial/limitado · ❌ no · 🔴 roto/riesgo. "MT" = multi-tenant real tipo SaaS/reseller.

| Feature | **chateam_jr** | Chatwoot | Respond.io | Wati | Tidio | Intercom (Fin) | Zendesk | Botpress | ManyChat |
|---|---|---|---|---|---|---|---|---|---|
| **WhatsApp Cloud API oficial (Meta)** | ✅ + Baileys no-oficial + **Coexistencia** (dif.) | ✅ | ✅ (sin markup) | ✅ (BSP) | ✅ (canal) | ✅ (canal) | ✅ | ✅ (hub) | ✅ |
| **Multi-tenant (MT)** | ✅ por `companyId` 157/187 tablas **🔴 sin defensa en profundidad** | 🟡 "accounts" (no reseller nativo) | 🟡 workspaces (Advanced) | 🟡 varios números (Business) | ❌ por asiento | 🟡 workspaces (Enterprise) | ❌ por agente | 🟡 workspaces | ❌ por cuenta |
| **IA / RAG / agentes** | ✅ RAG pgvector, **78 agentes**, UGC gen (fal.ai/Higgsfield/ComfyUI), OpenAI+Anthropic | ✅ Captain AI (GPT, KB, resúmenes) | ✅ AI Agents multicanal + voz (incluido) | 🟡 AI Co-pilot + no-code bot (créditos) | ✅ Lyro AI (67% resol., add-on) | ✅ **Fin — líder** ($0.99/resol.) | ✅ AI agents incluidos + Copilot | ✅ **builder líder** (switch GPT/Claude/Gemini) | 🔴 AI débil (keyword-ish, sin KB) |
| **Self-hosted / open-source** | ✅ (Node.js, infra propia) — dif. | ✅ **CE gratis** (Docker/K8s) | ❌ SaaS | ❌ SaaS | ❌ SaaS | ❌ SaaS | ❌ SaaS | ✅ (OSS + self-host) | ❌ SaaS |
| **Reporting / analytics** | 🟡 dashboard + atribución multi-touch **🔴 13 endpoints en 500** | ✅ | ✅ (avanzado en Advanced) | ✅ | ✅ | ✅ avanzado | ✅ (Explore) | ✅ | 🟡 básico |
| **Marketplace / integraciones** | 🟡 ~20 integraciones hardcoded, **sin marketplace** | ✅ apps + API | ✅ Zapier/Salesforce/HTTP | ✅ Shopify/Zapier/API | ✅ Shopify/apps | ✅ **App Store (ref.)** | ✅ **Marketplace 1000+ apps** | ✅ Integration Hub | ✅ integraciones |
| **SLA / compliance (RGPD/SOC2)** | 🔴 **ninguno** (sin SOC2, sin borrado RGPD, secretos en claro, sin rate-limit) | ✅ SOC2/GDPR/ISO (Enterprise) | ✅ GDPR/ISO27001/SOC2 | ✅ GDPR/ISO27001/SOC2 II | ✅ GDPR/SOC2/ISO | ✅ SOC2 II/GDPR/HIPAA/ISO | ✅ SOC2/ISO/HIPAA | ✅ SOC2/GDPR | 🟡 GDPR (Meta) |
| **Canales extra** | FB/IG/Messenger, comentarios FB/IG, Telegram, TikTok, WebChat, Email Mktg | Web, email, FB, IG, Twitter, Telegram, Line, SMS | FB, IG, SMS, email, voz | WhatsApp-centric | Web, email, IG, Messenger | Web, email, canales | Support/Chat/Talk/Guide | omnicanal vía hub | FB, IG, TikTok, SMS, email |
| **Diferenciadores propios** | Coexistencia Baileys↔Meta, **UGC/contenido IA**, afiliados, citas, Meta Ads attrib., créditos IA prepago | OSS maduro, comunidad | Gestión conversacional + voz | BSP WhatsApp puro | e-commerce + Lyro | Fin (resolución autónoma) | Suite CX completa | agent-builder dev-first | automatización IG/FB |
| **Pricing 2026** | SaaS por planes + créditos IA prepago (sin precio público); **self-host ≈ 0 licencia** | Cloud $0/$19/$39/$99 ag/mes · CE gratis · Captain $20/1k créditos | $79/$159/$279 mes + MAC + Meta | $59/$119/$279 mes (+~20% markup msg) | Free/$29/$59 asiento · Lyro +$39-289 | Asientos (~$29-132) + **Fin $0.99/resol.** ($49/mes base "for platforms") | $19-115 ag/mes + Suite $55 + IA ~$1.5-2/resol. | Free/$89/$495 + LLM aparte + Ent. $2000+ | $15-69/mes + AI +$29 + fees WA |

**Fuentes de mercado (URLs):**
[Chatwoot pricing](https://www.chatwoot.com/pricing) · [Chatwoot self-hosted](https://www.chatwoot.com/pricing/self-hosted-plans) · [Chatwoot pricing teardown 2026](https://dev.to/beton/chatwoot-pricing-teardown-2026-a7g) ·
[Respond.io pricing](https://respond.io/pricing) · [Respond.io WhatsApp API](https://respond.io/whatsapp-business-api) ·
[Wati pricing](https://www.wati.io/pricing/) · [Wati pricing 2026](https://www.flowcart.ai/blog/wati-pricing) ·
[Tidio pricing](https://www.tidio.com/pricing/) · [Lyro review](https://www.tidio.com/blog/lyro-review/) ·
[Intercom pricing](https://www.intercom.com/pricing) · [Fin AI pricing](https://fin.ai/pricing) · [Fin $0.99/resol.](https://www.gleap.io/blog/intercom-fin-ai-pricing-2026) ·
[Zendesk pricing](https://www.zendesk.com/pricing/) · [Zendesk AI guide 2026](https://myaskai.com/blog/zendesk-ai-agent-complete-guide-2026) ·
[Botpress pricing](https://botpress.com/pricing) · [Botpress review 2026](https://www.voiceflow.com/blog/botpress) ·
[ManyChat pricing](https://manychat.com/pricing) · [ManyChat pricing 2026](https://flowgent.ai/blog/manychat-pricing)

---

## 2. Tabla de métricas medidas por sonda (stack / peso / colores)

### 2.1 Competidores — landings públicas (`sondas-competidores.json`)

| Sistema | Stack (A.5) | TTFB | Load | Transfer | Recursos | Colores únicos (A.1) | CLS |
|---|---|---:|---:|---:|---:|---:|---:|
| **Chatwoot** | **Nuxt** (Vue SSR) | 991 ms | 4.685 ms | **1.493 KB** | 118 | **45** (más ruidoso) | 0 |
| **Respond.io** | **Astro v6.4.8** (SSG) | 96 ms | 4.126 ms | 1.321 KB | 106 | **21** (más limpio) | 0 |
| **Intercom** | (no detectado / custom) | 1.181 ms | 2.717 ms | **2.816 KB** | 98 | 28 | 0 |
| **Tidio** | **Next.js** | **45 ms** | **1.299 ms** | **853 KB** (más ligero) | 136 | 25 | 0 |
| **Wati** | (no detectado) | 398 ms | **6.161 ms** (más lento) | **2.862 KB** (más pesado) | **215** | 40 | 0 |

Lectura: los líderes de UX de landing (**Tidio 853 KB / Respond.io 21 colores**) apuestan por
**meta-frameworks con SSR/SSG** (Next/Astro/Nuxt) y **paletas disciplinadas** (21-28 colores). Wati es el
contra-ejemplo (2.862 KB, 215 recursos, 40 colores): pesado y ruidoso.

### 2.2 chateam — app autenticada (`sondas-padeldev.json`)

| Página | Stack | TTFB | Load | Transfer | Recursos | Colores únicos | Tipografía | axe (A.3) |
|---|---|---:|---:|---:|---:|---:|---|---:|
| **dashboard** | React 18 + Vite 7, MUI Joy+Material (SPA) | 1 ms | 239 ms | 9 KB* | 29 | **38** | Be Vietnam Pro | **10 violaciones** |
| **tickets** | idem | 8 ms | 349 ms | 1.591 KB | 47 | 28 | Be Vietnam Pro | 7 violaciones |
| **tags** | idem | 3 ms | 307 ms | 7 KB* | 32 | 26 | Be Vietnam Pro | 7 violaciones |

\* Transfer minúsculo = caché tibia post-login (solo viajó JSON de API). El coste real de arranque en frío es
el **bundle 2.75 MB / 103 páginas eager** de la auditoría (`RESUMEN.md:83`), no estos 7-9 KB.

**Contraste de colores (dato duro de consistencia de marca):** chateam dashboard usa **38 colores únicos** —
por encima de Respond.io (21), Tidio (25), Intercom (28) y a la par de Wati (40) / Chatwoot (45). Combinado con
**2 familias tipográficas mezcladas** ("Be Vietnam Pro" 1.627 nodos + "Inter" 31 + "Times New Roman" 29 —
`sondas-padeldev.json` a1.fontFamily) y **doble sistema MUI Joy v5 + Material v7** (`RESUMEN.md:30`), confirma
el hallazgo de Fase 3: **la paleta y la tipografía de chateam están sin gobernar** frente a los líderes.

### 2.3 Referencias de sector (benchmarks 2025)

- Peso mediano de home 2025: **2.86 MB desktop / 2.56 MB mobile** ([HTTP Archive Web Almanac 2025](https://almanac.httparchive.org/en/2025/page-weight)).
  → Intercom (2.816 KB) y Wati (2.862 KB) están **en la mediana**; Tidio/Respond.io/Chatwoot por **debajo** (bien).
  → El bundle 2.75 MB de chateam está en la mediana de *toda la web*, pero es un **CRM interno**, no una landing:
  debería ser mucho más ligero con lazy-loading (hoy 103 páginas eager).
- Complejidad mediana de home 2025: **1.257 elementos/página** ([WebAIM Million 2025](https://webaim.org/projects/million/2025)).

---

## 3. UX / diseño y rendimiento — chateam vs cada uno

| Dimensión | Dónde está chateam | Referente a copiar | Brecha |
|---|---|---|---|
| **Framework / entrega** | SPA React/Vite pura, **sin SSR/SSG** | Tidio (Next.js), Respond.io (Astro), Chatwoot (Nuxt) | chateam no necesita SSR para la app interna, pero **sí lazy-loading/code-splitting** (hoy bundle 2.75 MB monolítico). Media |
| **Peso / arranque en frío** | Bundle 2.75 MB, 103 páginas eager | Tidio 853 KB de landing; cualquier CRM moderno hace split por ruta | Alta — impacta TTI del primer login |
| **Consistencia de color** | **38 colores** (dashboard), sin tokens | Respond.io 21, Tidio 25 | Alta — Fase 3 debe fijar paleta canónica ≤ ~20-24 tokens |
| **Tipografía** | 3 familias mezcladas (Be Vietnam Pro + Inter + Times New Roman) | 1 familia + escala | Media — unificar a 1 familia + escala tipográfica |
| **Design system** | Doble MUI (Joy beta + Material v7), doble `@mui/system` | Sistema único con tokens | Alta — deuda de UI confirmada (`RESUMEN.md:30`) |
| **CLS (estabilidad visual)** | 0 en las 3 páginas (bien) | Todos 0 | Sin brecha ✅ |
| **Observabilidad / RUM** | prom-client + Sentry **desconectados**; sin CWV real de usuario | Intercom/Zendesk con RUM y dashboards | Alta — no hay medición de UX real en producción |

**Síntesis UX:** chateam no pierde por *arquitectura de red* (la app interna carga rápido con caché tibia:
239-349 ms), pierde por **gobierno visual** (38 colores, 3 tipografías, doble MUI) y por **peso de bundle en
frío**. Los diferenciadores de contenido (más módulos que todos) no se aprovechan si la primera impresión es
inconsistente.

---

## 4. Accesibilidad — chateam vs sector

**Nuestra sonda axe (`sondas-padeldev.json` a3_axe):**

| Página | Violaciones | Crítico | Serio | Moderado | Peor regla (nodos) |
|---|---:|---:|---:|---:|---|
| dashboard | **10** | 1 | 5 | 4 | `color-contrast` (51 nodos), `listitem` (97), `region` (108) |
| tickets | **7** | 1 | 3 | 3 | `listitem` (97), `list` (28), `button-name` (3, crítico) |
| tags | **7** | 1 | 3 | 3 | `listitem` (97), `color-contrast` (11), `button-name` (3) |

**Patrón:** las 3 páginas repiten el mismo esqueleto de fallos:
1. `button-name` (**crítico**, botones sin texto accesible) — 1-3 nodos por página.
2. `color-contrast` (**serio**) — de 11 hasta **51 nodos** en dashboard (encaja con el desorden de 38 colores).
3. `list` / `listitem` (**serio**) — `<li>` fuera de `<ul>/<ol>`: 28 + 97 nodos, error estructural sistémico
   (probablemente un componente de menú/lista mal marcado, se propaga a toda la app).
4. `region` / `landmark` / falta de `<h1>` (**moderado**) — contenido sin landmarks, sin encabezado nivel 1.

**Contexto de sector (2025):** la media de la web top-1M es **51 errores/home** y **94.8%** de páginas tienen
fallos WCAG 2 A/AA detectables; **6 issues (contraste bajo + alt faltante...) concentran el 96%** de los errores
([WebAIM Million 2025](https://webaim.org/projects/million/2025)). El contraste bajo es *el* problema #1 del
sector — chateam lo comparte (51 nodos). La buena noticia: son **~4 clases de fallo repetidas**, no 10-7-7
problemas distintos; **arreglar el componente de lista y el token de contraste cierra la mayoría de golpe**.
Ningún competidor publica su score axe interno, pero sus productos maduros (Intercom/Zendesk) tienen equipos de
a11y dedicados y cumplimiento WCAG comercial — chateam parte de cero aquí.

---

## 5. GAPS de chateam (qué le falta vs líderes)

| # | Gap | Evidencia | Quién lo tiene resuelto | Severidad |
|---|---|---|---|---|
| **G1** | **Compliance/SLA inexistente** (sin SOC2, sin RGPD/derecho al olvido, secretos en claro, webhooks forjables, sin rate-limit) | `RESUMEN.md` §3 (14 P0), `fase1 §6`; 2 fugas P0 confirmadas en vivo | Chatwoot/Respond/Wati/Tidio/Intercom/Zendesk (SOC2+GDPR) | 🔴 Bloqueante para vender |
| **G2** | **Sin marketplace de integraciones** (~20 integraciones hardcoded, no extensible por terceros) | `integraciones.md`; sin API pública de apps | Intercom (App Store), Zendesk (1000+ apps), Botpress Hub | Alta |
| **G3** | **Sin agente IA de resolución autónoma estilo Fin** (tiene 78 agentes y RAG, pero no un "cierra tickets solo" medible por resolución) | `fase1 §3.18`, catálogo de agentes | Intercom Fin ($0.99/resol.), Zendesk AI agents, Tidio Lyro (67%) | Alta (es el diferenciador comercial 2026) |
| **G4** | **Reporting roto / inmaduro** (13 endpoints en 500, dashboards de tickets caídos) | `RESUMEN.md:78` (P1-14), `fase1 §6` | Todos tienen reporting funcional | 🔴 Alta |
| **G5** | **Sin observabilidad / RUM** (prom-client+Sentry desconectados, sin CWV real, sin `/health` monitoreado) | `RESUMEN.md:97`, `fase1 §6` | Intercom/Zendesk con RUM | Alta |
| **G6** | **Onboarding pobre** (11 nodos FlowBuilder vacíos, sin seed de etapas Kanban, "plan demo" sin flujo guiado) | `fase1 §3.13`, `§4.3` | Chatwoot 30 min setup WA; Respond.io wizard | Media |
| **G7** | **Design system sin gobernar** (38 colores, 3 tipografías, doble MUI) | `sondas-padeldev.json` a1; `RESUMEN.md:30` | Respond.io (21 colores), sistemas con tokens | Media |
| **G8** | **Bundle monolítico 2.75 MB** (103 páginas eager, sin split) | `RESUMEN.md:83` (P1-19) | CRMs modernos con split por ruta | Media |
| **G9** | **Sin i18n funcional** (i18next instalado, 0 páginas lo usan; todo español hardcoded) | `fase1 §6` i18n | Respond.io/Tidio/Lyro multi-idioma | Media (limita mercado fuera de EC) |
| **G10** | **Multi-tenant frágil** (aislamiento 100% dependiente de `where companyId`, `tenantMiddleware` en 2/129 rutas) | `RESUMEN.md` §5.4 | (chateam ya es más MT que Tidio/Zendesk/ManyChat, pero inseguro) | 🔴 Alta |

---

## 6. OPORTUNIDADES priorizadas (qué copiar/mejorar y por qué · impacto × esfuerzo)

Priorización: **impacto comercial** (¿desbloquea venta / diferencia?) vs **esfuerzo** (jornadas-persona aprox.,
alineado con las Olas de remediación de `RESUMEN.md §6`).

| Prio | Oportunidad (qué copiar/mejorar) | Referente | Por qué | Impacto | Esfuerzo |
|---|---|---|---|---|---|
| **P1** | **Cerrar los 14 P0 de seguridad/compliance** (secretos cifrados, webhooks firmados, RBAC, rate-limit) → habilita empezar el camino a SOC2/RGPD | Todos los rivales ya son SOC2/GDPR | Sin esto **no se puede vender ni operar con claves `live`** (G1); es la barrera de entrada del sector | 🔥 Máximo | Alto (Olas 0-1, ~2-3 sem) |
| **P2** | **Reparar reporting** (13 endpoints 500 + dashboards de tickets) | Cualquier competidor | Un CRM sin reportes gerenciales no es demostrable en una venta (G4); esfuerzo bajo, ganancia visible | 🔥 Alto | Bajo (~2 d, `RESUMEN.md:129`) |
| **P3** | **Empaquetar "Agente IA de resolución" medible** (reusar los 78 agentes + RAG pgvector como un "resuelve tickets solo", con métrica de % resolución) | **Intercom Fin** / Tidio Lyro (67%) | chateam **ya tiene la infra** (RAG + agentes + créditos); falta el *producto* y la *métrica* que vende. Diferenciador 2026 (G3) | 🔥 Alto | Medio (empaquetado, no from-scratch) |
| **P4** | **Gobernar el design system** (paleta ≤ ~22 tokens, 1 tipografía, resolver MUI Joy vs Material) | Respond.io (21 colores) | Primera impresión consistente; hoy 38 colores/3 tipografías (G7). Insumo directo de Fase 3 | Medio | Medio (~3-5 d, `RESUMEN.md:137`) |
| **P5** | **Code-splitting + lazy-load** del bundle 2.75 MB | CRMs modernos | TTI del primer login; barato en relación al impacto percibido (G8) | Medio | Medio (~3-4 d, `RESUMEN.md:136`) |
| **P6** | **Onboarding guiado** (completar/ocultar nodos FlowBuilder vacíos, seed de etapas Kanban, wizard "conecta tu WhatsApp en 30 min" al estilo Chatwoot) | Chatwoot (setup WA 30 min), Respond.io wizard | Reduce fricción de activación del "plan demo" (G6) | Medio | Medio |
| **P7** | **Observabilidad/RUM** (reconectar prom-client/Sentry, CWV reales, probe de `/health`) | Intercom/Zendesk | Necesario para prometer cualquier SLA y para no operar a ciegas (G5) | Medio | Medio (~2 d, `RESUMEN.md:138`) |
| **P8** | **Arreglar los ~4 clusters axe** (component de lista `<li>`, token de contraste, `button-name`, landmarks/`<h1>`) | Sector WCAG | 4 fixes cierran el grueso de 10/7/7 violaciones; requisito para clientes enterprise/gobierno | Medio | Bajo-Medio |
| **P9** | **Marketplace / API pública de integraciones** | Intercom App Store, Zendesk, Botpress Hub | Escala el ecosistema sin construir cada integración (G2); estratégico a mediano plazo | Alto (largo plazo) | Alto |
| **P10** | **i18n real** (activar i18next, extraer strings, inglés/portugués) | Respond.io/Tidio | Abre mercado fuera de Ecuador; el legado Gerencianet/PIX sugiere intención Brasil (G9) | Medio | Alto |

---

## 7. Diferenciadores de chateam (dónde ya gana — protegerlos, no rehacerlos)

Frente a los gaps a cerrar, chateam **ya tiene ventajas reales** que ningún rival combina en un solo producto:

1. **Self-hosted + multicanal + IA generativa/UGC en un solo panel.** Chatwoot es self-host pero **no genera
   contenido** (video/imagen/audio IA); ManyChat automatiza IG/FB pero **su IA es débil**; Intercom/Zendesk son
   potentes pero **SaaS puro, caros y sin self-host**. chateam es de los pocos que junta **open/self-host +
   omnicanal + UGC IA + afiliados + citas + Meta Ads attribution** (`fase1 §3`).
2. **Coexistencia Baileys ↔ WhatsApp Cloud API** con failover por ticket (`OutboundRoutingService`,
   `integraciones.md:74`) — flexibilidad que los BSP puros (Wati) y los SaaS (Respond.io tiene coexistence, pero
   no Baileys no-oficial como fallback) no ofrecen igual.
3. **Modelo económico agresivo:** self-hosted ≈ **0 costo de licencia** vs $79-279/mes (Respond.io/Wati),
   $0.99/resolución (Fin) o $2/resolución (Zendesk). Con IA por **créditos prepago** propios, el margen y el
   precio de venta son controlables — arma competitiva directa contra el "AI meter" de los líderes.
4. **Amplitud funcional** superior a todos en un solo tenant: 187 tablas, 857 servicios, 20 módulos
   (`fase0 §2`) — el problema **no es falta de features sino gobierno** (seguridad, reporting, UX).

**Estrategia derivada:** chateam **no debe competir en features** (ya gana), debe **cerrar los gaps de
confianza** (P1 seguridad/compliance, P2 reporting, P7 observabilidad) y **empaquetar lo que ya tiene** (P3
agente IA medible, P4 design system) para volver vendible una plataforma que hoy es técnicamente más amplia que
sus rivales pero **no apta para operar en `live`** (`RESUMEN.md:10`, veredicto CRÍTICO).

---

## 8. Fuentes

**Sondas (datos medidos):**
- `SPEC-FIRST/sondas/sondas-competidores.json` — A.1/A.4/A.5 de chatwoot, respond.io, intercom, tidio, wati.
- `SPEC-FIRST/sondas/sondas-padeldev.json` — A.1/A.2/A.3/A.4 de dashboard, tickets, tags de chateam.

**Contexto de producto:** `fase0/00-baseline.md`, `fase1/01-vision-y-alcance.md`,
`AUDITORIA_2026_07/05-integraciones/integraciones.md`, `AUDITORIA_2026_07/99-sintesis/RESUMEN.md`.

**Investigación web 2025-2026 (features/pricing):**
- Chatwoot: https://www.chatwoot.com/pricing · https://www.chatwoot.com/pricing/self-hosted-plans · https://dev.to/beton/chatwoot-pricing-teardown-2026-a7g · https://www.eesel.ai/blog/chatwoot-pricing
- Respond.io: https://respond.io/pricing · https://respond.io/whatsapp-business-api · https://chatimize.com/reviews/respond-io/
- Wati: https://www.wati.io/pricing/ · https://www.flowcart.ai/blog/wati-pricing · https://www.ycloud.com/blog/wati-pricing
- Tidio / Lyro: https://www.tidio.com/pricing/ · https://www.tidio.com/blog/lyro-review/ · https://www.builtabot.com/blog/tidio-pricing-review-2026-alternatives
- Intercom / Fin: https://www.intercom.com/pricing · https://fin.ai/pricing · https://www.gleap.io/blog/intercom-fin-ai-pricing-2026 · https://www.getmacha.com/blog/intercom-fin-ai-agent-complete-guide
- Zendesk: https://www.zendesk.com/pricing/ · https://myaskai.com/blog/zendesk-ai-agent-complete-guide-2026 · https://www.richpanel.com/learn/zendesk-pricing
- Botpress: https://botpress.com/pricing · https://www.voiceflow.com/blog/botpress · https://sitegpt.ai/blog/botpress-ai-review
- ManyChat: https://manychat.com/pricing · https://flowgent.ai/blog/manychat-pricing · https://www.voiceflow.com/blog/manychat
- Benchmarks de sector: https://almanac.httparchive.org/en/2025/page-weight · https://webaim.org/projects/million/2025
