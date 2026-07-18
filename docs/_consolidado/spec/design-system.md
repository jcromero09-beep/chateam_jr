# ChatEAM JR — Design System (Spec-Driven)

> Proyecto: `chateam_jr` · Fuente única de tokens: `SPEC-FIRST/fase3/design-tokens.json`
> Fecha: 2026-07-12 · Estado: PROPUESTA CANÓNICA (v1.0.0)
> Consumidor: `frontend/src/theme/chateamTheme.ts` (`buildChateamTheme`) + `frontend/src/styles/global.css`
> Alcance: define la marca única (color, tipografía, espaciado, radios, sombras, estados), el
> inventario de componentes base y la Arquitectura de Información (IA) final del menú.

---

## 1. Principios

1. **Una sola marca, teal-first.** El ADN real de ChatEAM (medido en vivo) es teal/cyan
   (`#005166` sidebar, `#5BC2D2` foco, `#23DADA` acentos). El primario se canoniza en
   **teal `#14B8A6`** con fondos oscuros **navy-teal `#04222A/#08303A`** (ya presentes en
   `chateamTheme.ts:509-516`). El azul `#3b82f6` deja de ser default.
2. **Tokens antes que valores.** Ningún componente usa hex/px crudos: consume variables
   `--joy-*` derivadas de `design-tokens.json`.
3. **Simetría por grilla.** Todo layout se alinea a una grilla de 12 columnas + escala de
   espaciado 4px. Se prohíben anchos ad-hoc.
4. **Accesible por defecto.** Contraste AA, foco visible, nombres accesibles, `prefers-reduced-motion`.
5. **Multi-tenant preservado.** `generatePalette()` sigue permitiendo override del primario
   por empresa; el default de fábrica es teal.

---

## 2. Color (marca)

### 2.1 Paleta primaria (teal) — CANÓNICA
| Token | Hex | Uso |
|---|---|---|
| teal.400 | `#2DD4BF` | Hover, acento claro, estados activos en dark |
| **teal.500** | **`#14B8A6`** | **Primario** (botones solid, links activos, selección de menú) |
| teal.600 | `#0D9488` | Hover de primario |
| teal.700 | `#0F766E` | Pressed / bordes de énfasis |

### 2.2 Acentos y semánticos
| Rol | Token | Hex | Notas |
|---|---|---|---|
| Cyan (info/IA) | cyan.400 | `#22D3EE` | Alinea `#23DADA` medido. Highlights de IA, badges info |
| **VIP** | vip.500 | `#FF6B6B` | **Coral, exclusivo VIP**. NO usar para errores |
| Éxito | success.500 | `#22C55E` | Alinea malachite `#25D050` del código |
| Aviso | warning.500 | `#F59E0B` | Alinea metalicOrange `#F99607` |
| Error | danger.500 | `#EF4444` | Alinea carmine `#F23A3A` |

### 2.3 Superficies y neutros
- **Escala neutra única (slate `#F8FAFC`…`#020617`)** — reemplaza las 3 escalas actuales
  (material greys + `rgb(97,97,97)` + `rgb(158,158,158)` sueltos medidos en A.1).
- **Dark (navy-teal):** body `#04222A`, surface `#08303A`, level1-3 `#0A3A48/#0D4756/#105668`.
- **Light:** body `#F8FAFC`, surface `#FFFFFF`, level1-3 `#F1F5F9/#E2E8F0/#CBD5E1`.

### 2.4 Reglas
- Máximo **12 colores de marca visibles** por pantalla (hoy: 38/28/26 → objetivo ≤12).
- El teal `#005166` legacy del build en vivo migra a `teal.700 #0F766E` / surface dark.
- Texto sobre teal: usar `text.dark.primary #FFFFFF` (títulos) y verificar `tertiary #94A3B8`
  ≥ 4.5:1 (a11y P3-14).

---

## 3. Tipografía

- **Display:** Inter (headings, títulos, KPIs).
- **Body:** Be Vietnam Pro (texto UI general).
- **Code:** Roboto Mono (IDs, logs, JSON).
- Se eliminan `Times New Roman` y `Arial` sueltos (resets de UA en tablas/SVG, medidos en A.1).

Escala (8 pasos): `xs 12 · sm 14 · md 16 · lg 18 · xl 20 · 2xl 24 · 3xl 30 · 4xl 36`.
Pesos: 300/400/500/600/700. Ver `typography.scale` en el JSON para el mapeo semántico
(display, h1–h4, body-lg/md/sm, caption, label, button).

---

## 4. Espaciado, grilla, radios, sombras

- **Espaciado:** escala 4px (`4/8/12/16/20/24/32/40/48/64`). Prohibido fuera de escala.
- **Grilla:** 12 columnas, gutter 24px, `contentMaxWidth 1440px`. KPIs en
  `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))` para eliminar los 9 anchos
  distintos del Dashboard (A.2).
- **Radios (7):** `xs 4 · sm 6 · md 8 · lg 12 · xl 16 · 2xl 20 · full`. Cards=lg, botones/inputs=md,
  chips/badges=sm, avatares=full.
- **Sombras (5 + foco):** `xs…xl` + `focus-ring 0 0 0 3px rgba(20,184,166,.35)`.
- **Layout:** sidebar 260px (colapsado 72px), header 64px.

---

## 5. Estados de interacción

| Estado | Regla |
|---|---|
| Hover | Fondo `background.level2`; primario → teal.600 |
| Active/Selected | `background.primary-500`, texto blanco, weight 600 (ya en `JoyListItemButton`) |
| Focus-visible | `outline: 2px solid teal.500` + `outline-offset: 2px` (global.css:44) + `focus-ring` |
| Disabled | Texto `text.disabled`, opacidad 0.5, sin sombra |
| Loading | Skeleton con `background.level1`→`level2` shimmer (respetando reduced-motion) |
| Error (form) | `FormControl error` + `FormHelperText` + `aria-invalid` (cierra a11y P1-3) |

---

## 6. Inventario de componentes base

Todos existen como overrides Joy en `chateamTheme.ts` (`componentOverrides`); esta es la
lista canónica y su estado:

| Componente | Token clave | Estado / acción |
|---|---|---|
| Button | radius md, weight 600, `textTransform:none` | OK |
| IconButton | radius sm | **Requiere `aria-label` obligatorio** (a11y P0-1: 473 sin nombre) |
| Card | radius lg, shadow xs | OK |
| Input / Textarea / Select | radius md/sm, shadow xs | Añadir `error` + helper (P1-3) |
| Modal / ModalDialog | radius lg, shadow xl, centrado | OK (`role=alertdialog` en ConfirmModal) |
| Drawer | backdrop sin blur | Móvil: añadir `role=dialog`+`aria-modal`+Esc (P2-7) |
| Table | header underline, stripe level1 | OK |
| Tabs (variant custom) | pill sobre level1 | OK |
| Chip / Badge | radius sm, weight 500/600 | VIP usa `vip.500` |
| List / ListItem / ListItemButton | gap 4px, selected primary | Base del menú (sección 7) |
| Avatar | weight 600, radius full | OK |
| Tooltip | — | Cubrir IconButtons icon-only |
| Toast | — | **Unificar en uno** (hoy sonner + react-toastify, P3-12) |

Componentes de dominio (chat): `MessageBubble`, `MediaImage/Video/Document`, `AudioPlayer`,
`QuotedMessage`, etc. (21 en `components/Messages/`) — heredan tokens, sin cambios de marca.

---

## 7. Arquitectura de Información (IA) del menú — FINAL

### 7.1 Problema
El sidebar actual (`AppLayout.tsx:289-1170`) tiene **10 secciones y ~22 grupos de primer nivel**,
muchos con 3er nivel (submenús anidados). Sprawl que dispersa las tareas frecuentes
(Tickets/Contactos) entre Marketing, IA, Sistema, etc.

### 7.2 Árbol propuesto (máx 2 niveles, ordenado por frecuencia de tarea)

```
INICIO
  · Dashboard                    /
  · Leads Kanban                 /kanban-lead-conversions

BANDEJA           (trabajo diario — arriba, siempre visible)
  · Tickets                      /tickets
  · Conversaciones Web           /webchat/chats
  · Comentarios FB/IG            /social-comments
  · Chats Internos               /internal-chats
  · Contactos                    /contacts
  · Mensajes Rápidos             /quick-replies
  · Mensajes Programados         /schedules

ORGANIZACIÓN      (clasificación operativa)
  · Funnel de Ventas             /funnel
  · Colas                        /queues
  · Etiquetas                    /tags
  · Origen de Clientes           /customer-origins

MARKETING         (colapsable, agrupa todo lo promocional)
  · Campañas                     /campaigns
  · Email Marketing              /email-marketing
  · Auto-Responder               /auto-responder
  · UGC & Contenido              /ugc/dashboard
  · Insights / Ads               /marketing

AUTOMATIZACIÓN & IA (colapsable)
  · Flowbuilder                  /flowbuilder
  · Plataforma IA                /ai/dashboard
  · Base de Conocimiento         /ai/knowledge
  · Agentes de IA                /ai/agents
  · Generación de Contenido      /ai/writer
  · Costos IA          [super]   /ai-rentability

HERRAMIENTAS
  · Citas                        /appointments
  · Afiliados                    /affiliates

──────────────────────────────  (separador visual, base del sidebar)

CANALES           (configuración de conexiones — separado de la operación)
  · Conexiones                   /connections
  · WhatsApp API                 /whatsapp/dashboard
  · WebChat                      /webchat
  · Plantillas                   /whatsapp/templates
  · Coexistencia Meta            /coexistence

CONFIGURACIÓN     (colapsable, pie de sidebar)
  · General                      /settings
  · Usuarios                     /users
  · Permisos           [super]   /permissions-manager
  · Facturación                  /billing

SISTEMA           [super] (solo superadmin)
  · Administración               /admin/*
  · Desarrollo                   /dev/*
```

Reglas de la IA:
- **Bandeja + Organización siempre expandidas** (tareas de alta frecuencia, sin clic extra).
- **Marketing, Automatización & IA, Configuración, Sistema son colapsables** (baja frecuencia).
- **Canales se separa de la operación**: configurar un canal ≠ operar la bandeja.
- **Máx 2 niveles**: se aplanan los submenús de 3er nivel (WhatsApp/WebChat/Campañas) llevando
  su hijo principal al 2º nivel y moviendo el resto a la página de detalle con tabs.
- `[super]` = visible solo con `user.super === true` (gating ya existente `AppLayout.tsx:1184-1190`).
- Accesibilidad: `<Sheet component="nav" aria-label="Navegación principal">`, `aria-expanded`
  en colapsables, skip-link a `#main-content` (cierra a11y P1-4, P2-6).

### 7.3 Mapa viejo → nuevo (resumen)
| Sección vieja | Destino nuevo |
|---|---|
| INICIO | INICIO (igual) |
| OPERATIVO | **BANDEJA** (+ Conversaciones Web y Comentarios subidos aquí) |
| CLASIFICACIÓN | **ORGANIZACIÓN** |
| CANALES | **CANALES** (bajado al pie, tras separador) |
| MARKETING & CAMPAÑAS | **MARKETING** (colapsable) |
| HERRAMIENTAS (Flowbuilder) | Flowbuilder → **AUTOMATIZACIÓN & IA**; Citas → HERRAMIENTAS |
| AFILIADOS | **HERRAMIENTAS** |
| INTELIGENCIA ARTIFICIAL | **AUTOMATIZACIÓN & IA** (colapsable) |
| CONFIGURACIÓN | **CONFIGURACIÓN** (colapsable, pie) |
| SISTEMA | **SISTEMA** `[super]` |

Resultado: **10 secciones → 9 grupos**, tareas diarias en los 2 primeros bloques, todo lo
promocional/IA/config colapsado. Profundidad máxima 2 (antes 3).

---

## 8. Referencias
- Tokens: `SPEC-FIRST/fase3/design-tokens.json`
- Auditoría: `SPEC-FIRST/fase3/03-auditoria-frontend.md`
- Theme actual: `frontend/src/theme/chateamTheme.ts`, `frontend/src/theme.ts`, `frontend/src/styles/global.css`
- Menú actual: `frontend/src/components/AppLayout.tsx:289-1170`
