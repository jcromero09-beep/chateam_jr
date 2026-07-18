# Spec — Navegación y Arquitectura de Información (IA)

> Módulo: `navegacion-ia` · Estado: **PROPUESTO** (sin implementar) · Fecha: 2026-07-15
> Origen: feedback de testing — *"demasiadas interfaces, los usuarios no las entienden"*.
> Aceptación: [`spec/acceptance/navegacion-ia.md`](../acceptance/navegacion-ia.md) · Plan: [`plan/PLAN-FASE-3-NAVEGACION.md`](../../plan/PLAN-FASE-3-NAVEGACION.md)
> Método: [`plan/GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md`](../../plan/GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md)

---

## 1. Problema (enunciado por el negocio)

Testing reporta que **muchas opciones nunca se llegaron a probar porque los usuarios no las entienden**.
No es "faltan features": es que la superficie es ilegible. Se abre la puerta a **rediseño y
simplificación**, alineado con la competencia, para luego pasar a **testing real con 5+ usuarios**.

## 2. Auditoría — estado actual medido (2026-07-15)

Fuente: `frontend/src/components/AppLayout.tsx`, `menuSections` (línea ~280).

| Métrica | Valor |
|---|---|
| Secciones de nivel 1 | 10 |
| **Destinos navegables** | **104** (34 top-level + 70 en submenú) |
| Grupos desplegables | 19 |
| Ítems con `module` asignado | 125 |
| Ítems restringidos por rol | 16 (15 `super`, 1 `admin+super`) |
| Pantallas en `pages/` | **170** (163 raíz + 7 en `pages/Integrations/`) |

### 2.0 ⚠️ HALLAZGO N0.2 — el eje "rol" casi no existe (corrige §4 y §10)

Medido en `AppLayout.tsx` + `hooks/usePermissions.ts` + `utils/permissions.ts`:

| Cómo se filtra cada ítem del menú | Ítems |
|---|---|
| Por **PLAN** (`module` + `canAccess`) | **88** |
| Por **ROL** (`roles: [...]`) | **16** |
| Sin gate | 0 |

- **`canAccess(module)` consulta los permisos del PLAN**, no el rol: `if (isSuperAdmin) return true; return hasAccessByPlan(planPermissions, module, ...)`. El propio archivo lo declara: *"Modificado para soportar permisos por Plan (no por Rol)"*.
- **Roles reales: 4** — `super | admin | supervisor | user` (`utils/permissions.ts`). `SPEC.md` decía admin/supervisor/agente: **incompleto**. Resuelve el pendiente §10.
- **141 módulos** en la unión `Module`.

> **Consecuencia que redefine el problema**: un **agente** y un **admin con el mismo plan ven los mismos
> 88 destinos**. El menú expone **lo que la empresa compró**, no **lo que la persona hace**. Esto explica
> el *"no lo entienden"* mejor que cualquier hipótesis de agrupación: al agente de soporte se le muestra
> toda la superficie de marketing/IA/admin porque el *plan* la incluye.
>
> **Corrección a §4/§9**: era falso que *"la infraestructura ya existe y reagrupar sea solo reordenar
> datos"*. La infraestructura gatea por **plan**; **el eje rol hay que construirlo**. El diseño correcto
> es de **dos ejes**:
>
> ```
> visible = f(plan)  ∩  f(rol)
>            ↑            ↑
>       ya existe    NO existe (16/104 ítems)
> ```
>
> Esto **no** invalida la viabilidad, pero **sí** el tamaño de N2: deja de ser "reordenar un array" y pasa
> a incluir un **mapa rol→módulos** que hoy no existe. Reestimar N2 de M-L a **L**.

Distribución por sección:

| Sección | Top | Sub | Destinos |
|---|---|---|---|
| MARKETING & CAMPAÑAS | 5 | 26 | **31** |
| CANALES | 4 | 11 | 15 |
| INTELIGENCIA ARTIFICIAL | 4 | 10 | 14 |
| HERRAMIENTAS | 2 | 9 | 11 |
| SISTEMA | 2 | 7 | 9 |
| AFILIADOS | 1 | 5 | 6 |
| **OPERATIVO** | 6 | 0 | **6** |
| CLASIFICACIÓN | 5 | 0 | 5 |
| CONFIGURACIÓN | 4 | 0 | 4 |
| INICIO | 1 | 2 | 3 |

### 2.1 Diagnóstico (el hallazgo, no la queja)

**El trabajo diario son 6 de 104 destinos (6%).** El menú refleja el **árbol de capacidades del
sistema**, no el **trabajo del usuario**. El 94% restante es superficie de configuración, marketing, IA
y administración que un agente de soporte no toca nunca, pero cuya carga cognitiva paga cada día.

> **Corolario que define el diseño**: el problema NO es "hay demasiadas pantallas". Es que están
> ordenadas por lo que el sistema *puede hacer* en vez de por lo que el usuario *viene a hacer*.
> Por eso **borrar opciones es la solución equivocada al problema correcto**.

## 3. Decisión de método — por qué NO instrumentamos telemetría primero

Se evaluó y **se descartó** arrancar por telemetría de navegación (hoy inexistente: cero tracking de
rutas en front, cero modelos de auditoría de acceso en backend).

**Razón**: los usuarios *no entienden* las opciones. Medir uso sobre una UI incomprensible mide
**confusión, no valor**: una pantalla valiosa pero mal explicada marcaría cero, y al "esconder lo no
usado" la borraríamos por un problema de comprensión. La telemetría **cristalizaría el error actual**.

- **Aplica** telemetría *después* del rediseño, como medición de éxito (§7).
- **Evidencia válida ahora**: benchmark de IA de competidores + testing moderado con usuarios reales.

> Es el mismo antipatrón que el mock `Math.random` del ROAS (§3.2 de la guía): decidir sobre datos que
> no significan lo que parecen.

### 2.2 HALLAZGO N0.4c — Dashboard unificado configurable (input del usuario, medido)

**Propuesta**: un solo dashboard con una **lista seleccionable de indicadores** (widgets), en vez de N
pantallas-dashboard separadas.

**Evidencia que lo respalda** (medido en `nav_map.json`): **18 de los 104 destinos (17%) son
dashboards/analytics/reportes**, dispersos en **7 secciones**:

| Dominio | Vistas dashboard |
|---|---|
| Operativo | `/` (Gestión), Leads Kanban |
| Canales | WhatsApp Dashboard, WebChat Analytics |
| Marketing | UGC, Campaign Insights, Campaign Audit, Email (dashboard + analytics), Créditos Email, Auto-Reply |
| Citas | Appointments Dashboard, Reportes |
| Afiliados | Afiliados Dashboard |
| IA | Plataforma IA, Costos IA, Rentabilidad IA |
| Sistema | Consumo Tokens IA |

**Viabilidad: alta con una salvedad de invariante.**
- **A favor**: ya existe base de widgets (`components/dashboard/`: `StatCard`, `MetricCard`,
  `ActivityChart`, `TicketsDonut`). Un dashboard configurable colapsa 18 destinos a **1–2**.
- **Salvedad §6 (crítica)**: colapsar 18 dashboards **borraría 17 rutas** ⇒ **viola el invariante** salvo
  que cada vista se preserve como **widget seleccionable** o como **preset/vista guardada con deep-link**
  (p.ej. `/dashboard?view=campaigns`). El invariante se cumple **por estado ruteado**, no eliminando.
- **Falta infra**: **no hay persistencia de layout por usuario**. Requiere columna/tabla de
  preferencias (`User.dashboardConfig` o `UserDashboardWidget`) para guardar qué indicadores eligió cada
  usuario/rol. Es trabajo de **backend + modelo**, no solo front ⇒ sube el coste de N2.
- **No arregla los datos rotos**: varios de esos 18 dashboards consumen los **endpoints 500/400** del
  gap G4 (`campaigns/insights` 400, etc.). Unificar la presentación **no repara** el backend; conviene
  secuenciar el fix G4 antes o en paralelo, o los widgets nacerán vacíos.

**Recomendación**: entra al diseño como **N0.4c** y se valida en N1 junto al resto (¿los usuarios
esperan *un* dashboard con selector, o dashboards por dominio?). Default de arranque: **1 dashboard
configurable por rol** (presets por defecto distintos para agente/supervisor/admin) + catálogo de widgets
+ cada vista vieja accesible como preset ruteado (invariante).

## 4. Principios de diseño (restricciones del spec)

| # | Principio | Consecuencia verificable |
|---|---|---|
| P1 | **IA por trabajo, no por capacidad** | El nav de primer nivel se define por tareas de un rol, no por módulos del sistema |
| P2 | **Nada se elimina** | Toda ruta actual sigue alcanzable (§6). "Simplificar" = reordenar + revelar progresivamente |
| P3 | **≤7 destinos visibles por rol** | Límite duro en el nav diario; el resto vive en hubs y buscador |
| P4 | **Válvula de escape universal** | Command palette (⌘K) sobre las 104 rutas: todo a 2 teclas |
| P5 | **Config fuera del flujo diario** | Los 15 ítems `super` y la configuración salen del nav operativo |
| P6 | **Validar antes de construir** | La IA se prueba con *tree testing* sobre prototipo, no sobre código |

## 5. Alcance

**Dentro**: `menuSections` y su render en `AppLayout.tsx`; agrupación, jerarquía, etiquetas (naming),
hubs de configuración, command palette, defaults por rol.

**Fuera** (explícito): rutas del router, permisos/`canAccess`, backend, lógica de negocio, y las
pantallas en sí (su re-skin es G.3, ver `PLAN-FASE-2.md`). Este módulo **no borra ninguna pantalla**.

## 6. Invariante de no-pérdida (el corazón de "sin perder opciones")

> **Toda ruta navegable hoy debe seguir siendo alcanzable después.**

Verificación (automatizable): extraer el set de `path` de `menuSections` antes y después; el set
posterior ⊇ set anterior. Un destino puede *cambiar de lugar* (submenú → hub → palette) pero **no
desaparecer**. Diferencia ≠ ∅ ⇒ el cambio se rechaza.

## 7. Métricas de éxito (medibles, post-rediseño)

| Métrica | Baseline | Meta |
|---|---|---|
| Destinos visibles en nav (rol agente) | ~78 | **≤7** |
| Destinos totales alcanzables | 104 | **104** (invariante §6) |
| Tasa de éxito en tarea (testing moderado) | *sin medir* | ≥80% sin ayuda |
| Tiempo hasta 1ª acción útil (agente nuevo) | *sin medir* | establecer baseline y mejorar |
| Comprensión de etiquetas (tree testing) | *sin medir* | ≥70% acierto de 1ª elección |

## 8. Ventaja competitiva a capitalizar

`spec/benchmark.md` ya identifica que los líderes de UX (Chatwoot, Tidio, Respond.io, Intercom) ganan
en **gobierno y experiencia, no en features** — y registra el gap **G6: onboarding pobre**. Este módulo
ataca la misma raíz: chateam tiene *más* capacidades que varios competidores, y esa es precisamente la
causa del problema de legibilidad. **La paridad de features ya existe; falta la legibilidad.**

## 9. Riesgos

| Riesgo | Mitigación |
|---|---|
| Rediseñar por intuición del equipo | P6: tree testing con usuarios antes de escribir código |
| Esconder algo que sí se usaba | Invariante §6 + validación con los 5+ usuarios |
| Romper gating por rol/plan | No se toca `canAccess`/`hasFeature`; solo la estructura de datos que consumen |
| Rediseño colisiona con G.3 (re-skin en curso) | Secuenciar: N0/N1 (papel) corren en paralelo; N2 (código) espera cierre de G.3 |

## 10. Pendiente de verificar

- **Roles reales**: `SPEC.md` menciona admin/supervisor/agente; el menú solo gatea `super` y `admin`.
  Confirmar el catálogo de roles efectivo antes de definir los nav por rol.
- **Command palette**: no existe librería instalada; evaluar coste (P4) en N2.
