# Rendimiento Frontend / Core Web Vitals — Auditoría (Spec-Driven)

> Proyecto: `chateam_jr` · Ruta: `/home/jcromero09/chateam_jr/frontend`
> Servido en: `https://padeldev.codigo.plus/` (SPA estática Vite tras nginx) · Backend `/be/` → `127.0.0.1:3010`
> Fecha: 2026-07-12 · Alcance: SOLO LECTURA (build `dist/`, `vite.config.ts`, vhost nginx, sondas GET en vivo)
> Referencia base: `03-frontend/frontend-inventory.md` (bundle 2.75 MB, 103 páginas eager, sourcemaps). **Este documento profundiza y NO repite**: se centra en transferencia real medida en vivo, waterfall de carga inicial, compresión, caché, imágenes y proyección de LCP/CLS/TBT/INP con fixes concretos.

---

## 1. Propósito / Alcance

Medir el impacto en **Core Web Vitals** de la SPA React+Vite sin SSR, servida estática por nginx en `padeldev.codigo.plus`. Se cuantifica el payload crítico real (gzip en vivo), el waterfall del primer render (incluida la pantalla de login), la política de compresión y caché del vhost, el peso de imágenes, y se proyectan LCP / CLS / TBT / INP con objetivos y correcciones priorizadas P0–P3.

**Método de medición**: sondas `curl` contra el sitio productivo (tamaños gzip reales, headers), inspección de `dist/index.html` (preloads), `dist/assets/` (tamaños de chunk), `vite.config.ts` (chunking/sourcemap) y `/etc/nginx/nginx.conf` + `server.d/padeldev.codigo.plus.conf` (compresión/caché).

---

## 2. Inventario (el "qué") — datos medidos, no repetidos

### 2.1 Payload crítico de la carga inicial (medido en vivo, gzip)

`dist/index.html` fuerza en `<head>` la descarga inmediata del entry + **4 vendor chunks vía `modulepreload`** (`index.html:23-28`). Esto es lo que **todo** primer visitante descarga — incluida la pantalla de login que no usa gráficas:

| Recurso (modulepreload/entry) | Sin comprimir | **Gzip en vivo** | ¿Necesario en login? |
|---|---|---|---|
| `index-CsfnEnr_.js` (entry + 103 páginas eager) | 2 882 330 B (2.75 MB) | **719 729 B (703 KB)** | Parcial (arrastra todo) |
| `mui-joy-YckP05G4.js` | 444 851 B | **120 868 B (118 KB)** | Sí (UI base) |
| `charts-C1UFvFA4.js` (recharts) | 404 923 B | **118 436 B (116 KB)** | **NO** (login no grafica) |
| `react-vendor-CGP9rPd4.js` | 178 041 B | **58 664 B (57 KB)** | Sí |
| `mui-icons-CM_cb-Fd.js` | 140 508 B | **46 886 B (46 KB)** | Parcial |
| `index-bGckeEJ-.css` | 21 475 B | **4 037 B (4 KB)** | Sí |
| **TOTAL crítico primer render** | **~4.05 MB** | **≈ 1 068 620 B (≈ 1.02 MB gzip)** | — |

- **~1.02 MB de JS/CSS gzip descargado + ~4 MB de JS a parsear/ejecutar en el hilo principal en CADA primer visita**, antes de pintar nada útil (root vacío, sin SSR).
- El chunk `charts` (116 KB gz / 405 KB parse) está **modulepreload** aunque el login y la mayoría de páginas no lo usan → 116 KB gz desperdiciados en la ruta crítica.
- JS total del build: **4.9 MB** en 112 chunks `.js` (`dist/assets/`). CSS total: 24 KB (sano).

### 2.2 Sourcemaps en producción (medido: descargables públicamente)

- `vite.config.ts:43` → `sourcemap: true`. `dist/assets/` contiene **112 `.map` = 19 MB**.
- Sonda en vivo: `GET /assets/index-CsfnEnr_.js.map` → **HTTP 200, 10 748 641 B (10.7 MB)**. Servidos por nginx sin bloqueo (el `try_files` sirve todo `dist/`). Los `.map` más pesados: `index` 10.7 MB, `mui-joy` 2.06 MB, `charts` 2.02 MB, `react-vendor` 767 KB, `mui-icons` 535 KB.
- No penaliza LCP directamente (el navegador solo pide `.map` con DevTools abierto), pero **expone el código TS íntegro** (RBAC `utils/permissions.ts`, lógica de negocio) y son 19 MB de superficie servible innecesaria.

### 2.3 Imágenes estáticas (medido)

Servidas desde raíz `dist/` (no pasan por Vite, no hasheadas, no optimizadas):

| Imagen | Tamaño | Uso | Riesgo CWV |
|---|---|---|---|
| `patron-fondo-claro.png` | **1 611 568 B (1.54 MB)** | fondo del chat, tema claro (`Tickets.tsx:117`) | Descarga tardía enorme en la vista principal |
| `patron-fondo-oscuro.png` | **1 340 327 B (1.28 MB)** | fondo del chat, tema oscuro (`Tickets.tsx:116-117`) | idem |
| `logo.png` | 183 239 B (179 KB) | **logo de Login/SignUp/Reset** (`Login.tsx:83`) | **Candidato a LCP del login**, PNG sin optimizar |
| `logo-512.png` | 62 053 B | PWA/manifest | — |
| `chateam-logo.png` | 77 441 B | empty-state chat, headers (`Login.tsx:89`) | — |
| `logo-chateam.svg` | 17 192 B | — | — |

- **~2.8 MB de PNG de patrón** (`patron-fondo-*`) sin comprimir/WebP; se cargan al entrar al chat.
- **No hay imágenes ni fuentes dentro de `assets/`** (0): todo el peso del build es JS. Las fuentes vienen de Google Fonts (ver 2.4).

### 2.4 Fuentes (render-blocking de tercero)

`index.html:17-22`: `<link rel="stylesheet">` a `fonts.googleapis.com/css2` con **3 familias y muchos pesos**: `Be Vietnam Pro` (10 variantes incl. itálicas), `Inter` (6 pesos), `Roboto Mono` (2). Hay `preconnect` a `fonts.googleapis.com` y `fonts.gstatic.com` (bien) y `display=swap` (bien, evita FOIT). Aun así es un **CSS render-blocking de origen cruzado** en la cabecera y ~10-15 archivos WOFF2 de tercero.

### 2.5 Compresión y caché del vhost (medido en vivo)

nginx `nginx.conf:66-76`:
- `gzip on`, `gzip_comp_level 6`, `gzip_static on`, `gzip_vary on`, `gzip_min_length 1100`.
- `gzip_types` incluye `application/javascript`, `text/css`, etc. (JS/CSS **sí** se comprimen — confirmado: entry 2.88 MB → 703 KB).
- **`brotli` NO está compilado/cargado**: `grep load_module …brotli` → vacío; sonda `Accept-Encoding: br` → **sin `content-encoding: br`** (nginx degrada a gzip). Brotli-11 sobre estos JS ahorraría ~20-30% adicional vs gzip-6 (entry ~703 KB gz → ~480-520 KB br).
- **Caché: SIN `Cache-Control` ni `Expires` en assets hasheados**. Sonda a `/assets/mui-joy-YckP05G4.js` → solo `last-modified` + `etag`, **sin `cache-control`**. Los assets llevan hash en el nombre (inmutables) pero el navegador **revalida en cada navegación** (304 con RTT) en vez de servir de disco. Penaliza visitas repetidas y navegación interna.
- `vhost` (`padeldev.codigo.plus.conf`) `location /` = `try_files $uri $uri/ /index.html`: **sirve `.map` y todo `dist/` sin filtro**.

### 2.6 Render / arquitectura de arranque

- **Sin SSR / sin prerender**: `dist/index.html` tiene `<div id="root"></div>` vacío. El primer pixel útil depende de descargar+parsear ~1 MB gz de JS y ejecutar React → **LCP y FCP están 100% gated por JS**.
- **Doble provider de theming MUI** en el árbol raíz: `MaterialCssVarsProvider` + Joy `CssVarsProvider` (`App.tsx:3-9`, `main.tsx`) → doble runtime de CSS-vars y mayor coste de hidratación inicial.
- **57 `Suspense` / 55 `lazy()` vs 103 imports estáticos de `./pages/`** en `App.tsx` (medido: `grep '^import .* from ./pages/'` = 103). Las 103 páginas eager caen en `index-CsfnEnr_.js` (2.75 MB).
- No hay skeleton ni fallback visible en el HTML → pantalla en blanco hasta que hidrata.

---

## 3. Arquitectura & Flujos de carga (el "cómo")

### 3.1 Waterfall del primer render (login)

```
1. GET /  → index.html (1805 B, gzip)                         ~0.1 s
2. head: preconnect fonts + GET css2 (Google Fonts, blocking) ~RTT tercero
3. <script module> index-CsfnEnr_.js  703 KB gz  ────────────┐
   modulepreload: mui-joy 118 + charts 116 + react-vendor 57 +│  paralelo
                  mui-icons 46 + css 4  ───────────────────────┘  ≈1.02 MB gz
4. Parse+exec ~4 MB JS en hilo principal (React + doble theming MUI)
5. React monta <Login>, pide GET /logo.png (179 KB PNG)
6. Pinta login  → FCP ≈ LCP (logo.png o card)
```

Todo el paso 3-4 ocurre **antes** de que el usuario vea el formulario de login. El chunk `charts` (116 KB gz) se descarga aquí sin usarse.

### 3.2 Navegación a Tickets (vista principal)

Tras login, `Tickets.tsx` es eager (dentro del entry ya cargado, sin coste de red extra), pero al pintar el chat solicita el **fondo de patrón PNG de 1.28-1.54 MB** (`Tickets.tsx:116-117`), que llega tarde y puede provocar un repintado/shift del área de conversación.

---

## 4. Hallazgos (SEVERIDAD P0–P3) con impacto en Core Web Vitals

> Nomenclatura `WV-n` para no colisionar con los `H-n` del inventario de frontend. Se referencian sus `H-2/H-4` donde aplica.

### P0 — Crítico

**WV-1 · Brotli ausente en nginx: +30% de bytes en toda la ruta crítica (LCP/FCP).**
Sonda `Accept-Encoding: br` a `/assets/index-CsfnEnr_.js` → sin `content-encoding: br`; `nginx.conf` no carga módulo brotli (solo `gzip_comp_level 6`). Sobre ~1.02 MB gz de payload crítico, brotli-11 estático ahorraría **~250-350 KB** por visita (entry 703 KB → ~480 KB). Impacto directo en **FCP/LCP** en redes móviles.
Fix: compilar/activar `ngx_brotli` (`brotli on; brotli_static on; brotli_comp_level 11; brotli_types …;`) o, si no se puede recompilar nginx, **pre-comprimir en build** (`vite-plugin-compression` genera `.br` y `.gz`) y confiar en `gzip_static on` (ya activo) + `brotli_static`. Referencia: `nginx.conf:66-76`, `vite.config.ts:41-54`.

**WV-2 · Assets hasheados sin `Cache-Control immutable`: revalidación por RTT en cada navegación.**
Sonda a `/assets/mui-joy-YckP05G4.js` devuelve `last-modified`+`etag` pero **ningún `cache-control`/`expires`**. Los nombres llevan hash de contenido (seguros para caché eterna), pero el navegador hace un condicional (304) por asset en cada carga → penaliza **visitas repetidas y navegación SPA** con RTTs innecesarios.
Fix en el vhost `padeldev.codigo.plus.conf`:
```nginx
location /assets/ { expires 1y; add_header Cache-Control "public, immutable"; }
location = /index.html { add_header Cache-Control "no-cache"; }
```
Referencia: `server.d/padeldev.codigo.plus.conf` (`location /`).

**WV-3 · Chunk `charts` (116 KB gz / 405 KB parse) en la ruta crítica de TODOS (incl. login).**
`index.html:27` hace `modulepreload` de `charts-C1UFvFA4.js` en cada primer render. Recharts solo se usa en ~13 páginas de analítica; el login y la mayoría de rutas no grafican. Se descargan y parsean 405 KB de JS que el usuario típico no necesita → **TBT/TTI y LCP degradados**.
Causa raíz: `recharts` está en `manualChunks` (`vite.config.ts:50`) pero se importa **estáticamente** desde páginas que a su vez están en el entry (103 eager), por lo que Rollup lo mantiene en el grafo crítico y Vite lo pre-carga. Fix: convertir las páginas de analítica a `lazy()` (ver WV-4) para que `charts` deje de ser dependencia del entry y **no** aparezca en `modulepreload`. Además `chart.js`+`react-chartjs-2` (segunda lib de gráficas, `H-7`) engorda este chunk sin necesidad.

### P1 — Alto

**WV-4 · 103 páginas cargadas eager → entry de 2.75 MB / 703 KB gz (TBT, TTI, LCP).** *(amplía `H-2`)*
`App.tsx` importa 103 páginas de forma estática (medido: 103 imports `from './pages/'`). Todas caen en `index-CsfnEnr_.js` (2 882 330 B). El usuario que solo va a Login+Tickets paga el parse de Email Marketing, UGC, ~40 páginas de IA, Afiliados, Appointments, etc. Parse de ~4 MB de JS en el hilo principal = **long tasks → TBT alto → INP degradado**.
Fix: `lazy(() => import('./pages/X'))` para **todas** las rutas salvo Login y el layout base. Con code-splitting por ruta, el entry cae a ~200-400 KB gz y cada vista carga su chunk (ya hay 55 lazy + `Suspense` funcionando como patrón). Prioridad de conversión a lazy: los ~40 AI*, 12 UGC*, 13 Email*, 9 WhatsApp*, 9 Affiliate*, Flowbuilder (reactflow), Checkout (PayPal). Referencia: `App.tsx:15-90` (bloque de imports eager), `vite.config.ts:44-52`.

**WV-5 · Sin SSR/prerender + root vacío: LCP y FCP 100% dependientes de JS.**
`dist/index.html` entrega `<div id="root"></div>` sin contenido ni skeleton. FCP no ocurre hasta descargar ~1 MB gz + ejecutar React + montar doble `CssVarsProvider`. En móvil de gama media / 3G-4G esto proyecta **LCP ≈ 4-8 s** (muy por encima del umbral "good" 2.5 s).
Fix (por esfuerzo creciente): (a) inyectar en `index.html` un **skeleton/spinner CSS inline** para adelantar FCP y dar percepción de carga; (b) reducir el JS crítico (WV-4); (c) evaluar `vite-plugin-ssr`/prerender solo de la shell de login. La opción (a)+(b) es la de mejor relación coste/beneficio.

**WV-6 · Fondos de chat PNG de 1.28-1.54 MB sin optimizar (LCP/CLS de la vista principal).**
`Tickets.tsx:116-117` referencia `patron-fondo-oscuro.png` (1.34 MB) / `patron-fondo-claro.png` (1.61 MB) como fondo del área de conversación. Se descargan al entrar al chat (vista más usada), tarde en el waterfall → posible **repintado del fondo (percepción de CLS/jank)** y consumo de ancho de banda.
Fix: convertir a **WebP/AVIF** (un patrón repetitivo baja de ~1.5 MB a <50 KB), o generar un patrón CSS/SVG tileable. Servirlos hasheados desde `assets/` con caché inmutable. Ahorro estimado: **>1.4 MB por tema**.

### P2 — Medio

**WV-7 · Sourcemaps de 19 MB públicos (código expuesto + superficie servible).** *(confirma `H-4` con sonda)*
`vite.config.ts:43` `sourcemap: true`; sonda `GET /assets/index-CsfnEnr_.js.map` = **200, 10.7 MB**. No afecta LCP del usuario normal, pero expone el TS íntegro (incl. `utils/permissions.ts` RBAC) y son 19 MB innecesarios en el árbol servido.
Fix: `sourcemap: false` (o `'hidden'`) en el build de prod; alternativamente bloquear en nginx: `location ~* \.map$ { return 404; }`. Referencia: `vite.config.ts:43`, `server.d/padeldev.codigo.plus.conf`.

**WV-8 · `logo.png` de 179 KB como probable elemento LCP del login.**
`Login.tsx:83` renderiza `/logo.png` (183 239 B, PNG sin optimizar) en la tarjeta de login; es el elemento pintado más grande de la pantalla inicial no autenticada → **candidato directo a LCP**. Un PNG de 179 KB para un logo es excesivo.
Fix: exportar a WebP/SVG optimizado (<20 KB), añadir `width`/`height` explícitos para reservar espacio (evita CLS), y `fetchpriority="high"` en la `<img>` del login. Objetivo: elemento LCP <30 KB.

**WV-9 · Doble runtime de theming MUI (Joy + Material) en el arranque.** *(ángulo CWV de `H-8`)*
`App.tsx:3-9` monta `MaterialCssVarsProvider` **y** Joy `CssVarsProvider`. Dos sistemas de CSS-variables se inicializan en cada arranque → coste extra de JS y de cálculo de estilos en el primer render (**TBT**), y riesgo de **FOUC/CLS** al aplicar variables de tema tras el montaje. Consolidar en una sola librería (ver `H-8`) reduce JS crítico y estabiliza el primer pintado.

**WV-10 · Google Fonts render-blocking con 3 familias / 18 variantes.**
`index.html:17-22` carga un CSS de Google Fonts (bloqueante) con `Be Vietnam Pro` (10 variantes), `Inter` (6), `Roboto Mono` (2). Aunque hay `preconnect` y `display=swap`, es una dependencia de tercero en la cabecera crítica y ~10-15 WOFF2. El swap de fuente puede causar **micro-CLS** de texto.
Fix: **self-host** de solo los pesos usados (p.ej. Inter 400/500/700, Be Vietnam 400/600) en `assets/` con `font-display: swap` y `preload` del woff2 del peso principal; recorta variantes no usadas. Reduce RTT de tercero y CLS de texto.

### P3 — Bajo

**WV-11 · `manualChunks` incompleto: `chart.js`, `reactflow`, `@paypal`, formik/yup no aislados.**
`vite.config.ts:46-51` solo separa `mui-joy`, `mui-icons`, `react-vendor`, `recharts`. Librerías pesadas de nicho — `chart.js`+`react-chartjs-2` (`H-7`), `reactflow` (flowbuilder), `@paypal/react-paypal-js` (checkout), `formik`/`yup` — quedan en el entry o mal repartidas. Tras aplicar WV-4 (lazy por ruta) esto se corrige en gran parte solo; complementar con entradas `manualChunks` para vendor de nicho evita duplicación entre chunks lazy.

**WV-12 · Sin presupuesto de performance ni monitoreo RUM/CI.**
No hay `performance budget`, ni Lighthouse CI, ni RUM (`web-vitals`) en el proyecto. Sin medición continua las regresiones (p.ej. añadir otra página eager) pasan inadvertidas.
Fix: añadir `web-vitals` (LCP/INP/CLS reales a un endpoint), un check de tamaño de bundle en CI (`size-limit` o `rollup-plugin-visualizer`) con umbral de entry (p.ej. ≤ 350 KB gz), y Lighthouse CI sobre `/login` y `/tickets`.

---

## 5. Recomendaciones (priorizadas, con impacto esperado)

| # | Acción | Hallazgo | Métrica objetivo | Esfuerzo |
|---|---|---|---|---|
| 1 | **Activar brotli** (módulo nginx o `.br` en build) | WV-1 | −250/350 KB crítico; FCP −0.3/0.8 s | Bajo |
| 2 | **`Cache-Control: immutable` en `/assets/`** | WV-2 | Repeat-visit casi instantáneo | Muy bajo |
| 3 | **`lazy()` en las 103 páginas eager** | WV-4/WV-3 | Entry 703 KB → ≤ 300 KB gz; TBT −40/60% | Medio |
| 4 | **Skeleton inline en `index.html`** + reducir JS crítico | WV-5 | FCP visible < 1.5 s | Bajo/Medio |
| 5 | **Sacar `charts` del modulepreload** (efecto de #3) | WV-3 | −116 KB gz en login | (incluido en #3) |
| 6 | **Optimizar imágenes**: `patron-fondo-*`→WebP, `logo.png`→WebP/SVG + `width/height`+`fetchpriority` | WV-6/WV-8 | −2.8 MB chat; LCP login < 2.5 s; CLS ~0 | Bajo |
| 7 | **`sourcemap:false`** (o bloquear `.map` en nginx) | WV-7 | −19 MB expuestos | Muy bajo |
| 8 | **Consolidar a un solo theming MUI** | WV-9 | −JS crítico; menos FOUC | Alto |
| 9 | **Self-host fuentes usadas** | WV-10 | −RTT tercero; −CLS texto | Medio |
| 10 | **web-vitals RUM + budget en CI** | WV-12 | Prevención de regresiones | Bajo |

### Objetivos Core Web Vitals (proyección)

| Métrica | Estado actual (proyectado, móvil mid/4G) | Objetivo "good" | Palancas |
|---|---|---|---|
| **LCP** | ~4-8 s (logo PNG 179 KB tras ~1 MB gz JS, sin SSR) | **< 2.5 s** | WV-1,3,4,5,6,8 |
| **CLS** | ~bajo-medio (root vacío, FOUC theming, font swap, fondo tardío) | **< 0.1** | WV-5,6,8,9,10 |
| **TBT / INP** | Alto (~4 MB parse JS, doble theming, long tasks) | TBT < 200  ms / **INP < 200 ms** | WV-3,4,9 |
| **FCP** | ~2.5-4 s (JS-gated, root vacío) | **< 1.8 s** | WV-1,4,5 |
| **TTFB** | Bueno (~0.1-0.3 s estático nginx, medido) | < 0.8 s | ya OK |

> Nota TTFB: el HTML raíz responde en ~0.1-0.3 s (estático); el TTFB **no** es el cuello de botella — lo es el peso de JS crítico y la ausencia de SSR.

---

## 6. Evidencia (comandos, salidas, archivo:línea)

### Sondas en vivo (curl a `https://padeldev.codigo.plus`)
```
GET /                         → 1805 B, 0.73 s, text/html; content-encoding: gzip; vary: Accept-Encoding
GET /assets/index-CsfnEnr_.js (br,gzip)  → content-encoding: gzip; descargado 719 729 B (0.89 s)
GET /assets/index-CsfnEnr_.js (identity) → 2 882 330 B (0.30 s)
GET /assets/index-CsfnEnr_.js (br SOLO)  → SIN content-encoding: br   ← brotli ausente
GET /assets/index-CsfnEnr_.js.map        → HTTP 200, 10 748 641 B     ← sourcemap público
GET /assets/mui-joy-YckP05G4.js  → headers: last-modified, etag  (SIN cache-control) ← WV-2
Gzip vendor crítico: mui-joy 120 868 · charts 118 436 · react-vendor 58 664 · mui-icons 46 886 · css 4 037
GET /logo.png                → 183 239 B image/png (0.066 s)   ← LCP login
GET /patron-fondo-claro.png  → 1 611 568 B image/png
GET /patron-fondo-oscuro.png → 1 340 327 B image/png
```

### Build (`dist/assets/`, `ls -la` sin `.map`)
```
index-CsfnEnr_.js  2 882 330 B   mui-joy 444 851   charts 404 923   react-vendor 178 041   mui-icons 140 508
JS total (sin map) = 4.9 MB en 112 chunks · CSS total = 24 KB · .map total = 19 MB
Mayores .map: index 10.7 MB · mui-joy 2.06 MB · charts 2.02 MB · react-vendor 767 KB · mui-icons 535 KB
```

### Config
- `frontend/vite.config.ts:8-10` shim `process.env` · `:43` `sourcemap: true` · `:46-51` `manualChunks` (solo mui-joy/mui-icons/react-vendor/recharts).
- `frontend/dist/index.html:23` `<script module src=index-CsfnEnr_.js>` · `:24-27` `modulepreload` react-vendor/mui-joy/mui-icons/**charts** · `:17-22` Google Fonts (3 familias) render-blocking.
- `frontend/src/App.tsx:1` `lazy, Suspense` · `:15-90` bloque de 103 imports eager `from './pages/'` (grep: 103) · 55 `lazy()` / 57 `Suspense`.
- `frontend/src/pages/Login.tsx:83` `/logo.png` (LCP) · `:89` `/chateam-logo.png`.
- `frontend/src/pages/Tickets.tsx:116-117` `/patron-fondo-{oscuro,claro}.png` (fondo chat).

### nginx
- `/etc/nginx/nginx.conf:66-76` `gzip on; gzip_comp_level 6; gzip_static on; gzip_vary on; gzip_min_length 1100; gzip_types …application/javascript…` · **sin `brotli` / sin `load_module …brotli`**.
- `/etc/nginx/server.d/padeldev.codigo.plus.conf`: `root …/frontend/dist; location / { try_files $uri $uri/ /index.html; }` — **sin bloque de caché para `/assets/`, sin filtro `.map`**; `/be/` y `/socket.io/` proxy a `127.0.0.1:3010`.

### Comandos ejecutados
```
ls -la dist/assets | sort -k5 -n            # tamaños de chunk
du -ch dist/assets/*.js|*.map               # JS 4.9M / map 19M
cat dist/index.html                         # preloads + fonts
curl -s -H 'Accept-Encoding: br,gzip' -D -  # compresión/headers en vivo
sudo cat /etc/nginx/server.d/padeldev.codigo.plus.conf ; grep gzip|brotli nginx.conf
grep -cE "^import .* from './pages/" src/App.tsx  → 103
```
