# PLAN FASE 3 — Rediseño de Navegación / Simplificación de IA

> Spec: [`spec/modules/navegacion-ia-spec.md`](../spec/modules/navegacion-ia-spec.md)
> Aceptación: [`spec/acceptance/navegacion-ia.md`](../spec/acceptance/navegacion-ia.md)
> Método: [`GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md`](GUIA-AUDITORIA-IMPLEMENTACION-SPEC-DRIVEN.md)
> Fecha: 2026-07-15 · Estado: **propuesto, pendiente de autorización**

---

## Resumen ejecutivo

Testing reporta que los usuarios **no entienden** las opciones, por lo que muchas nunca se probaron. La
auditoría lo cuantifica: **104 destinos navegables en 10 secciones, de los cuales el trabajo diario son
6 (6%)**. El menú está ordenado por capacidades del sistema, no por el trabajo del usuario.

**Objetivo**: ≤7 destinos visibles por rol **sin perder ni una opción** (invariante §6 del spec).

**Apuesta central**: validar la arquitectura **en papel con usuarios antes de escribir código**. Iterar
una IA en un prototipo cuesta horas; iterarla en 163 pantallas cuesta semanas.

---

## Secuenciación (importante)

**N0 y N1 no tocan código**, así que corren **en paralelo a G.3** (re-skin, 30 pantallas pendientes).
**N2 (implementación) espera el cierre de G.3** para no reordenar un menú cuyas pantallas están mutando.

```
G.3 (re-skin) ──────────────────────────────►│ cierre
N0 benchmark+tareas ──►│                     │
N1 tree testing 5 users ──►│ (gate C2 ≥70%)  │
                                             └──► N2 implementación ──► N3 test moderado
```

---

## N0 · Evidencia y propuesta de IA — *sin código*

- [x] **N0.1** ✅ **Benchmark hecho** → [`spec/benchmark-navegacion.md`](../spec/benchmark-navegacion.md).
      Los 5 competidores corren **6–8 ítems de nivel-1** (mediana ~7); chateam tiene **104**. Convergencias:
      (1) Inbox #1 + Contactos + Reports siempre nivel-1; (2) config **fuera** del flujo diario; (3) **menú
      gateado por ROL** en 4/5; (4) ⌘K en los agent-centric. **Triangula con N0.3** (trabajo diario = 6) y
      **confirma por su cuenta la causa raíz de N0.2** (gating por plan, no por rol). Recomendación: **6
      ítems** para el agente (techo 7).
- [x] **N0.2** ✅ **Catálogo de roles resuelto — y con hallazgo que redefine el problema.**
      - **4 roles** reales: `super | admin | supervisor | user` (`utils/permissions.ts`). `SPEC.md` decía
        3 (admin/supervisor/agente): **incompleto**. Cierra el pendiente §10 del spec.
      - **El eje ROL casi no existe**: de 104 ítems del menú, **88 se filtran por PLAN** (`module` +
        `canAccess`) y solo **16 por ROL**. `canAccess()` consulta `hasAccessByPlan(...)`; solo `super`
        lo saltea. El archivo lo declara: *"permisos por Plan (no por Rol)"*.
      - ⇒ **Un agente y un admin con el mismo plan ven los mismos 88 destinos.** El menú expone *lo que
        la empresa compró*, no *lo que la persona hace*. **Esta es la causa raíz del "no lo entienden"**,
        más que la agrupación.
      - ⇒ **Corrección al spec §4/§9**: era falso que "la infraestructura ya existe". Hay que **construir
        el eje rol** (mapa rol→módulos). **N2 se reestima de M-L a L.** Ver `spec/modules/navegacion-ia-spec.md` §2.0.
- [x] **N0.3** ✅ **Mapa 104 → tipo de trabajo** (`scratchpad/nav_clasificado.json`):

      | Tipo | Destinos | Destino propuesto |
      |---|---|---|
      | **Diario** | **9** | Nav de primer nivel del agente |
      | Ocasional | 69 | Hubs por dominio + ⌘K |
      | Configuración | 11 | Hub de configuración |
      | Admin (solo-`super`) | 15 | Fuera del nav operativo (P5) |

      **Los 9 diarios**: Tickets, Contactos, Mensajes Rápidos, Chats Internos, Conversaciones Web,
      Mensajes Programados, Dashboard, Leads Kanban, Gestión *(cabecera de grupo)*.
      ⇒ Plegando `Gestión` (es grupo, no destino) y `Dashboard` (duplica `/`), quedan **7**: **la meta
      ≤7 del spec §P3 está sostenida por evidencia, no por aspiración.**
- [x] **N0.4** ✅ **Propuesta de IA v1 redactada** → ver **Apéndice A** al final de este plan.
      **Es una hipótesis, no una decisión**: entra a N1 (tree testing) para validarse o refutarse. No se
      escribe código.
- [ ] **N0.4b** **Elección de contenedor por destino** (no asumir "todo es página"). Para cada destino
      del mapa N0.3, proponer uno de tres, y dejar que **N1 lo valide con usuarios**:

      | Contenedor | Cuándo | Coste / riesgo |
      |---|---|---|
      | **Página** (ruta) | Trabajo largo, referencia cruzada, formularios grandes | Ninguno (statu quo). Obligatorio para `Settings` (2323 L / 364 usos), `Campaigns`, `CampaignsAudit` |
      | **Sheet / Drawer lateral** | Config contextual sin perder de vista la pantalla de trabajo | No existe `ui/sheet.tsx`; es un wrapper Radix Dialog con animación lateral (barato) |
      | **Routed modal** (diálogo direccionable por URL) | Acción breve/foco, pero que debe ser enlazable | Requiere cablear ruta↔estado del diálogo |

      **Restricciones duras** (aprendidas en G.3, no negociables):
      1. **Nada de librerías nuevas de diálogo** (p.ej. reui.io): ya hay **80 `<Dialog>` en 51 pantallas**
         sobre `components/ui/dialog.tsx` + `@radix-ui/react-dialog`. Un segundo sistema reabre la deuda
         de "libs duplicadas" que G.3 cierra.
      2. **Modal ≠ atajo para simplificar.** Mover un destino a modal no reduce el nº de cosas que el
         usuario debe encontrar (104 en modales siguen siendo 104): cambia el envase, no el orden. La
         simplificación viene de la IA + hubs + ⌘K, no del contenedor.
      3. **Un modal no ruteado borra una ruta** ⇒ viola el **invariante §6**. Si se elige modal, es
         **routed modal**; si no, se queda como página.
      4. **Techo de tamaño**: formularios grandes no entran en modal (regresión de usabilidad en 390px).
      5. **Coste de capas**: portales dentro de Dialog rompen focus-trap/scroll-lock. Precedente real:
         `pages/Schedules.tsx` necesitó `slotProps={{ listbox: { disablePortal: true } }}` para que el
         Autocomplete funcionara dentro del Dialog. Más modales anidados = más de estos bugs.
- [ ] **N0.5** Congelar **baseline** de rutas para el invariante:
      `grep -oE "path: '[^']+'" frontend/src/components/AppLayout.tsx | sed "s/path: //" | tr -d "'" | sort -u > /tmp/nav_before.txt`

**Criterio de salida N0**: tabla de benchmark + mapa 104→tareas + IA v1 revisable.

---

## N0.4c · Dashboard unificado configurable (input del usuario)

- [x] **N0.4c** ✅ **Analizado** → `spec/modules/navegacion-ia-spec.md` §2.2. **18 de 104 destinos (17%)
      son dashboards** en 7 secciones ⇒ colapsan a **1–2** con un dashboard configurable (selector de
      indicadores). Base de widgets ya existe (`components/dashboard/`). **3 condiciones**:
      1. **Invariante §6**: cada vista vieja debe quedar como **widget** o **preset ruteado**
         (`/dashboard?view=X`), no eliminada.
      2. **Falta persistencia** de layout por usuario ⇒ **backend + modelo** (`User.dashboardConfig`) ⇒
         sube el coste de N2.
      3. **No repara G4**: varios de esos dashboards consumen los endpoints 500/400 rotos; unificar la
         UI no arregla el dato. Secuenciar el fix backend.
      → Default de arranque: **1 dashboard por rol** con presets distintos (agente/supervisor/admin).

## N1 · Validación con usuarios — *sin código* (GATE)

- [x] **N1.0** ✅ **Eje ROL validado con usuarios (OK).** La **propuesta de roles** (A.4: qué ve
      agente/supervisor/admin/super) fue **revisada por usuarios y aprobada**. ⇒ El **eje rol** (A.1) deja
      de ser hipótesis: se puede construir en N2.1. **Sigue pendiente** el tree testing de **etiquetas y
      hubs** (las 6 preguntas de Apéndice A.6: ¿"Inbox" vs "Tickets"? ¿"Pipeline" agrupa Kanban+Funnel?
      ¿3 hubs de marketing/IA o el usuario los mezcla?) — eso es N1.1–N1.4, aún requerido.
- [ ] **N1.1** **Tree testing** con **≥5 usuarios** sobre la IA v1 (4-6 tareas core: abrir ticket, ver
      contacto, conectar WhatsApp, lanzar campaña, cambiar plantilla). *(Valida etiquetas/hubs, no roles
      — esos ya están OK en N1.0.)*
- [ ] **N1.2** Medir **acierto de 1ª elección**; identificar etiquetas ambiguas.
- [ ] **N1.3** Iterar IA (v2, v3…) **en papel** hasta cumplir **C2 ≥70%**.
- [ ] **N1.4** Acta por sesión (**C4**), con citas textuales.

> ⛔ **GATE**: si el acierto de 1ª elección < 70%, **N2 no arranca**. Se itera en papel.
> Este es el punto donde el método paga: rechazar aquí cuesta horas; descubrirlo en producción cuesta la
> confianza de los usuarios que ya reportaron confusión.

**Nota de método**: 5 usuarios detectan ~85% de los problemas de usabilidad. Más usuarios en esta fase
dan rendimientos decrecientes; conviene **más rondas de 5** que una ronda de 20.

---

## N2 · Implementación — *G.3 ya cerrado*

- [x] **N2.3** ✅ **Command palette (⌘K / Ctrl+K) desplegado** (`components/CommandPalette.tsx`).
      Aditivo, cero dependencias nuevas (Radix Dialog), sobre las rutas visibles. **Sonda en vivo**:
      abre con Ctrl+K, 98 comandos, filtro "factura"→"Facturación", 0 errores, gate VERDE. **Es la red que
      hace seguro cualquier ocultamiento por rol** (invariante §6 garantizado por búsqueda). *Se movió al
      frente a propósito: sin ⌘K, ocultar secciones al agente las dejaría inalcanzables.*

- [ ] **N2.0 · Sistema de Roles y Asientos (CIMIENTO, va ANTES de N2.1)** → nuevo módulo
      [`spec/modules/roles-usuarios-spec.md`](../spec/modules/roles-usuarios-spec.md). Requerimiento del
      usuario: jerarquía super/admin-empresa/usuarios-por-rol + plantillas preset configurables + límite
      de asientos por plan. **Hoy no existe** modelo Role (roles = enum hardcodeado; permisos por plan;
      `Plan.users` existe pero sin enforcement). N2.1 (nav por rol) **depende de esto**: no se puede gatear
      el menú por roles que no existen. Sub-tareas: modelo `Role`+`User.roleId`, seed de 5 presets,
      `CreateUserService` con tope de asientos (409 `ERR_SEAT_LIMIT`), UI gestión roles/usuarios, doble
      filtro `canAccess = plan ∩ rol`.

- [x] **N2.0.D2 · Editor de matriz de permisos módulo-por-módulo** ✅ desplegado y probado.
      `pages/RolesManagement.tsx` + `utils/moduleCatalog.ts` (catálogo compartido: 136 módulos en 13
      categorías, extraído de `PermissionsManager`). Diálogo con toggles agrupados + búsqueda + "marcar
      todos" por categoría. Guarda `role.permissions` vía `PUT /roles/:id`. **Probado**: clonar→editar
      (permKeys 12→3)→**403 en preset de sistema** (guard)→borrar; UI: 136 toggles, 0 errores. Nota:
      `moduleCategories/categoryNames` quedan duplicados en `PermissionsManager` (dedupe = follow-up).

- [~] **N2.1** Reestructurar el menú por tarea.
      - **Orden de secciones YA es task-first** (operativo → crecimiento → admin), verificado en fuente.
        Reordenar a ese nivel es **no-op** — no se hizo un cambio cosmético vacío.
      - **La parte valiosa de N2.1 = colapsar 104 destinos en ~7 top-level + hubs + renombrar** (Apéndice A).
        Eso **cambia etiquetas**, y renombrar/mergear sin validación de usuario es **el antipatrón exacto**
        que el método evita ⇒ **gated en N1.1 (tree testing de etiquetas)**.
      - **El beneficio práctico ya está entregado por el eje ROL**: un agente ve **3 secciones / 11 ítems**
        (no las 10/104). O sea, "menú limpio por usuario" **ya funciona** sin tocar etiquetas.
      - ⇒ N2.1 (hubs/rename) queda como **pendiente de N1.1**, no de código.
      - **N2.1a aplicado (conservador, reversible)**: renombré 3 secciones de nombre-de-capacidad a
        nombre-de-tarea/dominio: `CLASIFICACIÓN → ORGANIZACIÓN`, `HERRAMIENTAS → CITAS Y FLUJOS`,
        `SISTEMA → PLATAFORMA`. **Invariante verificado: 128 rutas antes = 128 después, 0 perdidas.** Solo
        strings de `title`, sin tocar rutas/estructura/filtro. Gate VERDE. Rollback: `dist_bak_n21`.
        El colapso a hubs + renombrado profundo del resto sigue gated en N1.1.
- [ ] **N2.2** Hub(s) de configuración: los 15 ítems `super` + config salen del nav operativo (**P5**).
- [ ] **N2.3** **Command palette (⌘K)** sobre las 104 rutas (**P4** — la válvula que garantiza el "sin
      perder opciones"). Evaluar coste: no hay librería instalada (**§10 del spec**).
- [ ] **N2.4** Verificar **invariante §6**: `comm -23 /tmp/nav_before.txt /tmp/nav_after.txt` ⇒ 0 líneas.
- [ ] **N2.5** a11y del nav (**E3/E4**): `aria-current`, foco visible, teclado completo, target ≥24px.
- [ ] **N2.6** `tsc` limpio + `ci-gate.sh` 🟢 + deploy safe-swap (§7 de la guía).

**Criterio de salida N2**: A1–A3, B1–B3, E1–E6 verificados con evidencia pegada.

---

## N3 · Validación post-implementación

- [ ] **N3.1** Test moderado con **≥5 usuarios**, idealmente **los mismos que reportaron la confusión**.
- [ ] **N3.2** Tasa de éxito ≥80% sin ayuda (**D2**).
- [ ] **N3.3** Registrar baseline "tiempo hasta 1ª acción útil" (**D3**).
- [ ] **N3.4** Verificar cero regresiones de tipo "no encuentro X" (**D4**).
- [ ] **N3.5** *Ahora sí*, instrumentar telemetría de navegación — como **medición de éxito**, no como
      insumo de diseño (§3 del spec explica por qué el orden importa).

---

## Riesgos y decisiones registradas

| Decisión | Razón |
|---|---|
| **NO** empezar por telemetría | Mediría confusión, no valor: los usuarios no entienden la UI, así que el uso ≈ 0 en pantallas valiosas pero mal explicadas. Instrumentar primero **cristalizaría el error**. |
| **NO** borrar pantallas | El problema es de orden y legibilidad, no de exceso de capacidad. El benchmark muestra que chateam **gana en features** y pierde en gobierno/UX. |
| Validar en papel antes de código | Iterar IA en prototipo = horas; en 163 pantallas = semanas. |
| N2 espera a G.3 | Reordenar un menú cuyas pantallas están mutando duplica el trabajo y enturbia el gate. |

## Estimación

| Ola | Esfuerzo | Bloquea a |
|---|---|---|
| N0 | S (análisis, sin código) | N1 |
| N1 | S-M (coordinar 5 usuarios) | **N2 (gate duro)** |
| N2 | M-L (menú + hubs + palette) | N3 |
| N3 | S (5 sesiones) | — |

**Camino crítico real**: N1 no depende de nosotros sino de **agendar 5 usuarios**. Conviene arrancar esa
coordinación ya, en paralelo a N0.

---

# Apéndice A · Propuesta de IA v1 (N0.4) — HIPÓTESIS a validar en N1

> ⚠️ Esto **no es la arquitectura final**. Es la propuesta que entra a tree testing (N1). Si el acierto
> de 1ª elección < 70% (gate C2), se itera **en papel**. Construida con evidencia de N0.1 (benchmark),
> N0.2 (roles) y N0.3 (mapa 104→trabajo).

## A.1 Modelo de dos ejes

```
visible(usuario, item) = gate_plan(item)  ∩  gate_rol(item)
                              ↑                    ↑
                         ya existe            NUEVO (N2.1)
```

- **Eje plan** (ya existe, `canAccess`): la empresa compró el módulo → intacto.
- **Eje rol** (a construir): mapa `rol → [dominios visibles]`. Sin él, agente y admin ven lo mismo (N0.2).

## A.2 Sidebar de agente — 6 destinos (patrón universal del benchmark)

| # | Ítem | Absorbe | Rutas actuales |
|---|---|---|---|
| 1 | **Inbox** | Tickets + Conversaciones Web (coexistencia = mismo trabajo) | `/tickets`, `/webchat/chats` |
| 2 | **Contactos** | — | `/contacts` |
| 3 | **Chats Internos** | equipo | `/internal-chats` |
| 4 | **Respuestas Rápidas** | herramienta del agente | `/quick-replies` |
| 5 | **Programados** | — | `/schedules` |
| 6 | **Pipeline** | Leads Kanban + Funnel | `/kanban-lead-conversions`, `/funnel` |

+ **⌘K** (command palette sobre las 104 rutas) + **⚙️ engranaje** → hub de config (solo si el rol lo permite).

## A.3 Hubs (los otros 98 destinos — reubicados, NO borrados)

Cada hub es una página índice con sub-navegación; su visibilidad la da el **eje rol**.

| Hub | Rol mínimo | Absorbe (nº) | Dominios |
|---|---|---|---|
| **Marketing** | admin | 31 | Campañas, UGC/Contenido, Email Marketing, Facebook Ads, Insights, Atribución, Auditoría |
| **Canales** | admin | 15 | Conexiones, Coexistencia Meta, Plantillas, Comentarios FB/IG, WebChat, WhatsApp API |
| **IA** | admin | 14 | Agentes, Base de Conocimiento, Generación, Créditos, Proveedores, Rentabilidad |
| **Automatización** | supervisor | ~5 | Automatizaciones, Flowbuilder, Auto-Responder, Palabras clave |
| **Citas** | admin | 11 | Dashboard, Calendario, Servicios, Disponibilidad, Recordatorios, Reportes |
| **Reportes** | supervisor | ~6 | Dashboards, Analytics, Auditorías, Consumo |
| **Afiliados** | admin | 6 | Dashboard, Programas, Referidos, Links, Recompensas |
| **Configuración** ⚙️ | admin | ~15 | Config general, Usuarios, Facturación, Permisos, Etiquetas, Colas, Origen de clientes |
| **Sistema** (super) | super | 15 | Empresas, Planes, Logs, Herramientas Dev, Términos, Consumo global |

## A.4 Nav por rol (resultado esperado)

| Rol | Nivel-1 visible | Cómo llega al resto |
|---|---|---|
| **user/agente** | 6 (sidebar A.2) | ⌘K + lo que el plan permita |
| **supervisor** | 6 + Reportes + Automatización = **8** | hubs |
| **admin** | 6 + engranaje a los 9 hubs | hubs |
| **super** | admin + hub Sistema | hubs |

## A.5 Verificación del invariante (§6)

104 destinos actuales = 6 (sidebar) + 98 (hubs A.3). **Suma = 104. Diferencia con baseline = ∅.**
Comando de prueba en N2.4: `comm -23 spec/acceptance/nav_before.txt /tmp/nav_after.txt` ⇒ 0 líneas.

## A.6 Preguntas que SOLO N1 (usuarios) puede responder — no las decidimos nosotros

1. ¿"Inbox" se entiende mejor que "Tickets"? (etiqueta)
2. ¿"Pipeline" agrupa bien Kanban+Funnel o el usuario los busca por separado?
3. ¿"Canales" vs "Conexiones" vs "Integraciones" — cuál acierta a la 1ª?
4. ¿Marketing/IA/Automatización son 3 hubs o el usuario los mezcla?
5. ¿El engranaje de config se descubre, o hay que dejarlo como ítem visible?
6. ¿Contenedor por destino (N0.4b): página / sheet / modal ruteado?

> Estas 6 son el guion del tree testing. La propuesta A.2–A.4 es el **punto de partida**, no la respuesta.
