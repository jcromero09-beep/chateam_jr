# Fase 3 — Auditoría de Frontend / UX / Diseño (Spec-Driven)

> Proyecto: `chateam_jr` · SPA React 18 + Vite + MUI Joy · Servido en `https://padeldev.codigo.plus/`
> Fecha: 2026-07-12 · Alcance: SOLO LECTURA (código) · Entregables de diseño escritos en `SPEC-FIRST/fase3` y `spec/`
> Foco: **moderno · simétrico · marca consistente · menú ordenado**
> Insumos: `SPEC-FIRST/sondas/sondas-padeldev.json` (sonda EN VIVO A.1–A.4),
> `AUDITORIA_2026_07/03-frontend/frontend-inventory.md`, `.../11-rendimiento/frontend-web-vitals.md`,
> `.../12-accesibilidad/a11y.md`, y el theme real (`frontend/src/theme/chateamTheme.ts`).
> Fuente única de tokens: `SPEC-FIRST/fase3/design-tokens.json` · Sistema: `spec/design-system.md`.

---

## 3.0 Resumen ejecutivo

La marca **existe pero está fragmentada**: el código tiene un theme Joy coherente
(`chateamTheme.ts`, ADN teal/cyan + fondos navy-teal), pero el DOM renderizado mezcla
paletas (Lotru + material greys + azul dinámico + teal legacy) produciendo **38/28/26
colores únicos por pantalla**, **4 familias tipográficas**, **8–13 tamaños** y **9 radios**.
La grilla es irregular (Dashboard con **38 cards, 13 bordes-izquierda y 9 anchos distintos**).
Accesibilidad con **2 bloqueos sistémicos P0** (473 IconButton sin nombre; onClick en no-botones)
y **10/7/7 violaciones axe** por pantalla. El menú es un sprawl de **10 secciones / ~22 grupos**
con 3 niveles. El rendimiento percibido está gated por JS (entry 2.75 MB, sin SSR).

Veredicto: la base de theming es rescatable. La solución es **canonizar** (tokens únicos),
**alinear a grilla**, **nombrar todo lo interactivo** y **reordenar la IA a 2 niveles**.

---

## 3.1 Inconsistencia de marca (sprawl visual)

### Cuantificación del sprawl (sonda A.1)
| Pantalla | Colores únicos | Familias tipográficas | Tamaños de fuente | Radios |
|---|---|---|---|---|
| Dashboard | **38** | 4 (Be Vietnam Pro, Inter, Times New Roman, Arial) | 10 (16/24/12/14/18/20/30/**10.4**/**13.3333**/13 px) | 9 (0/8/6/4/12/50%/16/compuestos) |
| Tickets | **28** | 4 | 13 | 8 |
| Tags | **26** | 4 | 11 | 9 |

Evidencia sonda: `sondas-padeldev.json` → `dashboard.a1.uniqueColors=38` (líneas 315),
`fontFamily` (191-208), `fontSize` (209-250), `borderRadius` (251-288); `tickets.a1.uniqueColors=28`
(761), `tags.a1.uniqueColors=26` (1145).

### Diagnóstico de causas
1. **Tres escalas de grises coexistiendo**: `rgb(97,97,97)` (718 nodos, borde/texto material),
   `rgb(158,158,158)`, más overlays `rgba(255,255,255,0.7/0.5/0.4/0.35)` — restos de MUI Material
   y del theme viejo, no del `chateamTheme.ts`. (A.1 dashboard.color 5-53).
2. **Múltiples azules/teales sin canonizar**: `rgb(0,29,87)` #001D57, `rgb(81,137,251)` #5189FB,
   `rgb(59,130,246)` #3B82F6, `rgb(0,81,102)` #005166, `rgb(35,218,218)` #23DADA — el primario
   dinámico (azul) choca con el ADN teal de los fondos.
3. **Tipografías de reset**: `Times New Roman` (29 nodos) y `Arial` provienen de SVG/tablas sin
   `font-family` heredada; se cuelan como "familias" reales.
4. **Tamaños fuera de escala**: `10.4px` y `13.3333px` (artefactos de `rem`/zoom), rompen la escala.

### Confirmación con el theme real del código
`frontend/src/theme/chateamTheme.ts` YA define la marca correcta:
- Fondos dark **teal-navy**: body `#04222A`, surface `#08303A`, level1-3 `#0A3A48/#0D4756/#105668`
  (`chateamTheme.ts:509-516`).
- Foco `#5BC2D2` (cyan) en `global.css:44`.
- Semánticos Lotru: success malachite `#25D050`, warning `#F99607`, danger carmine `#F23A3A`.
- **Pero** el primario default es azul `#3b82f6` (`chateamTheme.ts:419-420`), en conflicto con el teal.

### PALETA CANÓNICA propuesta (confirmada/ajustada al código)
| Rol | Canónico | Origen real reconciliado |
|---|---|---|
| **Primario (teal)** | `#14B8A6` (400 `#2DD4BF`) | Reemplaza azul `#3b82f6`; aterriza `#005166`/`#5BC2D2` del build |
| Superficie dark (navy-teal) | `#04222A` / `#08303A` | **Idéntico al código** (`chateamTheme.ts:509-516`) |
| Navy profundo | `#0B1622` | Overlays/el navy más oscuro solicitado |
| Cyan (info/IA) | `#22D3EE` | Alinea `#23DADA` medido (A.1) |
| **Coral VIP** | `#FF6B6B` | Nuevo; distinto de danger `#F23A3A` para no colisionar |
| Éxito | `#22C55E` | ≈ malachite `#25D050` del código |
| Ámbar (aviso) | `#F59E0B` | ≈ metalicOrange `#F99607` del código |
| Error | `#EF4444` | ≈ carmine `#F23A3A` del código |
| Neutros | slate `#F8FAFC…#020617` | **Escala única** que sustituye los 3 grises actuales |

Objetivo: **≤12 colores de marca visibles por pantalla** (hoy 38/28/26).
Tokens completos en `design-tokens.json` → `color.*`. Sistema en `spec/design-system.md §2`.

### Hallazgos
- **P0 · F-1 — Primario en conflicto con el ADN de marca.** Default azul `#3b82f6`
  (`chateamTheme.ts:419-420`) sobre fondos teal `#04222A/#08303A` → identidad ambigua.
  Fix: default = teal `#14B8A6`; mantener `generatePalette()` para override multi-tenant.
- **P1 · F-2 — Tres escalas de grises + overlays.** `rgb(97,97,97)` 718 nodos (A.1:7-9).
  Fix: escala slate única (`neutral.*`).
- **P1 · F-3 — 4 familias tipográficas.** `Times New Roman`/`Arial` sueltos (A.1:200-207).
  Fix: 2 familias (Inter display + Be Vietnam Pro body) + mono; forzar `font-family` en SVG/tablas.
- **P2 · F-4 — Tamaños fuera de escala** (`10.4px`, `13.3333px`, A.1:238-245). Fix: escala de 8 pasos.
- **P2 · F-5 — 9 radios distintos** incl. compuestos (`8px 0px 0px`, A.1:280-287). Fix: escala de 7.

---

## 3.2 Consistencia / simetría (grilla y layout)

### Evidencia (sonda A.2)
| Pantalla | Cards | Bordes-izq distintos | Anchos distintos |
|---|---|---|---|
| Dashboard | **38** | **13** | **9** (311/345/127/161/681/496/530/715 px…) |
| Tags | 10 | 7 | 5 (225/259/1084/260/1050) |
| Tickets | 2 | 2 | 2 |

Evidencia: `sondas-padeldev.json` → `dashboard.a2` (317-355), `tags.a2` (1147-1173).
El Dashboard es el peor caso: 13 posiciones de borde izquierdo = **13 columnas implícitas**
no alineadas, y 9 anchos de card = ausencia de grilla.

### Sistema propuesto
- **Grilla 12 columnas**, gutter 24px, `contentMaxWidth 1440px`.
- **KPIs**: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` → cards de ancho
  uniforme, colapsan responsivamente (elimina los 9 anchos).
- **Escala de espaciado 4px** (`4/8/12/16/24/32/48/64`); prohibidos valores ad-hoc.
- **Radios** (7): cards=lg(12), botones/inputs=md(8), chips=sm(6), avatares=full.
- **Sombras** (5): `xs…xl` + `focus-ring`. Consolida los ~6 boxShadow medidos (A.1:289-314).
Tokens en `design-tokens.json` → `spacing`, `radii`, `shadow`, `layout.grid`.

### Hallazgos
- **P1 · F-6 — Grilla irregular en Dashboard** (13 bordes-izq / 9 anchos, A.2:319-321).
  Fix: grilla 12 col + `auto-fit minmax`.
- **P2 · F-7 — Cards con anchos y bordes ad-hoc.** Fix: componente `Card` único con tokens.

---

## 3.3 Accesibilidad

### Violaciones axe en vivo (sonda A.3)
| Pantalla | Total | Crítica | Serias | Moderadas | Peores nodos |
|---|---|---|---|---|---|
| Dashboard | **10** | 1 | 5 | 4 | color-contrast **51**, listitem **97**, region **108** |
| Tickets | **7** | 1 | 3 | 3 | listitem 97, list 28, color-contrast 8 |
| Tags | **7** | 1 | 3 | 3 | listitem 97, color-contrast 11 |

Evidencia: `sondas-padeldev.json` → `dashboard.a3_axe` (365-434), `tickets.a3_axe` (787-838),
`tags.a3_axe` (1183-1234).

Reglas críticas/serias recurrentes:
- **`button-name` (critical)**: botones sin texto discernible (1–3 nodos por pantalla).
  Correlaciona con el P0 del informe a11y.
- **`color-contrast` (serious)**: 51 nodos en Dashboard — sub-AA (correlaciona F-2/texto tertiary).
- **`list`/`listitem` (serious, 28/97 nodos)**: estructura de listas rota (menú/tarjetas usan
  `<li>` fuera de `<ul>`), afecta lectores de pantalla.
- **`region` (moderate, 108 nodos)**: contenido fuera de landmarks (falta `<nav>`, correlaciona P1-4).
- **`scrollable-region-focusable`, `aria-progressbar-name`, `heading-order`, `page-has-heading-one`**.

### P0 del informe 12-accesibilidad (código)
- **P0-1 — 473 `IconButton` icon-only con solo 6 `aria-label`** en toda la app
  (`a11y.md §2`; ej. `Users.tsx:333,478,486`). WCAG 4.1.2/2.4.4. Es la causa raíz de `button-name`.
- **P0-2 — `onClick` en no-botones** (Typography/Box/div) sin `role`/`tabIndex`/teclado
  (`Login.tsx:131-141` "¿Olvidaste tu contraseña?"; `AppLayout.tsx:1789` backdrop). WCAG 2.1.1.

Barreras P1: formularios sin `aria-invalid`/error asociado (validación solo por toast);
falta landmark `<nav>` + skip-link (`AppLayout.tsx` sidebar es `<Sheet>`=div); imágenes con
`alt` genérico/ausente.

### Hallazgos
- **P0 · F-8 — 473 IconButton sin nombre accesible.** Fix: `aria-label` obligatorio (token/regla
  en `design-system.md §6`); empezar por columnas de acción (Users/Contacts/Companies/Queues/Tags).
- **P0 · F-9 — Interactivos no-nativos sin teclado.** Fix: `Button`/`Link component="button"`
  (replicar patrón correcto `Messages/MediaImage.tsx:52`).
- **P1 · F-10 — 51 nodos bajo contraste AA** (A.3 dashboard). Fix: paleta canónica + verificar
  `text.tertiary` sobre teal ≥ 4.5:1.
- **P1 · F-11 — Sin `<nav>`/skip-link → 108 nodos fuera de landmark.** Fix: `<Sheet component="nav"
  aria-label>`, skip-link a `#main-content`, `aria-expanded` en colapsables.
- **P2 · F-12 — Formularios sin error accesible / `prefers-reduced-motion` ausente.**

---

## 3.4 IA de menú (reordenamiento)

### Problema (código)
`AppLayout.tsx:289-1170` define **10 secciones** (INICIO, OPERATIVO, CLASIFICACIÓN, CANALES,
MARKETING & CAMPAÑAS, HERRAMIENTAS, AFILIADOS, INTELIGENCIA ARTIFICIAL, CONFIGURACIÓN, SISTEMA),
**~22 grupos de primer nivel** y **3 niveles de anidamiento** (WhatsApp/WebChat/Campañas/UGC con
sub-submenús). Las tareas diarias (Tickets/Contactos) quedan dispersas y compiten visualmente con
~40 páginas de IA, 13 de Email y 12 de UGC. Correlaciona con las violaciones `list/listitem/region`
de A.3 (97/108 nodos) y con la ausencia de landmark de navegación (a11y P1-4).

### Árbol reordenado (máx 2 niveles, por frecuencia/tarea)
Resumen (detalle completo + rutas en `spec/design-system.md §7`):

```
INICIO               Dashboard · Leads Kanban
BANDEJA        ▲      Tickets · Conversaciones Web · Comentarios FB/IG · Chats Internos
                     · Contactos · Mensajes Rápidos · Mensajes Programados
ORGANIZACIÓN   ▲      Funnel · Colas · Etiquetas · Origen de Clientes
MARKETING      ▽      Campañas · Email Marketing · Auto-Responder · UGC · Insights/Ads
AUTOMAT. & IA  ▽      Flowbuilder · Plataforma IA · KB · Agentes · Generación · Costos[super]
HERRAMIENTAS         Citas · Afiliados
── separador ──
CANALES        ▽      Conexiones · WhatsApp API · WebChat · Plantillas · Coexistencia Meta
CONFIGURACIÓN  ▽      General · Usuarios · Permisos[super] · Facturación
SISTEMA [super]▽      Administración · Desarrollo
```
▲ expandido siempre (alta frecuencia) · ▽ colapsable (baja frecuencia).

### Mapa viejo → nuevo
| Viejo | Nuevo |
|---|---|
| OPERATIVO | **BANDEJA** (sube Conversaciones Web + Comentarios FB/IG) |
| CLASIFICACIÓN | **ORGANIZACIÓN** |
| MARKETING & CAMPAÑAS | **MARKETING** (colapsable) |
| HERRAMIENTAS·Flowbuilder | **AUTOMATIZACIÓN & IA** |
| AFILIADOS | **HERRAMIENTAS** |
| INTELIGENCIA ARTIFICIAL | **AUTOMATIZACIÓN & IA** (colapsable) |
| CANALES | **CANALES** (bajado al pie, tras separador) |
| CONFIGURACIÓN / SISTEMA | igual, colapsados al pie |

Resultado: **10 secciones → 9 grupos**, profundidad **3 → 2**, tareas diarias en los 2 primeros bloques.

### Hallazgos
- **P1 · F-13 — Sprawl de menú (10 secciones / ~22 grupos / 3 niveles).** Fix: IA de §7.
- **P2 · F-14 — Submenús de 3er nivel** (`AppLayout.tsx:412,473,494,537,578…`). Fix: aplanar a 2
  niveles, mover hijos secundarios a tabs de la página de detalle.

---

## 3.5 Rendimiento percibido

### Métricas (sonda A.4 + web-vitals)
| Pantalla | TTFB | DCL | Load | Transfer | Recursos | LCP | CLS |
|---|---|---|---|---|---|---|---|
| Dashboard | 1 ms | 234 ms | 239 ms | 9 KB | 29 | null* | 0 |
| Tickets | 8 ms | 335 ms | 349 ms | **1591 KB** | 47 | null* | 0 |
| Tags | 3 ms | 297 ms | 307 ms | 7 KB | 32 | null* | 0 |

Evidencia: `sondas-padeldev.json` → `dashboard.a4` (356-364), `tickets.a4` (778-786).
\*LCP `null` = no capturado por la sonda (SPA sin elemento LCP estable / medición corta);
la proyección real del informe web-vitals es **LCP ≈ 4–8 s en móvil mid/4G**.

### Diagnóstico (de `frontend-web-vitals.md`)
- **Entry monolítico 2.75 MB (703 KB gzip) + 103 páginas eager** → parse de ~4 MB JS en el
  hilo principal antes del primer pixel útil. TBT alto → INP degradado (WV-4/H-2).
- **Sin SSR, root vacío** → FCP/LCP 100% gated por JS (WV-5).
- **Chunk `charts` 116 KB gz en `modulepreload`** aunque el login no grafica (WV-3).
- **`chart.js` + `recharts` (dos libs de gráficas)** engordan el chunk (H-7).
- **Doble theming MUI (Joy + Material)** → coste extra de CSS-vars y riesgo FOUC/CLS (WV-9/H-8).
- **Imágenes**: `patron-fondo-*.png` 1.28–1.54 MB (fondo del chat, explica los 1591 KB de Tickets)
  y `logo.png` 179 KB (LCP del login) sin WebP (WV-6/WV-8).
- **Brotli ausente + assets hasheados sin `Cache-Control: immutable`** (WV-1/WV-2).
- CLS medido = 0 (bueno) pero con riesgo real por fondo tardío + font-swap + FOUC de theming.

### Hallazgos
- **P0 · F-15 — Entry 2.75 MB / 103 páginas eager.** Fix: `lazy()` en todas las rutas salvo
  Login/layout → entry ≤ 300 KB gz (WV-4).
- **P1 · F-16 — Imágenes pesadas** (`patron-fondo-*` 1.5 MB, `logo.png` 179 KB). Fix: WebP/SVG +
  `width/height` + `fetchpriority` (WV-6/WV-8; explica el transfer de 1591 KB en Tickets, A.4:782).
- **P1 · F-17 — `charts` en ruta crítica + doble lib de gráficas.** Fix: lazy analítica; eliminar chart.js.
- **P2 · F-18 — Doble theming MUI.** Fix: consolidar en Joy (con tokens canónicos).
- **P2 · F-19 — Sin brotli / sin caché inmutable.** Fix nginx: `brotli_static`, `Cache-Control immutable`.

---

## 3.6 Backlog priorizado (P0→P3)

| ID | Sev | Hallazgo | Evidencia | Entregable/Fix |
|---|---|---|---|---|
| F-1 | P0 | Primario azul vs marca teal | `chateamTheme.ts:419-420` | `design-tokens.json color.brand.teal` |
| F-8 | P0 | 473 IconButton sin `aria-label` | `a11y.md §2`; A.3 button-name | `design-system.md §6` |
| F-9 | P0 | onClick en no-botones sin teclado | `Login.tsx:131-141`; `AppLayout.tsx:1789` | patrón `MediaImage.tsx:52` |
| F-15 | P0 | Entry 2.75 MB / 103 eager | web-vitals WV-4; A.4 tickets 1591 KB | `lazy()` por ruta |
| F-2 | P1 | 3 escalas de grises | A.1 dashboard.color:7-53 | `neutral.*` slate |
| F-3 | P1 | 4 familias tipográficas | A.1:200-207 | 2 familias + mono |
| F-6 | P1 | Grilla irregular (13 bordes/9 anchos) | A.2:319-321 | grilla 12 col + auto-fit |
| F-10 | P1 | 51 nodos bajo contraste | A.3 dashboard | paleta canónica |
| F-11 | P1 | Sin `<nav>`/skip-link (108 fuera de landmark) | A.3 region; `AppLayout.tsx` | landmark + skip-link |
| F-13 | P1 | Sprawl de menú (10 secc/22 grupos/3 niv) | `AppLayout.tsx:289-1170` | IA `design-system.md §7` |
| F-16 | P1 | Imágenes pesadas | web-vitals WV-6/8 | WebP/SVG |
| F-17 | P1 | charts crítico + doble lib | web-vitals WV-3/H-7 | lazy + eliminar chart.js |
| F-4 | P2 | Tamaños fuera de escala | A.1:238-245 | escala 8 pasos |
| F-5 | P2 | 9 radios | A.1:280-287 | escala 7 radios |
| F-7 | P2 | Cards ad-hoc | A.2 | Card único |
| F-12 | P2 | Forms sin error a11y / motion | `a11y.md P1-3/P2-10` | FormControl error |
| F-14 | P2 | Submenús 3er nivel | `AppLayout.tsx:412,473,494` | aplanar a 2 niveles |
| F-18 | P2 | Doble theming MUI | web-vitals WV-9 | consolidar Joy |
| F-19 | P2 | Sin brotli/caché inmutable | web-vitals WV-1/2 | config nginx |

Orden de ejecución sugerido: **(1)** tokens canónicos (F-1..F-7) → **(2)** IA de menú
(F-13/F-14) → **(3)** a11y P0 (F-8/F-9/F-11) → **(4)** performance (F-15..F-19).

---

## Anexo — Entregables de esta fase
1. `SPEC-FIRST/fase3/03-auditoria-frontend.md` (este documento).
2. `spec/design-system.md` (tokens de marca + componentes base + IA de menú final).
3. `SPEC-FIRST/fase3/design-tokens.json` (fuente única de tokens: colors, spacing, radii,
   typography, shadows, motion, layout).
