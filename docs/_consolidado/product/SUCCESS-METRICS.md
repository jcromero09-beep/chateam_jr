# SUCCESS-METRICS — chateam_jr

> Fase 1 Spec-Driven · Métricas de éxito del producto y metas de RNF · 2026-07-23.
> **Advertencia de método:** casi todas las metas numéricas son **[PROPUESTA]** del analista o
> **[SUPUESTO]** de negocio — **no son SLA contractuales** hasta que JC las valide (`SPEC.md:211-212`).
> Los «valores observados» provienen de sondas GET ya ejecutadas en la Auditoría 2026-07 (no se
> generó tráfico nuevo en Fase 1). Cada meta enlaza su ID de [BUSINESS-REQUIREMENTS.md](./BUSINESS-REQUIREMENTS.md).

---

## 1. Métricas-faro (North Star) — [HIPÓTESIS de negocio, validar con JC]

| Métrica-faro | Por qué importa | Referencia | ID |
|---|---|---|---|
| **Tasa de resolución autónoma por IA** | Valida el pilar «IA transversal» como valor, no como feature | Benchmark a igualar: Tidio Lyro **67 %** (`04-benchmark §5 G3`) | FR-020 |
| **ROI de marketing atribuible** (conversaciones → ventas por campaña Meta) | Es la promesa central: «mide el retorno real» | `CHATEAM.md:17-19` | BR-008, FR-018 |
| **Tenants activos de pago** | Salud del modelo SaaS | Hoy 15 companies (`SPEC.md:225`) — base, no meta | BR-001 |

> Ninguna fuente fija una meta propia de ingresos/usuarios de chateam (`04-benchmark §6`): **BR-010
> pendiente**.

## 2. Metas de negocio / producto — pendientes de JC

| Objetivo | Estado | Fuente |
|---|---|---|
| Segmento + pricing objetivo definidos | **[HIPÓTESIS]** — sin posicionamiento en código | `SPEC.md:36` |
| Meta de tenants a 12 meses (para dimensionar infra) | **[SUPUESTO]** sin declarar | `SPEC.md:225` (NFR-010) |
| Resolución IA objetivo | SLA IA sugerido 95 % → 99 % → 99.9 % | `PLAN_EVOLUCION_AGENTES_IA.md:1890` |

### Pricing propuesto (NO vigente — HIPÓTESIS de doc de planificación)
De `PLAN_EVOLUCION_AGENTES_IA.md:676-705`, **solo como referencia de modelado, no precios reales**:
Starter 500 msg $9/mes · Pro 2.000 $19 · Business 5.000 $39 · Enterprise 20.000 $79 · Enterprise+
50.000 $149 · Custom a cotizar. Add-ons +$10 a +$25. Se atribuye 95-99 % más barato que
Intercom/Zendesk. → **BR-010, decide JC**.

## 3. Metas de RNF (umbral de «vendible / apto para live»)

Fuente: `SPEC.md §6` (tabla RNF). Prioridad por AGENTS.md Regla 5.

### 3.1 Seguridad y datos (máxima prioridad)
| ID | Meta [estado] | Observado (referencia auditoría) |
|---|---|---|
| NFR-006 | 100 % secretos de terceros cifrados en reposo (AES-256-GCM) **[PROPUESTA]** | 0 % cifrado salvo `IntegrationConnection` |
| NFR-008 | 0 fugas cross-tenant (suite de sondas 79+ endpoints × 4 perfiles) **[PROPUESTA]** | 2 fugas P0 confirmadas (`/companies`, `/settingsFacebook`) |
| NFR-019 | 0 webhooks de pago sin firma verificada **[PROPUESTA]** | Stripe/PayPal sin validar firma [P0] |
| NFR-007 | Login 5 intentos/15min; signup 3/h **[PROPUESTA]** | limiters definidos, 0 montados |
| NFR-009 | bcrypt cost ≥ 12 **[PROPUESTA]** | `hash(password, 8)` |
| NFR-014 | Proceso de borrado/exportación/retención PII **[SUPUESTO — legal]** | No evaluado; `Contacts` 11.406, `Messages` 79.025 en claro |

### 3.2 Continuidad y disponibilidad
| ID | Meta [estado] | Observado |
|---|---|---|
| NFR-003 | 0 endpoints en 500; error-rate < 0.1 % **[PROPUESTA]** | 13/79 sondados (16 %) en 500 |
| NFR-004 | Uptime 99.5 %/mes; sin worker como SPOF **[PROPUESTA]** | Nodo único; worker `stopped` en auditoría |
| NFR-005 | swap < 80 %, RAM libre > 2 Gi **[PROPUESTA]** | swap 100 %, load 34.5 (host compartido) |
| NFR-015 | `/metrics` + probe de `/health` + dashboards **[PROPUESTA]** | prom-client/Sentry desconectados |

### 3.3 Rendimiento
| ID | Meta [estado] | Observado |
|---|---|---|
| NFR-001 | Dashboard p95 < 800 ms **[PROPUESTA]** | admin 2.629 ms (3× la meta) |
| NFR-002 | Listados p95 < 1.500 ms con paginación **[PROPUESTA]** | `/dashboard/moments` 8.067 ms |
| NFR-016 | Bundle inicial ≤ 300 KB gz **[PROPUESTA]** | 2.75 MB (703 KB gz), 103 páginas eager |

### 3.4 Escalabilidad y datos
| ID | Meta [estado] | Observado |
|---|---|---|
| NFR-010 | Meta de tenants a 12m **[SUPUESTO]** | 15 hoy; sin meta |
| NFR-011 | Límite real de sesiones WhatsApp/nodo validado bajo carga **[PROPUESTA]** | `MAX_SESSIONS=60`, no probado |
| NFR-012 | Retención 90-180d + particionado **[PROPUESTA]** | `LogTickets` 225.613 filas, sin TTL |

### 3.5 Experiencia y UI
| ID | Meta [estado] | Observado |
|---|---|---|
| NFR-017 | WCAG 2.1 AA en flujos core; 0 críticas axe **[PROPUESTA]** | 2 bloqueos sistémicos P0 |
| NFR-018 | ≤12 colores/pantalla, 2 familias, escala de 8 **[PROPUESTA]** | 38/28/26 colores por pantalla |
| NFR-013 | i18n EN/PT si el negocio lo requiere **[SUPUESTO]** | i18next instalado, 0 uso |

## 4. Línea base pendiente de re-medir (bloquea fijar cifras)

**[PENDIENTE]** Las cifras del brief de negocio —tiempo de respuesta ~20.8 días (meta <1h), 117
tickets sin asignar, satisfacción 0 %— **no se pudieron corroborar** en Fase 1: `GET /dashboard`
devuelve el objeto agregado pero su body numérico no quedó capturado, y los endpoints de detalle
(`/tickets/counts`, `/dashboard/ticketsUsers`) están en 500 (`SPEC.md:235-237`,
`01-vision-y-alcance.md:339-350`). **Requiere re-ejecutar la sonda autenticada capturando el body
completo** antes de fijar cualquiera de estas tres cifras como línea base contractual.

## 5. Regla de gobierno de métricas

- Ninguna meta pasa de **[PROPUESTA]/[SUPUESTO]** a **compromiso** sin validación explícita de JC
  (`SPEC.md §9.6`).
- Cada meta debe ser **medible por el gate** (`scripts/ci-gate.sh`) o por una sonda reproducible
  antes de declararse cumplida (AGENTS.md Regla 3: evidencia antes de afirmar).
- Invariante de producto ya obligatorio (no propuesta): el **motor estadístico nunca reporta un
  número sin muestra mínima** (`CHATEAM.md:328-334`) → FR-021.
