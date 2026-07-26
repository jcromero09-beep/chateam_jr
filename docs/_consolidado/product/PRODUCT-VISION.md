# PRODUCT-VISION — chateam_jr (chateam-platform)

> Fase 1 del programa Spec-Driven · Visión y Alcance (business-first) · 2026-07-23.
> Este documento describe **qué DEBE SER el producto** desde el negocio, para poder confrontarlo
> después contra el sistema real. **No** diseña la solución técnica ni evalúa si el código funciona.
> Toda afirmación cita su fuente. Convención de estado:
> - **HIPÓTESIS** = no confirmado; requiere validación de negocio de JC.
> - **[SUPUESTO]/[PROPUESTA]/[DEUDA]** = heredadas de la ronda Spec-First (`SPEC.md:10-14`).
>
> Ubicación: `docs/_consolidado/product/` (mapea el `product/` del encargo dentro del árbol
> consolidado, junto a `spec/`, `plan/`, `tasks/`). Ver [BUSINESS-REQUIREMENTS.md](./BUSINESS-REQUIREMENTS.md)
> para los IDs BR/FR/NFR referenciados aquí.

---

## 1. Problema principal

Las empresas atienden a sus clientes por **muchos canales de mensajería a la vez** (WhatsApp,
Facebook/Instagram, Telegram, TikTok, web) y pierden trazabilidad: cada canal es una bandeja
distinta, sin historial unificado, sin asignación de equipo, sin conexión con el pipeline comercial
ni con la publicidad que originó la conversación.

> Evidencia: `CHATEAM.md:11-19`, `spec-first/fase1/01-vision-y-alcance.md:20-28`.

El problema secundario: **escalar esa atención y el marketing con IA sin perder el gobierno**
(trazabilidad comercial, medición del retorno, control de costos de IA).
> Evidencia: `01-vision-y-alcance.md:32-39`.

## 2. Propuesta de valor

**Frase canónica del producto** (`CHATEAM.md:17-19`):

> «Una bandeja única para conversar con clientes por cualquier canal, un motor de IA que ayuda a
> responder y a crear contenido, y una suite de marketing que conecta las conversaciones con la
> publicidad de Meta y mide el retorno real.»

Autodescripción: *«CRM omnicanal multi-tenant de la familia Whaticket, centrado en WhatsApp»*
(`CHATEAM.md:11-13`); en el login, *«Plataforma de comunicación omnicanal»* (`Login.tsx:94`).

En una línea de negocio: **un solo panel para que una PyME o agencia atienda todos sus canales con
un equipo y escale con IA sin perder trazabilidad comercial** — [SUPUESTO], segmento a confirmar
(`01-vision-y-alcance.md:30-39`).

## 3. Pilares del producto

Textual de `CHATEAM.md:26-38`:

1. **Bandeja omnicanal** — WhatsApp, Meta (FB/IG), Telegram, WebChat, TikTok y comentarios, todo en
   tickets unificados con asignación, colas y etiquetas. → **FR-001, FR-002**
2. **IA transversal** — respuestas asistidas, agentes conversacionales con RAG, generación de
   contenido. → **FR-020, FR-017**
3. **Marketing de rendimiento** — campañas Click-to-WhatsApp conectadas a Meta Ads con atribución y
   Conversions API. → **FR-011, FR-018**
4. **Motor estadístico** — recomendaciones sobre estadística real, «nunca reporta un número sin
   muestra mínima» (`CHATEAM.md:328-334, 421-422`). → **FR-021**
5. **Automatización operativa** — reglas, colas, flujos. → **FR-022, FR-012**

## 4. Diferenciación (dónde ya gana — proteger, no rehacer)

De la síntesis competitiva (`benchmark.md §5-7`, `spec-first/fase4/04h`, `04-benchmark §7`):

| # | Diferenciador | Evidencia | Estado |
|---|---|---|---|
| D1 | **Coexistencia Baileys ↔ WhatsApp Cloud API con failover por ticket** — ningún competidor la tiene | `04h §C`, `04-benchmark §7.2` | Ventaja única → **FR-002** |
| D2 | Self-host + omnicanal + **IA generativa/UGC** (fal.ai/Higgsfield/ComfyUI) en un solo panel | `04-benchmark §7.1` | Ventaja combinada → **BR-002, FR-017** |
| D3 | Multi-tenant más real que Tidio/Zendesk/ManyChat | `04-benchmark §1` | Ventaja → **BR-001** |
| D4 | Modelo económico: self-host ≈ 0 costo de licencia + créditos IA prepago propios (vs $79-279/mes o $0.99-2/resolución de los líderes) | `benchmark.md §5.3`, `04-benchmark §1` | Ventaja → **BR-004** |
| D5 | Amplitud funcional (≈20 módulos, 199 tablas): «el problema no es falta de features, es gobierno» | `benchmark.md §5` | Ventaja + advertencia |

**Competidores de referencia:** categoría (Chatwoot, Respond.io, Wati, Tidio, Intercom/Fin,
Zendesk, ManyChat) y hermanos/forks Whaticket (autoatende, isabox, atendechat, agenteia, ZapMulti)
(`04-benchmark §1`, `04b`).

## 5. Estrategia de producto derivada

No competir en features (ya gana en amplitud); la tesis es **cerrar los gaps de confianza y de
gobierno** para volver vendible una plataforma hoy más amplia que sus rivales pero no apta para
operar en `live` según la auditoría (veredicto **CRÍTICO**, `SPEC.md:44-47`):

1. **Confianza:** seguridad/compliance, RBAC sin fugas, secretos cifrados, webhooks de pago firmados.
   → **NFR-006, NFR-008, BR-008**
2. **Gobierno:** reporting que no esté en 500, observabilidad, medición de ROI de IA y de marketing.
   → **NFR-003, NFR-015, FR-021, FR-023**
3. **Empaquetado:** agente IA medible, design system, marca única. → **NFR-018, BR-007**

## 6. Gaps competitivos que definen el techo de "vendible"

De la paridad verificada (`04h`, `benchmark.md §3`) — capacidades que la categoría trata como
must-have y chateam **no tiene o tiene parcial** (no es una lista técnica, es alcance de negocio):

- **AUSENTE:** reglas de automatización server-side, macros, políticas SLA, auto-asignación
  round-robin, CSAT automático, requeue de campaña fallida, bulk actions, KB pública, marketplace
  de integraciones, agente IA de resolución **medible**.
- **PARCIAL:** API pública sin `/v1` ni keys con scope, webhooks salientes por evento, white-label,
  reporting con rollups, business hours.
- **Bloqueante de mercado:** compliance/SLA inexistente; reporting roto (13 endpoints en 500);
  observabilidad ausente.

> Estos gaps se traducen en requisitos y se priorizan en Fase Plan; aquí solo se declaran como
> límite del posicionamiento comercial actual.

## 7. Métrica-faro de la visión

Benchmark de IA a igualar: **tasa de resolución autónoma tipo Tidio Lyro = 67 %** (`04-benchmark §5
G3`). Es la métrica que valida el pilar «IA transversal» como propuesta de valor y no como feature.
Detalle en [SUCCESS-METRICS.md](./SUCCESS-METRICS.md).

---

## 8. Lo que esta visión NO decide (pendiente de negocio — JC)

1. **HIPÓTESIS** Segmento de mercado, vertical y tamaño de cliente objetivo — no hay posicionamiento
   explícito en código (`01-vision-y-alcance.md:37-39`).
2. **HIPÓTESIS** Pricing exacto — sólo existe una **propuesta** de planes en un doc de planificación
   ($9-$149/mes por volumen de mensajes, `PLAN_EVOLUCION_AGENTES_IA.md:676-705`), no precios
   vigentes. Ver [SUCCESS-METRICS.md §pricing].
3. **HIPÓTESIS** Expansión fuera de Ecuador (Brasil/LATAM) inferida del legado Gerencianet/PIX
   (`04-benchmark §6 P10`) — no confirmada.
4. Alcance de compliance (LOPDP Ecuador / RGPD) — requiere revisión legal (`SPEC.md:291`).
