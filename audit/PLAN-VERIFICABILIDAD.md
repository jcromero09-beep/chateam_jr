# PLAN — Verificabilidad y unificación de canales

> 2026-07-31. Todo lo de aquí está **medido hoy por inspección directa**; los comandos que
> lo producen están en cada fila. Lo no verificado se declara como tal.
>
> **Encuadre**: el problema de fondo de la plataforma no es ningún bug concreto, es que
> **un cambio no se puede verificar automáticamente**. El CI está rojo, así que un rojo no
> informa de nada; `tsc` y `eslint` no terminan; y el mismo subsistema existe por triplicado
> en tres canales, de modo que un arreglo cuesta tres veces o se aplica en uno solo. Este
> plan ataca eso en tres olas, en orden de retorno.

---

## 0. Corrección de un diagnóstico anterior

Antes de planificar hay que retirar dos afirmaciones que circulaban y son **falsas**:

| Afirmación previa | Realidad medida hoy | Evidencia |
| --- | --- | --- |
| "Faltan por augmentar los tipos de `req.user`; 37 errores TS por eso" | **Ya está hecho.** `@types/express.d.ts` declara `Express.Request.user` completo (id, profile, companyId, super, sid, roleId, impersonatedBy, tokenVersion, clientType) desde la Ola 5 de auditoría | `@types/express.d.ts`, 37 líneas |
| "Hay 37 errores de tipos de baseline en el grafo del wbot" | **Son 0.** Los 37 eran un artefacto de un `tsconfig.check.json` acotado que, al listar `include` a mano, dejaba fuera `@types/express.d.ts` y con él la augmentación global | `tsc -p` con `@types/express.d.ts` en `include` → `EXIT=0`, 0 errores |

Lección aplicable a cualquier `tsconfig` acotado que se use como gate (patrón habitual aquí por
`reference: tsc OOM`): **incluir siempre los `.d.ts` ambient**, o el recorte fabrica errores que no existen.
Un `include` a mano apaga las augmentaciones globales sin avisar.

---

## 1. Estado real del gate (job `lint` del CI, 4 steps)

`.github/workflows/ci.yml` · el job `lint` es el primero y `build`, `integration-tests` y los
deploys declaran `needs: [lint, test]` → **si `lint` falla, no corre nada más**.

| # | Step | Estado hoy | Evidencia |
| --- | --- | --- | --- |
| 1 | `npm run lint` (eslint sobre 8 carpetas) | **No se puede ejecutar**: OOM, vuelca core | `timeout 600 npm run lint` → `dumped core`, heap 2 GB |
| 2 | `bash scripts/format-check-diff.sh` | **Resuelto** ✅ — valida solo el diff, no el árbol. Decisión de JC 2026-07-29 para no meter un commit bomba de 1.400 ficheros | el propio script documenta el porqué |
| 3 | `npm run type-check` (`tsc -p tsconfig.json`) | **No se puede ejecutar**: OOM a 3 GB tras 4 min 13 s | `NODE_OPTIONS=--max-old-space-size=3072 npm run type-check` → `FATAL ERROR: Ineffective mark-compacts near heap limit` |
| 4 | `bash scripts/any-ratchet.sh` | **Falla determinísticamente** | `any-ratchet: baseline=4048 actual=4259` → exit 1 |

Los otros jobs, para contexto: `test` (unit) pasa —**504/504 en 46 suites**—; `security-scan`
corre `npm audit --audit-level moderate` y Snyk; `integration-tests` levanta
`docker-compose.test.yml`. Ninguno se ejecuta mientras `lint` esté rojo.

### 1.1 El ratchet de `any` nació roto

No es que se hayan colado 211 `any`. Es que **el baseline y el script miden cosas distintas**:

| Medición en `9714a8c` (2026-07-17, fecha del baseline) | Valor |
| --- | --- |
| Ocurrencias — `grep -rEo … \| wc -l`, que es **lo que el script comprueba** | **4.193** |
| Líneas — `grep -rE … \| wc -l` (sin `-o`) | **4.059** |
| `BASELINE` escrito en el script | **4.048** |

El baseline se fijó contando **líneas** y el gate comprueba **ocurrencias**. Una línea con dos
`any` cuenta 1 vs 2. El gate por tanto **jamás pudo pasar, ni el día que se escribió**.

La deriva real desde entonces es pequeña: +66 ocurrencias (4.193 → 4.259) en dos semanas.
El refactor del wbot de hoy la redujo: en los ficheros tocados el conteo bajó de 127 a 123.

---

## 2. Ola 1 — Poner el gate en verde (sin tocar lógica)

**Objetivo**: que un rojo del CI signifique algo. Ninguna acción de esta ola modifica el
comportamiento del producto.

### A1 · Recalibrar `any-ratchet` con su propia unidad

- Medir con **el propio script**, nunca a mano: `bash scripts/any-ratchet.sh` imprime `actual=N`.
- Fijar `BASELINE=N` y anotar en el script la **unidad** (ocurrencias, con `-o`) y el comando
  exacto que la produce, para que la próxima recalibración no repita el error.
- Añadir al script un aviso cuando `CURRENT < BASELINE - 50`: es señal de que toca bajarlo, que
  es el trabajo que el trinquete existe para provocar.
- **No** intentar limpiar los 4.259 `any` ahora: es otro proyecto y el trinquete no lo exige.

*Aceptación*: `bash scripts/any-ratchet.sh` → exit 0.

### A2 · Dar memoria a `tsc` y `eslint` en CI

Los runners `ubuntu-latest` tienen 16 GB; el NAS no. El OOM local no implica OOM en CI, pero
**hoy nadie lo sabe** porque nunca se ha llegado a ejecutar el step con el pipeline en marcha.

- Añadir `NODE_OPTIONS: --max-old-space-size=6144` a los steps 1 y 3 del job `lint`.
- Ejecutar el pipeline una vez y **leer el resultado**: si `type-check` pasa, se cierra el frente
  y el proyecto tiene typecheck real. Si falla, el número de errores es el nuevo dato de partida
  y se decide entonces (allowlist o arreglo), no antes.

*Aceptación*: el job `lint` termina —verde o rojo— **con salida legible**, no con un core dump.

*Riesgo declarado*: es posible que `tsc` no quepa ni en 6 GB. En ese caso aplica A3.

### A3 · (Solo si A2 no basta) Trocear el typecheck — **BLOQUEADO, con prerrequisito medido**

La salida estándar sería **project references**: un `tsconfig` por área con `composite: true` y
un `tsconfig.solution.json` que las referencia. **No es aplicable hoy**: project references exige
un grafo **acíclico** entre proyectos, y hay 13 imports invertidos (medido 2026-07-31):

| Sentido invertido | Ficheros |
| --- | --- |
| `services` → `controllers` | 2 |
| `services` → `routes` | 1 |
| `helpers` \| `libs` \| `utils` → `services` | 10 |

Romper esos 13 es el prerrequisito. Hasta entonces, lo que sí existe es
**`scripts/type-check-area.sh`**: typecheck de un área o un fichero, con
`@types/**/*.d.ts` siempre en el `include` (§0) y detección del OOM por exit code —
un `grep -c "error TS"` sobre un tsc que murió devuelve 0 y se lee como "limpio".

```bash
bash scripts/type-check-area.sh services/WbotServices   # OK, 0 errores
bash scripts/type-check-area.sh models
```

*Aceptación (revisada)*: cada área tocada por un cambio typechequea limpia antes del commit.
El typecheck global queda en manos de A2.

### A4 · Dos imports muertos que ensuciaban el grafo

- `services/DriveBackupService.ts`: `import { google } from 'googleapis'` — símbolo sin usar
  (la carga real es el `await import()` de `getGoogle()`).
- `…/ActionsWebhookFacebookService.ts`: `import { fi } from "date-fns/locale"` — el locale finés,
  autoimport del IDE, sin un solo uso.

**Medición honesta**: quitar el primero **no reduce el grafo**. TypeScript resuelve
`await import('literal')` igual que un import estático, así que los 897 `.d.ts` de googleapis
siguen entrando (4.037 ficheros en el grafo de un controller, antes y después). Sacarlos de
verdad exige `@googleapis/drive` en lugar del paquete monolítico: cambio de dependencia, sin
tests que cubran el backup a Drive. **No se hace en esta ola.**

### A5 · Nota sobre por qué el OOM no se puede reproducir "bien" en el NAS

El NAS tenía en la medición **load 52 con 4 cores y 2 GB disponibles de 15**. Un `tsc` sobre un
único controller tardó 251 s. El OOM local es real pero **no es atribuible al proyecto**: es
memoria disponible, no tamaño del código. Cualquier conclusión sobre si `type-check` pasa o no
tiene que venir del runner de CI, no de aquí.

### Qué mueve esta ola

El pipeline vuelve a correr entero: `build`, `integration-tests` y `security-scan` llevan
semanas sin ejecutarse porque `lint` los bloquea. Es probable que al desbloquearlos aparezcan
fallos propios — eso es información nueva, no una regresión.

---

## 3. Ola 2 — Que el gate proteja algo

Con el CI en verde, el gate solo dice "compila y no empeora el tipado". Falta que diga
"no rompiste la conducta".

- **Ejecutar en CI los golden-master de BD que ya existen**: `handleMessage.dbtest.ts`
  (18 tests / 12 snapshots) y `verifyQueue.dbtest.ts`. Hoy solo corren a mano. El job
  `integration-tests` ya levanta `docker-compose.test.yml`, así que la infraestructura está.
- **Cobertura declarada, no perseguida**: 504 tests para 450 k líneas es ~1 por cada 890. Poner
  un objetivo global de cobertura sería teatro. Lo que sí cabe es un umbral **por carpeta tocada**
  en el diff, con el mismo criterio que `format-check-diff.sh`: el árbol converge según se toca.

*Aceptación*: un PR que cambie la conducta de `handleMessageInner` pone el CI rojo sin
intervención humana.

---

## 4. Ola 3 — Unificar los tres canales

**Éste es el trabajo caro, y va el último a propósito**: sin las olas 1 y 2 no hay forma de
saber si una unificación rompió algo.

### 4.1 La duplicación, medida

Mismo nombre, tres implementaciones, en `wbot*` / `metaMessageListener.ts` /
`facebookMessageListener.ts`:

| Función | wbot | meta | facebook | Observación |
| --- | --- | --- | --- | --- |
| `verifyQueue` | 352 L | 72 L | 134 L | ×4,9 entre la mayor y la menor |
| `flowbuilderIntegration` | 197 L | 91 L | 93 L | |
| `flowBuilderQueue` | 60 L | 41 L | 58 L | |
| `verifyQuotedMessage` | 16 L | 16 L | 16 L | las tres iguales |
| `verifyContact` | 65 L | (propia) | 43 L | |

### 4.2 El hallazgo que cambia el enfoque

**No son copias: han divergido.** `verifyQueue` mide 352 L en wbot y 72 en meta. Unificar no es
borrar dos de tres — es **reconciliar tres conductas distintas** y decidir, para cada diferencia,
si es una necesidad del canal o un arreglo que nunca se propagó.

Y hay una asimetría decisiva: el wbot tiene golden-master; **meta y facebook no tienen ninguno**.
Unificar hoy significaría mover código de dos canales que nadie sabe describir.

### 4.3 Secuencia obligada

1. **Golden-master para `metaMessageListener` y `facebookMessageListener`**, calcados del que ya
   funciona: harness contra `chateam_test` + `snapshotState()` proyectando contacts/tickets/
   messages sin ids ni fechas. Es el mismo trabajo que ya se hizo una vez, con plantilla.
2. **Diff de conductas**, función a función, con los tres golden-masters puestos: dónde difieren
   y por qué. Sale una tabla de decisiones, no un merge.
3. **Extraer solo lo idéntico** primero (`verifyQuotedMessage`, las tres iguales) a un módulo
   compartido. Gate: los tres golden-masters sin reescribir snapshots.
4. **Después** lo divergente, una función por lote, con la decisión de conducta explícita en el
   commit.

*Aceptación por lote*: los tres golden-masters pasan sin que se reescriba ningún snapshot.

*Herramienta*: `tests/harness/wbotTopLevelDeps.cjs` mide el contrato de un grupo de funciones
top-level y, sobre todo, **cuántos usos le quedan a cada dependencia fuera del bloque** — el
número que decide si se mueve con él o crea un ciclo. Iterarlo hasta punto fijo es lo que
dimensiona un lote. Los 7 lotes del wbot (6.888 → 1.791 L, −74 %) se hicieron así.

---

## 5. Lo que este plan NO hace, y por qué

| No se hace | Motivo |
| --- | --- |
| `prettier --write` sobre el árbol | 1.400 ficheros arrasan `git blame`. Ya decidido: converge por diff |
| Limpiar los 4.259 `any` | El trinquete solo exige no empeorar. Limpiarlos es un proyecto propio |
| Objetivo global de cobertura | Con 1 test por 890 líneas, un número global es teatro. Umbral por diff |
| Reescribir los tres listeners de cero | Sin golden-masters de meta/facebook es adivinar |
| Borrar el dead code comentado (~284 líneas en el wbot) | Es borrar, no mover: decisión del dueño del repo, no del refactor |

---

## 6. Orden y dependencias

```
A1 (ratchet)  ─┐
A2 (memoria)  ─┼─→ CI verde ──→ Ola 2 (golden-master en CI) ──→ Ola 3 (unificar canales)
A3 (si hace falta) ┘                                                    ↑
                                                    prerrequisito: GM de meta y facebook
```

A1 y A2 son independientes entre sí y no tocan lógica. La Ola 3 no debe empezarse antes de la
Ola 2: es exactamente el error que este plan intenta no repetir.
