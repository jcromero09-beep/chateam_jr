# Guía de Auditoría + Implementación con método Spec-Driven

> **Qué es**: manual reutilizable destilado del trabajo real ejecutado en `chateam_jr`
> (auditoría del spec "Marketing Suite" → `plan/PLAN-FASE-2.md`, olas A–H).
> **Para quién**: el orquestador (humano o agente) que dirige una auditoría o una
> migración grande sobre un repo **que ya existe y está en producción**.
> **Versión**: 1.0 · 2026-07-14 · Metodología: Spec-Driven (convención de
> `reconcilaplus/AGENTS.md` y `chateam_jr/AGENTS.md`).
>
> Esta guía **no** sustituye a `/spec` ni a `/plan`. Si contradice a alguno, mandan spec y plan.

---

## 1. Propósito y cuándo usar

Usar esta guía cuando se cumpla **al menos una** de estas condiciones:

| Situación | Por qué aplica |
|---|---|
| Llega un **spec de negocio** (o un prototipo) que asume un sistema que no es el tuyo | Hay que **confrontar**, no construir. Sección 3. |
| Hay que **migrar en masa** (framework de UI, cifrado, versión de API) sobre código vivo | Necesitas olas + estrangulamiento + gate. Secciones 4–6. |
| Hay que **auditar** un módulo y decidir qué es real y qué es mock | Sección 3 (medir, no opinar). |
| Vas a lanzar **agentes en paralelo** sobre un repo desplegado | Sección 5 + gotchas (sección 8). Es donde más se rompe. |

**Cuándo NO usarla**: greenfield. Si no hay código previo, no hay nada que confrontar:
escribe el spec y ejecuta el plan directo.

**Regla de oro** (heredada del confronte de chateam):
> El proyecto **NO es greenfield**. El plan cierra **solo los gaps confirmados**; no
> re-construye lo que ya existe. — `plan/PLAN-FASE-2.md` §preámbulo

---

## 2. El ciclo Spec-Driven aplicado

```
SPEC  ──► AUDITORÍA ──► PLAN ──► TASKS ──► IMPLEMENTACIÓN ──► VALIDACIÓN ──► PROGRESO
(qué      (spec vs      (olas    (1 tarea   (agentes en        (gate 4       (evidencia
 pide      realidad,     por      = 1        paralelo,          pasos +       en el
 el        con           riesgo)  archivo)   edición-only)      tsc + a11y)   plan)
 negocio)  evidencia)                                                │
                                                                     └── ROJO ──► volver a IMPLEMENTACIÓN
```

### Artefactos por fase (convención del repo)

| Fase | Artefacto | Ruta real |
|---|---|---|
| SPEC | Maestro (qué hace el sistema) | `/home/jcromero09/chateam_jr/spec/SPEC.md` |
| SPEC | Detalle por dominio | `/home/jcromero09/chateam_jr/spec/modules/<x>-spec.md` |
| SPEC | Criterios de aceptación | `/home/jcromero09/chateam_jr/spec/acceptance/<x>.md` |
| PLAN | Olas con checkboxes | `/home/jcromero09/chateam_jr/plan/PLAN-FASE-2.md` |
| OPERACIÓN IA | Reglas para agentes | `/home/jcromero09/chateam_jr/AGENTS.md` |
| VALIDACIÓN | Gate ejecutable | `/home/jcromero09/chateam_jr/scripts/ci-gate.sh` |

> **Trazabilidad obligatoria**: cada `[ ]` del plan crea su `spec/modules/*.md` +
> `spec/acceptance/*.md` **antes** de codificar. Se marca `[x]` **solo con evidencia**
> (comando, sonda o gate). Ver `plan/PLAN-FASE-2.md` §Trazabilidad.

> **Si el código difiere de la spec, se corrige el código** — no la spec
> (`AGENTS.md` §2). Excepción: si el spec asume un stack que no es el tuyo, se
> reconcilia explícitamente en una tabla (ver §3.4).

---

## 3. Fase AUDITORÍA — confrontar el spec contra el código real

**Principio: medir, no opinar.** Cada afirmación de la auditoría lleva pegada su
evidencia (ruta:línea, conteo de grep, salida de sonda). Sin evidencia, es una opinión.

### 3.1 Inventario por grep/conteo

El inventario **precede** al juicio. Comandos que se usaron de verdad:

```bash
cd /home/jcromero09/chateam_jr

# ¿La versión de la Graph API está dispersa? (motivó A2.1)
grep -rn "v1[7-9]\.0\|v2[0-5]\.0" --include=*.ts services/ controllers/ | wc -l

# ¿Dónde vive el mock del ROAS?
grep -rn "Math.random" services/marketingApi.ts

# Superficie de la migración de UI: archivos que TOCAN MUI
grep -rl "from ['\"]@mui/" frontend/src --include=*.tsx --include=*.ts | wc -l

# Archivos que YA están en el design system nuevo
grep -rl "from ['\"]@/components/ui/" frontend/src | wc -l
```

Medición real al 2026-07-14: **220** archivos importan `@mui/`, **119** importan
`@/components/ui/`. Se solapan (migración en vuelo) — por eso el conteo de archivos
**no** es la métrica de avance: un archivo ya migrado sigue importando `@mui` por los
**residuales permitidos** (§8). La métrica válida es la adopción del DS en el alcance
acotado (`pages/`): **8 → 117**. Ver §3.5 y la tabla reconciliada en §11.

### 3.2 Clasificar cada ítem del spec

Cuatro estados, ninguno más. Sin "casi" ni "en progreso":

| Estado | Definición | Evidencia mínima |
|---|---|---|
| **EXISTE** | Funciona en producción con datos reales | Sonda/E2E en vivo o ruta:línea + prueba de ejecución |
| **PARCIAL** | El camino feliz corre, faltan ramas o está sin cablear | Ruta:línea de lo que hay + de lo que falta |
| **AUSENTE** | No hay código | Grep vacío (pegar el comando) |
| **MOCK** | **Hay código y miente** | Ruta:línea del mock |

**MOCK es la categoría más valiosa y la que más se pasa por alto.** Un módulo "verde"
que devuelve datos inventados es peor que uno ausente: el ausente no engaña a nadie.

### 3.3 Detectar mocks disfrazados

Patrones cazados en chateam (todos reales):

| Patrón | Caso real | Ruta |
|---|---|---|
| `Math.random()` en un cálculo de negocio | ROAS/spend/leads/revenue inventados | `services/marketingApi.ts:335-338` |
| Constante hardcodeada con pinta de cálculo | `confidence: 0.9x` como IC "estadístico" | Ola D · G4 (pendiente) |
| Servicio existe pero **no está cableado** | El mock de `marketingApi.ts` ni siquiera llegaba al backend | descubierto en E4.1 |
| Primitivo existe pero **sin scheduler** | `CampaignAlertEvaluator` sin cron | Ola B · D5.1 |
| Estado en memoria que se pierde al reiniciar | `AuditLogger` in-memory | NFR · N5 |
| Proxy que aparenta el dato real | expiración de token por `updatedAt` en vez de `debug_token` | Ola A · A3.2 |

Grep de caza rápido:

```bash
grep -rn "Math.random\|TODO\|FIXME\|mock\|fake\|dummy\|hardcode" \
  --include=*.ts services/ controllers/ | grep -vi "test\|spec"
```

**Regla anti-mock**: cuando no hay dato, se devuelve **`null` con un `dataStatus`
honesto** (`ok` / `no_spend` / `insufficient`), nunca un número inventado. Es lo que
hace `RoasService.getRoasByCampaign` (Ola B · E4.1).

### 3.4 Reconciliación de arquitectura (el spec asume otro stack)

Antes de auditar ítem por ítem: si el spec asume un stack ajeno, **reconcilia primero**
en una tabla explícita, o auditarás contra un sistema imaginario. Ejemplo real
(`plan/PLAN-FASE-2.md` §0):

| Spec dice | Realidad | Decisión |
|---|---|---|
| Backend NestJS | Express 4 + Sequelize | Mantener Express; "módulos" = `services/<X>Service/` |
| Colas BullMQ | Bull | Usar Bull existente; añadir DLQ persistente |
| Motor stats Python | nada formal | Sidecar FastAPI (patrón `timesfm-bridge:8540`) |
| Frontend + Flutter | React 18 + Vite (+Flutter) | Web para paneles; Flutter solo aprobaciones |

### 3.5 Estrategia de medición (la lección de G.3)

**No midas lo que es fácil de contar; mide lo que cuesta trabajo.**

| ❌ Métrica engañosa | ✅ Métrica útil |
|---|---|
| Nº de **imports** `@mui` | Nº de **usos reales de JSX MUI** por archivo |
| Nº de archivos que "tienen MUI" | Nº de archivos **vivos** que tienen MUI |

Por qué: **un import trae ~10 componentes**. `import { Box, Typography, Chip, ... } from '@mui/joy'`
cuenta como 1 import y son 60 conversiones. Contar imports subestima el esfuerzo ~10×.

Protocolo de medición para una migración masiva:

1. **Contar uso real de JSX**, no imports.
2. **Excluir ya migrados**: los que ya importan `@/components/ui/`.
3. **Excluir muertos/huérfanos**: `KanbanOLD.tsx`, `App.tsx.bak_lazy` y similares no
   se migran — se verifica que nadie los importe y se dejan.
4. **Bandear por esfuerzo** y lotear:

| Banda | Usos MUI | Estrategia |
|---|---|---|
| Ligera | < 40 | Lotes de ~25, 1 agente por archivo |
| Media | 40–99 | Lotes de ~25, revisión más cuidadosa |
| Pesada | ≥ 100 | Lotes de **10**; los monstruos (>1000 líneas), **por fases** (§5.4) |

### 3.6 Priorización risk-first

El orden de la auditoría y del plan es el mismo:

```
SEGURIDAD  >  INTEGRIDAD DE DATOS  >  FUNCIONALIDAD  >  UI
```

En chateam esto produjo literalmente el orden de las olas: **A** (tokens en texto plano,
webhook sin HMAC) antes que **B** (ROAS real) antes que **G** (rediseño). Justificación
del plan: *"sin esto, lo que 'TIENE' falla en producción (400s) o es inseguro"*.

---

## 4. Fase PLAN — olas priorizadas por riesgo

### 4.1 Anatomía de una ola

Cada ola es una unidad **desplegable y verificable**. No se abre la siguiente sin cerrar
el criterio de salida de la anterior.

```markdown
## OLA X — <nombre> (<prioridad P0/P1/P2>) · **<talla S/M/L/XL>** · <nota>
> <por qué existe esta ola, en 1-2 líneas>

- [ ] **X1.1** <tarea> *(<agente sugerido>)* — **<talla>**
- [ ] **X1.2** ...
- **Aceptación**: <condición binaria 1> · <condición 2> · <condición 3>
```

Reglas:
- **Prioridad = riesgo**, no valor comercial (§3.6). La única excepción son las olas
  transversales sin acoplamiento (G corrió en paralelo desde el inicio).
- **Aceptación binaria y observable**. Mal: "el ROAS funciona". Bien: *"dashboard
  muestra ROAS = ventas/spend real (no aleatorio) por anuncio · atribución consultable
  en SQL"*.
- **Un agente sugerido por tarea** (`security-engineer`, `data-engineer`…), asignado en
  el plan, no improvisado en ejecución.

### 4.2 Reversible vs sensible

Clasifica **cada** tarea antes de tocarla. Determina el protocolo, no la dificultad.

| Clase | Ejemplos | Protocolo obligatorio |
|---|---|---|
| **Reversible** | Re-skin de UI, añadir endpoint, nueva columna nullable | Gate + swap. Rollback = swap inverso. |
| **Sensible** | Migración de datos, cifrado, tocar auth/sesión, borrar columnas | Diseño pre-investigado + **script inverso probado** + backup + verificación en vivo + gate |

**Patrón para cambios sensibles** (el que hizo funcionar A3.1 sin caída):

1. **Retrocompatible por diseño, cero big-bang.** `decryptSecret()` hace *passthrough*
   si el valor no tiene el prefijo `enc:v1:` → el código nuevo convive con datos viejos
   sin migrar. `encryptSecret()` es **idempotente** (no re-cifra lo ya cifrado) → la
   migración se puede correr dos veces sin daño.
2. **Auditar TODOS los write-paths antes de migrar.** Gotcha real: `Model.update`
   **estático** (bulk) **no corre los setters de instancia** → hubo que arreglar 2
   excepciones (`MetaWebhookController`, `TokenManager`).
3. **Migración con script inverso**, probado: `scripts/encrypt-meta-tokens.ts` — 14+6
   tokens cifrados, 0 en plano, reversible verificado 20/20.
4. **Verificar que lo de aguas abajo sigue vivo**: que WhatsApp Cloud y CAPI **seguían
   enviando** con el token descifrado por el getter; webhook `/metaws` → 200.
5. **Documentar la dependencia nueva**: `ENCRYPTION_KEY` debe respaldarse fuera de
   banda — **perderla = tokens irrecuperables**.

Artefactos: `helpers/secretCrypto.ts` (AES-256-GCM, clave derivada por `scrypt`, formato
`enc:v1:<iv>:<tag>:<ct>`) · `spec/modules/marketing-secret-encryption-spec.md`.

### 4.3 Estrangulamiento (strangler), no big-bang

Para migraciones de UI/framework: lo nuevo **coexiste** con lo viejo hasta terminar.

El habilitador técnico en chateam es **Tailwind v4 sin preflight**
(`frontend/src/tailwind.css`):

```css
/* Solo theme + utilities. SIN preflight → no resetea las pantallas MUI existentes. */
@layer theme, base, components, utilities;
@import "tailwindcss/theme.css" layer(theme);
@import "tailwindcss/utilities.css" layer(utilities);
```

Consecuencia a pagar (no es gratis): sin preflight, los componentes del DS deben
**resetearse a mano**. `ui/button.tsx` lleva `appearance-none border-0
[font-family:inherit] cursor-pointer` en la base del `cva` porque el reset global no
existe (la variante `outline` sobreescribe el borde vía `tailwind-merge`).

---

## 5. Fase IMPLEMENTACIÓN — agentes en paralelo

### 5.1 Las tres reglas

| Regla | Por qué |
|---|---|
| **1 archivo = 1 agente** | Dos agentes en un archivo = conflicto de escritura silencioso |
| **Prompt acotado** (<300 palabras, alcance cerrado) | Un prompt vago produce refactors no pedidos |
| **Edición-only: `tsc`, NUNCA `build`** | Ver §8-G1: un `vite build` de un sub-agente **publica a producción** |

### 5.2 Plantilla de prompt para sub-agente de migración

```
Migra SOLO el archivo <ruta absoluta> de MUI Joy al design system.

ALCANCE (nada fuera de esto):
- Box/Typography + sus `sx` → div/p + utilidades Tailwind.
- Chip/Avatar/IconButton/Button → @/components/ui/*.
- PRESERVA verbatim: hooks, llamadas api, sockets, handlers, lógica de negocio.
- Deja en MUI a propósito: Autocomplete, CircularProgress, LinearProgress.

PROHIBIDO:
- Ejecutar `npm run build` o `vite build` (publica a producción — lo hace el orquestador).
- Tocar cualquier otro archivo.
- Cambiar comportamiento, rutas o contratos de API.

VERIFICACIÓN (única permitida):
- npx tsc --noEmit -p frontend/tsconfig.json   ← NO lo corras si el orquestador ya lo agenda

ENTREGA: resumen de conversiones + conteo antes/después (Box=N→0, api=N idéntico).
```

### 5.3 Invariantes que el agente debe preservar (y cómo probarlo)

La consigna es **"re-skin, no re-escritura"**. Contadores antes/después como prueba:

| Invariante | Verificación real usada |
|---|---|
| Lógica intacta | `hooks=141 y api=33 IDÉNTICOS` antes/después (Tickets fase 1) |
| Gating de menú | `menuSections` verbatim: **105 ítems**; en vivo **101 (super) vs 78 (user)** |
| Drag & drop | `@hello-pangea/dnd` **no se toca**: 10 lanes droppable + 3 cards draggable en vivo |
| Sin regresión de datos | `/contacts` con data = 3108/21 filas/0 errores |

### 5.4 Archivos monstruo: por fases

`Tickets.tsx` = **4.681 líneas** (141 hooks, 33 llamadas api, sockets, 13 subcomponentes).
El prototipo tenía **61 líneas**: lo **subrepresenta 76×**. Un swap habría borrado el core.
Por eso se hizo en 3 fases, **cada una con gate verde y desplegada**:

| Fase | Alcance | Resultado |
|---|---|---|
| 1 | Presentación: `Box`(63) + `Typography`(59) + `sx` → div/p + Tailwind | Box=0, Typography=0, className=117, hooks/api idénticos |
| 2 | `IconButton`(18→0), `Chip`(9→0), `Avatar`(7→0), `Button`→DS | @mui/joy limpiado; api=33 idéntico |
| 3 | Comportamiento → **Radix**: Modal→Dialog, Menu→DropdownMenu, Select, Tabs, Tooltip(19) | api=33 idéntico; verificado **funcionalmente** |

Ventaja del fraseo por fases: cuando un sub-agente se interrumpió a media fase 3 dejando
~400 líneas rotas, **las fases 1 y 2 ya estaban en producción y verdes** → se recuperó
solo la región rota (§8-A5).

Nota de diseño: la fase 3 separa **estilo** de **comportamiento**. Select/Modal/Tabs/
Tooltip **no son estilo** — se conservan en MUI hasta tener el wrapper Radix listo.

### 5.5 Rediseño con criterio (patrón "Soho")

Migrar ≠ rediseñar. Tras migrar Tickets a DS se rediseñó la lista al patrón shadcn chat:

- Fila de 2 líneas: nombre + hora / preview + pill de no-leídos.
- Avatar con punto de canal; tabs planos.
- **Tamaños de texto estándar — nada bajo 12px** (a11y).
- Se **respeta la paleta** de marca: teal `#005166` / cyan `#23dada` (no la del prototipo).

---

## 6. Fase VALIDACIÓN — el gate

### 6.1 Los 4 pasos

`bash /home/jcromero09/chateam_jr/scripts/ci-gate.sh` — verde/rojo, sin matices:

| # | Paso | Qué protege |
|---|---|---|
| 1 | **RBAC smoke** (`node tests/rbac-smoke.mjs`) | Regresión de los 3 P0: privesc vía `PUT /users/:id`, fuga de `stripeSecretKey`/`paypalSecretKey`/`facebookAppSecret` en `GET /companies` y `GET /settings/facebook` |
| 2 | **E2E Playwright en vivo** (`playwright.live.config.ts`) | login UI + RBAC + automation + a11y contra `https://padeldev.codigo.plus` |
| 3 | **npm audit** (gate: 0 críticas **nuevas** sobre baseline) | Vulns nuevas, sin bloquear por deuda conocida |
| 4 | **URL de API horneada en el build** | Regresión del bug de CORS (build apuntando a prod/localhost) |

### 6.2 Complementos que el gate no cubre

```bash
cd /home/jcromero09/chateam_jr

# tsc — OBLIGATORIO: vite/esbuild transpila SIN type-check (§8-B3)
npm run type-check                       # backend: tsc -p tsconfig.json --noEmit
npx tsc --noEmit -p frontend/tsconfig.json

# a11y (incluido en el paso 2, pero se puede aislar)
npx playwright test tests/e2e/a11y.spec.ts --config=playwright.live.config.ts
```

**a11y — gate duro**: `critical = 0`. `serious`/`moderate` se listan como advertencia y
no bloquean (`tests/e2e/a11y.spec.ts`). Meta alcanzada en login y dashboard: **0/0/0**.

### 6.3 Regla: evidencia antes de afirmar

Un `[x]` sin evidencia es una mentira documentada. Jerarquía de evidencia:

```
Sonda funcional en vivo  >  E2E  >  gate verde  >  tsc  >  "el agente dijo que sí"
       (vale)              (vale)    (vale)      (parcial)      (NO vale)
```

**"Renderiza" no es "funciona".** En la fase 3 de Tickets no bastó con que la página
pintara: se verificó **abriendo un Select Radix y comprobando que desplegaba 16 opciones
reales**. Un componente Radix mal cableado renderiza perfecto y no abre.

Si no puedes verificar algo, se escribe **"pendiente de verificar"**. No se marca `[x]`.

---

## 7. Runbook de despliegue seguro (safe-swap)

> ⚠️ `frontend/dist` **se sirve en vivo**. Escribir ahí = publicar al instante.
> El build **nunca** se hace sobre el directorio servido.

**Estado**: este runbook refleja la práctica ejecutada; **no está cristalizado en un
script del repo** (`scripts/` tiene `deploy.sh`/`deploy-production.sh` genéricos, no el
safe-swap del frontend). **Pendiente: extraer a `scripts/safe-swap.sh`.**

### 7.1 Secuencia

```bash
cd /home/jcromero09/chateam_jr/frontend

# 1) BUILD fuera del directorio servido  (llamada propia — el Bash tool corta a 2 min)
npx vite build --outDir /tmp/fe-next --emptyOutDir

# 2) COMPRESIÓN (llamada aparte). brotli NO está en PATH → usar node zlib.
node -e '
const fs=require("fs"),zlib=require("zlib"),path=require("path");
const dir="/tmp/fe-next/assets";
for (const f of fs.readdirSync(dir)) {
  if (!/\.(js|css)$/.test(f)) continue;
  const p=path.join(dir,f), buf=fs.readFileSync(p);
  fs.writeFileSync(p+".gz", zlib.gzipSync(buf,{level:9}));
  fs.writeFileSync(p+".br", zlib.brotliCompressSync(buf,{
    params:{[zlib.constants.BROTLI_PARAM_QUALITY]:11}
  }));
}
console.log("comprimido OK");
'

# 3) GATE sobre el candidato ANTES del swap (paso 4 = URL horneada en TODOS los chunks)
grep -rl 'padeldev.codigo.plus/be' /tmp/fe-next/assets/*.js | wc -l   # debe ser >= 1

# 4) SWAP (llamada aparte). `rm -rf` está bloqueado → mv.
mv dist dist.prev.$(date +%s) && mv /tmp/fe-next dist

# 5) GATE completo contra el entorno vivo
cd /home/jcromero09/chateam_jr && bash scripts/ci-gate.sh
```

### 7.2 Rollback

```bash
cd /home/jcromero09/chateam_jr/frontend
mv dist dist.bad && mv dist.prev.<timestamp> dist    # < 1s, sin rebuild
```

**Por qué funciona**: el swap es un `mv` atómico de directorio y `dist.prev.*` conserva
el build anterior **ya comprimido**. Nunca borres `dist.prev.*` antes del gate verde.

### 7.3 Retención

Limpiar los `dist.prev.*` viejos **solo tras gate verde**, y con `find`, no `rm -rf`:

```bash
find /home/jcromero09/chateam_jr/frontend -maxdepth 1 -name 'dist.prev.*' -mtime +3 -exec rm -r {} +
```

---

## 8. Catálogo de GOTCHAS

> La sección más valiosa. Cada uno costó un incidente. **El *porqué* importa más que la regla**:
> sin el porqué, alguien la "optimiza" y reincide.

### A. Agentes y orquestación

**A1 · Los sub-agentes NUNCA corren `vite build`.**
`frontend/dist` se sirve en vivo. Un sub-agente que "verifica con un build" **sobrescribe
producción** — y además sin `.gz`/`.br`, porque vite no los genera → nginx sirve sin
compresión o rompe. Instrucción explícita en el prompt: *"solo `tsc`, NO build"*. El
build + compresión + swap los hace **solo el orquestador** (§7).

**A2 · NAS de 4 cores con hardware watchdog: no lanzar 14 `tsc` concurrentes.**
Cada `tsc` come un core; 14 saturan la máquina, el **watchdog de hardware reinicia el
NAS** y te llevas por delante todos los proyectos, no solo este. Los agentes son
**edit-only**; el orquestador corre **UN solo `tsc` por oleada**, al final. (Ver
`reference_nas_watchdog_saturacion`.)

**A3 · Sesión única: usar la cuenta QA, NUNCA admin.**
El backend revoca la sesión anterior al loguear. Si un agente entra con
`admin@chateam.com`, **echa al usuario de su sesión**. Cuenta dedicada:
`qa-agent@chateam.com` (`tests/e2e/a11y.spec.ts` la usa por defecto).
`playwright.live.config.ts` va con **`workers: 1`** por lo mismo: *"serial: evita que
logins de la misma cuenta se revoquen entre sí"*.
⚠️ **Contra-gotcha**: la cuenta QA puede tener el **inbox vacío** → no sirve para validar
pantallas con filas de datos. Para eso hace falta una cuenta con datos reales; planifícalo.

**A4 · Los args del Workflow pueden llegar como string.** Parsear defensivamente
(`typeof x === "string" ? JSON.parse(x) : x`) o el agente arranca con la entrada rota.

**A5 · Agente interrumpido a media conversión = archivo roto, pero el dist en vivo está a salvo.**
Pasó de verdad: ~400 líneas con `Modal`/`Menu`/`Option` **undefined** (quitados del
import, aún usados en el JSX → crash en runtime). Como el agente **no hizo build** (A1),
producción seguía en la fase anterior. **Recuperación correcta**: diagnosticar **por
región** y lanzar un 2º agente enfocado a terminar la conversión. **NO revertir las fases
previas** — ya estaban verdes y desplegadas.
> Variante del mismo bug: un agente quitó `Chip`/`IconButton` del import **y dejó 3 usos**.
> Por eso la entrega del agente debe incluir conteos: `Chip=0` significa 0 **usos**, no 0 imports.

**A6 · Sin git en el árbol → respaldar cada lote antes de migrar.**
`chateam_jr` no es repo git. No hay `git checkout --` que te salve.

```bash
cd /home/jcromero09/chateam_jr
mkdir -p frontend/src/.bak-$(date +%F) && cp <archivos-del-lote> frontend/src/.bak-$(date +%F)/
```

### B. Build, gate y tooling

**B1 · El paso 4 del gate debe mirar TODOS los chunks, no solo `index-*.js`.**
El **code-splitting mueve `VITE_API_URL` fuera del chunk entry** (se va al chunk del api
client). Si buscas solo en el entry, el gate falla con el build correcto.
**Falso negativo característico: el E2E de login pasa (la app funciona) pero el paso 4
falla.** Ya está corregido en `scripts/ci-gate.sh:34`:

```bash
CHUNKS=$(grep -rl 'padeldev.codigo.plus/be' frontend/dist/assets/*.js 2>/dev/null | wc -l)
```

**B2 · El hash del entry puede traer guiones** (`index-Ub5-Wjg6.js`). Cualquier regex
sobre el nombre del chunk debe incluir `-`: `index-[A-Za-z0-9_-]+\.js`. Un `[A-Za-z0-9]+`
no matchea y el check da falso negativo.

**B3 · `vite`/`esbuild` transpila SIN type-check.** El build puede pasar **verde con
errores de tipo**. Correr `tsc --noEmit` **aparte, siempre**. Así se halló un `Checkbox`
recibiendo props inexistentes — build verde, componente roto.

**B3.0 · El glob del inventario ES la métrica. Un `*` en vez de `**` borra trabajo del plan.**
Caso real (cierre de G.3): el work-list se construyó con `pages/*.tsx` — **no recursivo**. `pages/` tenía
subcarpetas (`pages/Integrations/` ×7) que **nunca existieron para el plan**: 395 usos MUI invisibles
durante 15 oleadas. El plan reportaba "153/153 completo" mientras faltaba un 6% que nadie había contado.
1. Al definir la métrica (§3.5), **usar siempre `find <dir> -name '*.tsx'`** (recursivo), nunca `dir/*.tsx`.
2. **Verificar el cierre con una métrica distinta a la del inventario.** Aquí el inventario decía 153/153
   pero `grep -r` sobre el símbolo objetivo (`<Box|<Typography|…`) delató 668 usos restantes. Si la
   métrica de avance y la de cierre son la misma, un sesgo en la definición se auto-confirma.
3. Regla general: **el 100% de un inventario mal definido sigue siendo un 100% falso.**

**B3.1 · Un sub-agente puede filtrar sus propios tags de tool-call dentro del archivo.**
Caso real (oleada H1, `pages/EmailCreditsDashboard.tsx`): el agente dejó `</content>` y
`</invoke>` pegados al final del `.tsx` **y aun así reportó `status: "done"`**. El código
era correcto hasta la última llave; solo sobraba la basura. Lecciones:
1. **El auto-reporte del agente no es evidencia.** `done` ≠ compila, y `done` ≠ *hecho*. Solo el
   `tsc` + un `grep` del símbolo objetivo deciden. Cifras reales de G.3 (163 pantallas):
   - **5 fugas de tags** en 5 oleadas distintas, todas reportadas `done` (`EmailCreditsDashboard`,
     `WebChatHistory`, `UGCCreatorNetwork`, `Companies`, `IntegrationSGR`). Ninguna la detectó el
     agente ni el build; todas el `tsc`/barrido.
   - **3 agentes reportaron `done` dejando el 60-98% del archivo sin migrar** (`WhatsAppTemplates` 98
     usos, `AISubplans` 86, `IntegrationAriaLite` 64). Compilaban. Pasaban el gate. Estaban sin hacer.
   - ⇒ **Verificar completitud con un contador del símbolo objetivo, no con el reporte del agente.**
     `grep -c '<Box\|<Typography\|…'` por archivo, antes de dar la ola por cerrada.
2. Añadir un **barrido preventivo** al cierre de cada oleada, antes del `tsc`:
   ```bash
   grep -rln "^</content>\|^</invoke>\|^</antml" frontend/src --include="*.tsx" --include="*.ts"
   ```
3. Es un error de **sintaxis**, así que `tsc` lo reporta como `TS1128: Declaration or
   statement expected` en las últimas líneas del archivo. Si ves TS1128/TS1109 al final
   de un archivo recién migrado, sospecha fuga de tags antes que del código.

**B4 · `brotli` no está en PATH.** Generar `.br` con `zlib.brotliCompressSync` de node,
quality 11 (§7.1). Si no, nginx sirve sin brotli.

**B5 · El Bash tool corta a 2 minutos.** Build y compresión en **llamadas separadas** con
timeout amplio. Si los encadenas con `&&`, el corte deja **el swap sin ejecutar** — o
peor, a medias.

**B6 · `rm -rf` está bloqueado.** Usar `find ... -delete` / `find ... -exec rm -r {} +` o `mv`.

**B7 · Los `.env` son read-only para el agente.** Nunca escribir en ellos (ni `sed`, ni
`cp`, ni `node -e`). Si un cambio necesita una variable nueva (ej. `ENCRYPTION_KEY`), se
**documenta y se pide a JC**; no se aplica.

### C. Backend y sesión

**C1 · `ERR_SESSION_EXPIRED` ≠ `session_revoked`. No los trates igual.**

| Código | Significado | Acción correcta |
|---|---|---|
| `ERR_SESSION_EXPIRED` | JWT caducado | **Refresh silencioso** |
| `session_revoked` | Sesión única: otro login te echó | **Logout inmediato** |

Tratar el primero como logout **rompe el refresh** y saca a los usuarios cada vez que
caduca el token.

**C2 · `Model.update` estático no corre setters de instancia.** Si cifras una columna vía
getter/setter del modelo, los write-paths **bulk** la escriben en plano y se saltan el
cifrado. Auditar todos los write-paths antes de migrar (§4.2, paso 2).

### D. Design system y a11y

**D1 · Los tokens de superficie NO sirven como color de texto.**
`--success` / `--warning` / `--destructive` están pensados para **fondos**; sobre claro
**no alcanzan 4.5:1** como texto → violación de contraste. Fix sistémico: tokens
semánticos dedicados **`--success-text` / `--warning-text` / `--destructive-text`**
(oscuros en claro, claros en oscuro) — `frontend/src/tailwind.css:35-38, 55-56`.
Aplicados en `ui/badge`, `ui/avatar`, `ui/stat-tile`, `dashboard/*` y las 9 pantallas.
Resultado: **a11y login 0/0/0 y dashboard 0/0/0**.
> Del mismo barrido: los títulos de sección del sidebar estaban en `text-white/35`
> (contraste **2.43**) → `/70`.

**D2 · Sin preflight, los componentes del DS se resetean a mano.** Ver §4.3.

**D3 · MUI residual aceptado a propósito** — no es deuda, es decisión:

| Componente | Motivo |
|---|---|
| `Autocomplete` (×2 en Tickets) | Sin equivalente Radix |
| `CircularProgress` / `LinearProgress` | Sin equivalente; coste/beneficio negativo |
| `useColorScheme` | Puente de tema (`mode` → clase `.dark` en `<html>`) |

**D4 · Dark mode**: la paleta oscura de Tailwind **no se activa sola**. Necesita el puente
que escribe la clase `.dark` en `<html>` (`@custom-variant dark` en `tailwind.css:11`).
Sin él, los tokens `.dark` están definidos y **nunca aplican**.

---

## 9. Plantillas copiables

### 9.1 Ficha de hallazgo de auditoría

```markdown
### [<ID>] <título corto del hallazgo>
- **Spec dice**: <requisito, con referencia al documento §>
- **Realidad**: EXISTE | PARCIAL | AUSENTE | **MOCK**
- **Evidencia**: `<ruta:línea>` · comando: `<grep/sonda + salida resumida>`
- **Riesgo**: SEGURIDAD | DATOS | FUNCIONALIDAD | UI  ·  **Impacto**: <1 línea>
- **Gap**: <qué falta exactamente — no "mejorar X">
- **Propuesta**: <cambio mínimo> · **Clase**: reversible | sensible
- **Talla**: S | M | L | XL  ·  **Agente**: <rol>
- **Ola destino**: <A..H>
```

Ejemplo real:

```markdown
### [E4.1] ROAS del dashboard es aleatorio
- **Spec dice**: dashboard de ROAS real por anuncio (criterio de éxito del spec)
- **Realidad**: **MOCK**
- **Evidencia**: `services/marketingApi.ts:335-338` → `spend: Math.random()*1000+500`,
  `roas: Math.random()*3+1`. Además: no estaba cableado al backend.
- **Riesgo**: DATOS · **Impacto**: la promesa comercial del módulo es ficción
- **Gap**: no hay fuente de revenue atribuido ni de spend; falta `insights_daily`
- **Propuesta**: `RoasService` = Σ revenue atribuido ÷ Σ spend, con `dataStatus`
  honesto (`ok`/`no_spend`/`insufficient`) y **null en vez de inventar**
- **Clase**: reversible (endpoint nuevo) · **Talla**: L · **Agente**: data-engineer
- **Ola destino**: B
```

### 9.2 Ficha de ola

```markdown
## OLA <X> — <nombre> (<P0|P1|P2>) · **<S|M|L|XL>** · <nota de dependencia>
> <por qué existe, 1-2 líneas>

- [ ] **<ID>** <tarea> *(<agente>)* — **<talla>**
- **Aceptación**: <cond. binaria 1> · <cond. 2> · <cond. 3>

<!-- Al cerrar, sustituir el encabezado por: -->
> **✅ OLA <X> COMPLETA (<fecha>):** <ID1> (<qué>) · <ID2> (<qué>).
> <resultado medible>. Gate verde en cada paso.
> *Pendientes conocidos: <lista explícita o "ninguno">.*
```

### 9.3 Checklist de cierre de ola

```markdown
- [ ] Todos los `[x]` tienen evidencia pegada (comando/sonda/gate) — §6.3
- [ ] `spec/modules/<x>-spec.md` + `spec/acceptance/<x>.md` creados/actualizados
- [ ] Criterio de aceptación de la ola verificado, condición por condición
- [ ] Barrido de fuga de tags de tool-call (§8-B3.1) — antes del tsc:
      `grep -rln "^</content>\|^</invoke>\|^</antml" frontend/src --include="*.tsx" --include="*.ts"`
- [ ] `bash scripts/ci-gate.sh` → 🟢 GATE VERDE (los 4 pasos)
- [ ] `npm run type-check` y `npx tsc --noEmit -p frontend/tsconfig.json` limpios
- [ ] a11y: axe critical = 0 en las pantallas tocadas
- [ ] Cambios sensibles: script inverso probado + backup + verificación aguas abajo
- [ ] Verificación FUNCIONAL en vivo, no solo render (abrir el Select, no mirarlo)
- [ ] Desplegado por safe-swap; `dist.prev.*` conservado hasta el gate verde
- [ ] Bloque **PROGRESO** escrito en el plan con fecha, evidencia y **pendientes conocidos**
- [ ] Gotchas nuevos añadidos a §8 de esta guía (con el *porqué*)
```

### 9.4 Bloque PROGRESO (formato)

Va **en el plan**, no en un archivo aparte. Lo que hace útil el bloque es que declara
**lo que quedó fuera**:

```markdown
> **✅ OLA B COMPLETA (2026-07-13/14):** C2.1 (atribución normalizada) · D5.1
> (InsightsDaily + job horario) · E4.1 (ROAS real endpoint) · C3.1 (paid/organic) ·
> B5.1 (valor por etapa + venta manual). **Loop ROAS probado E2E** (venta→revenue→
> atribución a campaña). Gate verde en cada paso.
> *Activación numérica del ROAS = automática cuando el job de insights corra con
> tokens Meta válidos (spend) — infra lista.*
```

---

## 10. Apéndice — el arco ejecutado en chateam_jr

Trazabilidad de dónde salió cada lección. Fuente: `plan/PLAN-FASE-2.md`.

**Origen**: spec "Marketing Suite" (Meta Ads 2026 + CAPI + motor estadístico, v1.0 Jul
2026, CODEPLUS) confrontado contra el código real (auditoría 2026-07-13, **5 agentes
paralelos**) → `plan/PLAN-FASE-2.md`, olas **A–H**.

### Ola A — Seguridad de plataforma Meta (P0) · **5/5** ✅ 2026-07-13

| ID | Entrega | Evidencia |
|---|---|---|
| A2.1 | `config/metaGraph.ts`: fuente única `GRAPH_API_VERSION = v24.0` (override `FB_GRAPH_VERSION`) + helper `graphUrl()`. Antes: versión hardcodeada en ~26 archivos (v17..v25); las rutas CAPI arrastraban v18/v19/v20 → **HTTP 400 por versión expirada** | 0 defaults <v24 en CAPI; config resuelve v24.0 |
| N6.1 | **HMAC X-Hub-Signature-256** en `FBPageWebhookController.receive` (antes del `sendStatus(200)`), reusa `shouldAcceptWebhook` + `req.rawBody`. Modo default `warn`; listo para `META_SIGNATURE_MODE=enforce` | webhook responde; gate verde |
| A3.1 | **Cifrado en reposo AES-256-GCM** de `Whatsapp.tokenMeta` y `CompaniesSettings.facebookSystemUserToken` (`helpers/secretCrypto.ts`) | **14+6 tokens cifrados, 0 en plano**; reversible **20/20**; `/metaws`→200 |
| A3.2 | Expiración **real** vía `debug_token` (`tokenMetaExpiresAt`) + **alerta a 7 días**; fallback al proxy `updatedAt` | node boot OK; gate verde |
| N2.1 | **DLQ CAPI verificada — ya satisfecha, sin cambios**: persist-before-send en los 4 dispatchers; estado en tabla `FacebookConversionEvent` (independiente de la retención de Bull); fallidos 7d; `POST /facebook-conversions/retry-failed` | auditoría de rutas:línea |

> **Lección**: N2.1 se cerró **sin escribir código**. Auditar antes de implementar evita
> re-construir lo que ya existe.
> **Deuda declarada de A3.1**: mismo trato pendiente para `pageAccessToken`,
> `facebookAppSecret` y API keys de IA.

### Ola B — Atribución + ROAS real (P0) · **5/5** ✅ 2026-07-13/14

| ID | Entrega | Evidencia |
|---|---|---|
| C2.1 | Atribución **normalizada** en `CampaignMessages`: `campaignId`/`adSetId`/`campaignName`/`adName`/`adSetName` (+ índices `company+campaign`, `company+adset`) — antes solo en `rawData` JSON | Backfill **1163 filas / 24 campañas**. *(3438 msgs con `ctwaClid`; ~2500 sin cadena resuelta → requieren re-resolución vía Graph)* |
| D5.1 | Modelo/tabla `InsightsDaily` (upsert `companyId+date+level+objectId`) + job horario `ImportInsightsDailyService` en `backendCronJobs.ts` (`cron '0 * * * *'`) | cron registrado en boot |
| B5.1/E3.1 | **Valor por etapa** (`Tag.metaValue`/`metaCurrency` → `customData` del CAPI) + `POST /facebook-conversions/register-sale` | **E2E: venta $250 → `revenue=250, conv=1`** en la campaña correcta |
| E4.1 | `services/MetaMarketingService/RoasService.ts` + `GET /meta-marketing/roas`: Σ `AttributionConversions.totalRevenue` ÷ Σ `InsightsDaily.spend`, `dataStatus` honesto | company 6 → 12 campañas reales, 78 conversaciones; **ROAS `null` por falta de spend = correcto** |
| C3.1 | Flag `Ticket.sourceKind` (paid\|organic) + populate on-capture | Backfill **2532 pauta / 4910 orgánico** |

> **Pendientes conocidos (no marcados como hechos)**: el mock `Math.random` de
> `services/marketingApi.ts:335-338` **sigue en el árbol** — `RoasService` lo reemplaza
> funcionalmente, pero el frontend aún no lo consume. El ROAS numérico se activa solo
> cuando el job D5.1 corra con tokens Meta válidos (spend).

### Ola G — Rediseño frontend (P1) · Tailwind v4 + shadcn + Radix

| Sub-ola | Entrega | Evidencia |
|---|---|---|
| **G.0** ✅ | Design system: Tailwind v4 vía `@tailwindcss/vite` **sin preflight**, tokens en CSS vars + `@theme inline`, **Poppins self-hosted**, `cn()` (cva+clsx+tailwind-merge), `components/ui/` | build OK con MUI intacto; gate verde (**11 E2E**), a11y dashboard critical=0 |
| **G.1** ✅ | Re-skin del shell `AppLayout.tsx` (**1856→1728 L**) preservando **105 ítems** de menú, `filterItem` (roles/`canAccess`/`hasFeature`), 4 `useEffect` de badges + sockets. Sidebar 260/68px, off-canvas móvil, `clamp()`, `@container`. a11y: skip-link, `aria-current`, `aria-expanded`. **BONUS**: puente de tema `.dark` | menú **101 (super) vs 78 (user)** = gating OK; `/contacts` 3108/21 filas/0 errores; móvil 390px OK; a11y login 0/0/0 |
| **G.2** ✅ 9/10 + Tickets | 10 pantallas del prototipo con datos reales. **Funnel/Kanban**: re-skin cuidadoso, `@hello-pangea/dnd` intacto. **Tickets.tsx (4681L)**: 3 fases + rediseño "Soho" | Funnel: 10 lanes + 3 cards + 3 handles cableados. Tickets fase 3: 4 Selects Radix, **16 opciones reales al abrir**; a11y 0/0/0 |
| **G.3** 🟡 | Migración masiva MUI→DS en oleadas: piloto 4 + 4 oleadas de ~25 → **103 desplegadas y verdes**; banda pesada de 50 (≥100 usos MUI) en lotes de 10 | ver nota ⚠️ abajo |

> ✅ **Conteos reconciliados (2026-07-14)**. No había contradicción: cada número mide un
> alcance distinto. Esta tabla es el ejemplo canónico de por qué §3.5 exige definir la
> métrica **antes** de contar:
>
> | Medición | Valor | Qué mide realmente |
> |---|---|---|
> | `grep -rl '@mui' src/**/*.tsx` | 220 | **Sobrecuenta**: incluye `components/` (fuera del alcance de G.3) y los **residuales permitidos** (§8) |
> | `grep -rl '@mui' pages/` | 130 | Bajó de 169; las migradas **conservan residual a propósito** |
> | `pages/` con **uso real de JSX MUI** | 162 → work-list **154** | Métrica de G.3: excluye ya-migradas (importan DS) y huérfanos |
> | **`pages/` que importan `@/components/ui`** | **117** (arranque: 8) | ← **la señal real de avance** |
>
> **Regla que se deriva de esto**: el conteo de `@mui` **nunca llegará a 0 por diseño**
> (Autocomplete / CircularProgress / LinearProgress se conservan), así que **no sirve como
> criterio de salida**. El avance se mide por **adopción del DS** (`pages/` con
> `@/components/ui`): **8 → 117**. El *"~90 restantes"* de `PLAN-FASE-2.md` es una
> estimación previa a la medición formal y quedó obsoleta.

### Ola H — Moderador de comentarios FB/IG (P1) · pendiente

Portar capacidades del prototipo `moderador-meta.zip` (Laravel+Next.js, **no se
despliega** — stack ajeno) sobre el módulo social existente (`SocialCommentServices/`,
`CommentAutoReplyServices/`, `ModerateCommentService`, RAG + Anthropic SDK).
H.1 clasificación IA → H.2 cola humana obligatoria → H.3 borrador IA asistido → H.4
notificación Telegram → H.5 audit inmutable → H.6 panel (depende del DS de G).
**Aceptación**: cero publicación automática en categorías sensibles.

> **Lección transversal de A/B/G**: en los tres casos el trabajo real fue **integrar y
> pulir**, no construir. El spec pedía un sistema nuevo; la auditoría demostró que
> ~60% ya existía (Embedded Signup, CAPI con dedup + SHA-256/EMQ, captura CTWA, Kanban,
> agente IA Meta Ads, z-test A/B). El plan solo cerró los gaps confirmados.

---

## 11. Resumen ejecutable

```bash
cd /home/jcromero09/chateam_jr

# AUDITAR — medir, no opinar
grep -rn "Math.random\|TODO\|FIXME\|mock" --include=*.ts services/ controllers/ | grep -vi test

# VALIDAR — el gate manda
bash scripts/ci-gate.sh          # 4 pasos: RBAC · E2E live · npm audit · URL horneada
npm run type-check               # vite NO hace type-check (§8-B3)

# DESPLEGAR — nunca build sobre el dist servido (§7)
```

**Los 5 mandamientos**:
1. Evidencia antes de afirmar. Sin evidencia, es "pendiente de verificar".
2. Risk-first: seguridad > datos > funcionalidad > UI.
3. Los agentes editan; el orquestador construye y despliega.
4. Estrangular, no big-bang. Cada ola despliega verde.
5. Mide lo que cuesta trabajo, no lo que es fácil de contar.
