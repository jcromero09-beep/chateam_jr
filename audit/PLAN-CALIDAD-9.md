# Plan integral: de 7.8 a 9–10

> Escrito 2026-07-29. Parte de una **corrección de premisa** que cambia el orden de todo
> lo demás: ver la sección 0 antes que nada.

## 0. Corrección de partida — sí hay algo desplegado

Las dos jornadas anteriores trabajaron sobre la premisa "nada está desplegado, todo es
potencial". **Es falsa**, y el error fue mío: miré `docker ps | grep chateam`, vi solo
`chateam-redis` y `chateam-postgres`, y concluí que el backend no corría.

El backend corre **bajo PM2, no bajo Docker**:

```
chateam-node    online   cwd=/home/jcromero09/chateam_jr   server-distributed.ts (tsx)
chateam-worker  online   cwd=/home/jcromero09/chateam_jr
```

De ahí se derivan tres hechos que reordenan el plan entero:

**(a) El proceso carga desde ESTE árbol de trabajo.** No hay artefacto de build, ni
checkout separado, ni staging. El directorio que se edita ES el que corre. "Desplegar"
es `pm2 restart chateam-node`. La distancia entre un commit y producción es **un
comando**, no un pipeline.

**(b) El código de la jornada del 28 YA ESTÁ VIVO.** El banner de arranque lo prueba:

```
[28-07-2026 22:07:39] [tenantScope] modo=enforce · api=observe · 164 modelos …
```

Ese `api=observe` solo existe desde el commit `fab3aab`. O sea: la autenticación de
webhooks y la superficie `api` del guard llevan **~22 h en producción**. El riesgo de
deploy que el handoff marcaba como bloqueante ya se absorbió sin incidente.

**(c) Ya hay ventana de observación, y salió limpia.** En esas ~22 h:

```
grep -c "would inject companyId"  →  0
```

Cero. Ninguna query de la superficie `api` llegó sin filtro de tenant. Eso no es
ausencia de datos: es un resultado. Lo que NO prueba es que haya habido tráfico por esa
superficie — no hay log de acceso HTTP, así que "cero hallazgos" puede ser "cero
tráfico". **Distinguir las dos cosas es el paso 1 del plan**, y es barato.

### Lo que esta corrección le hace a la nota

Sube el techo de un eje y baja otro:

- **Ops estaba sobrevalorado en un aspecto y subvalorado en otro.** Subvalorado: hay
  supervisión real (PM2 con dump que sí incluye chateam, a diferencia del incidente de
  LICISOFT). Sobrevalorado: **no existe frontera de despliegue**. Un editor abierto en
  este directorio es acceso de escritura a producción. Eso no es un 5, es peor, y es el
  hallazgo estructural más serio de estas tres jornadas.
- **Todo lo demás sube de techo**, porque "verificar contra la realidad" pasa de ser un
  bloqueo indefinido a un `pm2 restart` más una ventana de observación.

---

## 1. Dónde está el techo real de cada eje

| Eje | Hoy | Meta | Qué lo tapa HOY (no lo que falta construir) |
|---|---|---|---|
| Seguridad transversal | 7.5 | 9 | Firma de Meta correcta **por construcción**, no por observación. Tokens globales compartidos sin abordar. (MercadoPago retirado: ya no cuenta.) |
| Aislamiento multi-tenant | 8.5 | 9.5 | G1 en `observe`. Todo el análisis es **estático**: no existe una prueba que intente cruzar tenants y falle. |
| Deuda técnica | 6.5 | 9 | El monolito sigue en 6.862 L (las extracciones viven dentro). CI nunca ha estado verde. |
| Realidad | 8.5 | 9.5 | Divergencias doc↔código conocidas y sin cerrar; bugs vivos en logs que nadie mira. |
| Dinero | 7.5 | 9 | Auditado 29-07: el camino de créditos SÍ acredita y SÍ es idempotente (lock + transacción). Lo que falta es la race del camino de facturas, la conciliación, y una pila de billing sin cablear. |
| Ops | 5 | 9 | **Sin frontera de despliegue.** Alertas que nadie recibe. (Los 174 reinicios: explicados — son consecuencia de lo primero, no inestabilidad.) |

El patrón: **casi ningún eje está limitado por código que falte escribir.** Están
limitados por verificación ausente y por operación. Un plan que solo añada features no
mueve la nota.

---

## 2. Vía OPS — la que más pesa (5 → 9)

Es el eje más bajo y el que habilita a los demás. Va primero.

### O1. Crear una frontera de despliegue *(crítico)*
Hoy editar un `.ts` y reiniciar es desplegar. No hay rollback que no sea `git`, ni forma
de probar antes, ni protección contra un guardado accidental.

Mínimo viable, en orden de coste creciente:
1. **Checkout separado para producción** (`/opt/chateam`) + PM2 apuntando ahí. El árbol
   de desarrollo deja de ser producción. Coste: bajo. Impacto: máximo.
   **Decidido por JC (2026-07-29). Runbook completo, con rollback y la trampa de la
   sesión de Baileys: [`RUNBOOK-frontera-produccion.md`](RUNBOOK-frontera-produccion.md).**
   Lo ejecuta JC en ventana: implica reiniciar sesiones vivas de Baileys.
2. **Deploy = `git pull` + `pm2 reload`** en ese checkout, con el commit fijado por tag.
3. Staging con la `docker-compose.staging.yml` que ya existe sin usar.

**Verificación:** `pm2 jlist` muestra un `cwd` distinto del árbol de desarrollo, y editar
un fichero en desarrollo no cambia el comportamiento de producción.

### O2. ✅ CONTESTADO — los 174 reinicios no son inestabilidad
179 arranques, **128 precedidos de parada limpia**, **0 uncaughtException**, **0 OOM**.
Por día: 1 en los días tranquilos, 8–15 el 26/27/28 de julio — los días de trabajo
intensivo. **Son O1 manifestándose**: como el árbol de desarrollo es producción, cada
cambio necesita un `pm2 restart`, y cada reinicio tira las sesiones de Baileys.
Arreglar O1 elimina esta clase de reinicio. Detalle en
[`TRIAJE-LOGS-2026-07-30.md`](TRIAJE-LOGS-2026-07-30.md).

**Verificación:** una causa documentada por cada pico de reinicios en `pm2 logs`.

### O3. Alertas que alguien reciba
Existen `monitoring/alerts.yml`, `alertmanager.yml`, `prometheus/` y una carpeta
`grafana/` — **sin evidencia de que estén corriendo ni de que alguien reciba nada**. El
log muestra `WhatsApp ID 44 tiene status "qrcode"` en bucle: un canal caído que nadie
sabe que está caído.

Mínimo: conexión WhatsApp caída, worker parado, cola Bull atascada, disco. A un canal
que se lea (el propio WhatsApp sirve).

**Verificación:** tirar una conexión a propósito y recibir el aviso.

### O4. Backups probados
Hay `scripts/backup.sh` y `recovery.sh`. Un backup no probado no es un backup.

**Verificación:** restaurar en `chateam_test` y arrancar contra esa copia.

### O5. CI verde *(ver también D4)*
Mientras el pipeline esté rojo en el primer job, no hay puerta.

---

## 3. Vía AISLAMIENTO (8.5 → 9.5)

### A1. Cerrar G1 — y ya casi está
El paso a `enforce` estaba "bloqueado por falta de datos" y resulta que hay 22 h de
datos limpios. Falta poco:

1. **Saber si hubo tráfico por la superficie `api`.** Contar tokens de conexión activos
   (`Whatsapps.token`) y añadir un contador de requests en `tokenAuth` — sin él,
   "0 hallazgos" es ambiguo.
2. Reiniciar con el **inventario agrupado** de hoy (que sí trae la ruta) y dejar una
   ventana con un pico de día laborable.
3. Si el inventario sigue vacío o solo trae rutas que deben estar acotadas →
   `TENANT_SCOPE_GUARD_API=enforce`.

**Verificación:** el banner de arranque dice `api=enforce` y el inventario queda vacío
durante 48 h.

### A2. Hacer `companyId` obligatorio en los 2 services scopeados
Hoy es opcional: un llamador nuevo puede omitirlo y nadie lo nota. Pasar a obligatorio
convierte un default seguro en una imposibilidad estructural. Son 4 call sites.

### A3. La prueba que falta: una suite cross-tenant *(lo que vale el medio punto)*
Todo el aislamiento está sostenido por **análisis estático**. Eso demuestra que hoy no
hay instancia explotable; no demuestra que el guard funcione.

Suite nueva sobre `chateam_test`: sembrar **dos** empresas, y desde el token de la A
intentar leer/actualizar cada recurso de la B — ticket, contacto, mensaje, cola, tag,
conexión, factura. Aserción: 404 o vacío, nunca datos de B.

Ese es el test que convierte "creemos que aísla" en "aísla". Y es el que atrapará la
regresión el día que alguien añada un endpoint sin pensar.

**Verificación:** la suite en verde, y en rojo si se pone `TENANT_SCOPE_GUARD=off`
(si no enrojece, no está probando nada).

### A4. Ratchet para lo que el guard no puede cubrir
Sequelize no expone hook para `increment`/`decrement`/`aggregate`. No hay arreglo
estructural, pero sí una regla de lint: prohibir esas llamadas sobre modelos con
`companyId` salvo que el `where` lo incluya. Encaja con `scripts/any-ratchet.sh`.

---

## 4. Vía SEGURIDAD (7.5 → 9)

### S1. Validar la firma de Meta contra tráfico real
Está viva desde hace 22 h. Falta **mirar los verdicts**: cuántos webhooks entraron,
cuántos pasaron la firma, cuántos se rechazaron. Si el número de rechazos no es cero, la
ingesta está rota en silencio y nadie se ha enterado — que es exactamente el modo de
fallo que el handoff advertía.

**Verificación:** un contador de `accepted`/`rejected` por proveedor en el log de
arranque diario, y `rejected == 0` con tráfico > 0.

### S2. ~~Manifiesto de MercadoPago~~ — RETIRADO
MercadoPago no es una vía real (decisión de JC). Rutas desmontadas el 29-07. El riesgo
del manifiesto sin verificar queda anotado **dentro del comentario del mount**, para
quien algún día lo reactive.

### S3. Los tokens globales compartidos — el hueco no abordado
`isAuthCompany` y `envTokenAuth` autentican con `COMPANY_TOKEN` y `ENV_TOKEN`: tokens
**globales**, sin identidad de empresa. Quedaron fuera de G1 a propósito porque el guard
de tenant no aplica, pero **el riesgo sigue ahí**: un token global que da acceso al CRUD
de planes. Es de otra familia y necesita su propio diseño (token por empresa, o scopes,
o retirar los endpoints).

### S4. Lista blanca de IPs
Defensa en profundidad para Meta y CoinGate. Con el sistema ya observable (S1), meterla
deja de ser a ciegas: se puede arrancar en modo `observe` igual que el guard de tenant.

### S5. Rate limiting en las superficies públicas
Hay infraestructura (`req.rateLimit` está en los tipos). Verificar que aplica a
`/api/send` y a los webhooks.

---

## 5. Vía DEUDA TÉCNICA (6.5 → 9) — la más cara

### D1. Terminar `handleMessageInner` (503 L)
Lo que queda **no es verbatim**: los dos bloques de fuera-de-expediente duplican
`dataLimite`/`Agora`, el segundo reasigna el `currentSchedule` del primero, y ya
divergieron. Orden: unificar EN SITIO con test de las dos ramas → extraer.

### D2. Sacar las extracciones a módulos
Las 7 funciones extraídas **viven en el mismo fichero**: el monolito bajó de 7.279 a
6.862 L, un 6 %, mientras la función bajaba un 60 %. La descomposición está hecha; el
split no. Destino: `wbotMessageIngest.ts` y hermanos, con la fachada de re-export
(Regla #0 del plan de refactor) para no migrar 16 importadores.

### D3. `verifyQueue` a módulo
Ya está descompuesto en `botText`/`botList`/`botButton` + dispatcher. Falta moverlo:
~1.900 L de las 6.862.

### D4. CI verde — y la decisión de prettier
1. **`format:check` sobre 1.400 ficheros no es una tarea, es una decisión.** Un `--write`
   masivo arrasa el `git blame` del repo entero. Recomendación: cambiar el paso de CI a
   **los ficheros del diff**, y formatear al tocar. Coste casi nulo, y el árbol converge
   solo.
2. **eslint OOM**: correr por directorios, o subir heap en CI (el runner tiene más RAM
   que este NAS).
3. **`tsc` completo OOM**: la salida real son **project references** o `incremental`.
   Mientras tanto `scripts/tsc-check.sh` cubre el día a día pero no da puerta de CI.

### D5. Envelope de API
6 de ~231 rutas registradas (la cifra de ~891 que circulaba mezcla handlers con rutas).
No es urgente; es consistencia. Hacerlo por módulo, no de golpe.

### D6. Cobertura
475 tests unitarios + 22 de DB para un sistema de este tamaño es fino. El objetivo no es
un porcentaje: es **cubrir los caminos de dinero y de aislamiento**, que son los que
duelen. La suite cross-tenant (A3) es parte de esto.

---

## 6. Vía REALIDAD (8.5 → 9.5)

### R1. Cerrar las divergencias ya documentadas
- **Guard de grupo en vacaciones colectivas: nunca se aplica.**
  `!isNil(whatsapp.collectiveVacationMessage && !isGroup)` — el `&&` cae dentro del
  `isNil`, así que evalúa `isNil(<boolean>)`, siempre `false`. Corregirlo **cambia
  comportamiento**: decisión de producto, no de refactor.
- **`getTypeMessage`** no lo exporta el monolito pero `libs/wbot.ts:419/431` lo importa
  y lo llama → `undefined` si esa ruta se alcanza.
- **`companyId` opcional** en los 2 services scopeados (ver A2).

### R2. Bugs vivos en los logs que nadie lee
Ejemplo encontrado hoy en 5 minutos de `pm2 logs`:

```
… ORDER BY "Ticket"."updatedAt" DESC LIMIT 20 OFFSET NaN;
```

Un `OFFSET NaN` en la query de listado de tickets. Hay más. **Una pasada de triaje sobre
`chateam-node-error.log` es de las cosas más rentables del plan**, y no requiere
desplegar nada.

### R3. Auditoría doc↔código
El repo tiene 145 `.md` en `docs/`, varios stale. La lección de las "37 errores de tsc"
aplica igual a la documentación: **una cifra escrita no es una medición**.

---

## 7. Vía DINERO (7.5 → 9) — reescrita tras la auditoría

> Las vías reales son **PayPal y Stripe** (decisión de JC, 2026-07-29). CoinGate y
> MercadoPago quedan fuera. Esta sección se reescribió entera después de auditar
> Stripe: el estado es **bastante mejor** de lo que suponía la primera versión.

### Lo que ya está bien (auditado, no supuesto)

- **Un solo webhook de Stripe vivo**: `POST /subscription/stripewebhook`. Valida HMAC
  **fail-closed en las cuatro rutas de fallo** (sin secret, sin clave, sin cabecera de
  firma, firma inválida → 400, nunca procesa). Soporta varios signing secrets separados
  por coma, o sea rotación sin corte. El raw body está bien cableado en `app.ts` (parser
  `raw` antes del JSON global **y** `/stripewebhook` en `RAW_BODY_PATHS`).
- **La acreditación de créditos SÍ es idempotente, y bien**: `processSubplanPurchase`
  abre transacción, hace `SELECT … FOR UPDATE` sobre la company —lo que serializa dos
  confirmaciones del mismo pago en paralelo— y comprueba `AiTokenTransaction` por
  `stripeSessionId`/`stripeSubscriptionId` antes de sumar.
- **PayPal y Stripe ya comparten ese mecanismo.** La primera versión de este plan decía
  "PayPal tiene su propio patrón, hay que unificarlos": **era incorrecto**. Los dos
  desembocan en `processSubplanPurchase`.

### Lo que falta

**M1. La race del camino de facturas.** El path de planes/invoices desduplica por
estado (`if (invoice.status === "paid") return`), que es *read-then-write* sin lock —
a diferencia del de créditos. Dos reintentos concurrentes de Stripe pueden leer los dos
"no pagada". Ventana estrecha, consecuencia cara. Se cierra con el mismo patrón que ya
usa el camino de créditos, o con una constraint única.

**M2. Pila de billing: NUNCA ha funcionado. No montar.** *(auditado a fondo 2026-07-30)*

JC decidió "cablearla y auditarla". **La auditoría revirtió la premisa**: no es código
que funcione y esté desmontado, es una implementación paralela escrita contra un
esquema que nunca se creó.

| | |
|---|---|
| `models/Invoice.ts` → tabla `invoices` (minúscula) | **no existe en la BD** |
| ese modelo en `sequelize.addModels()` | **no está registrado** |
| `subscriptions`, `payment_methods`, `usage_records`, `billing_events` | **no existen** |

Postgres distingue mayúsculas en identificadores citados: la tabla real es `"Invoices"`
y la usa `models/Invoices.ts`, otro modelo distinto. `StripeService` llama a
`Invoice.upsert()` sobre un modelo sin inicializar contra una tabla ausente.

Y si se montara, chocaría con el webhook vivo: los dos manejan
`invoice.payment_succeeded`, los dos provisionan créditos IA, y **desduplican contra
tablas distintas** — la idempotencia de uno no protege al otro. Hoy no se manifiesta
solo porque este lado revienta antes de acreditar; depender de que un bug tape a otro
no es una salvaguarda. Además `handleWebhook` pasa el body ya parseado a
`constructEvent` y la ruta no está en `RAW_BODY_PATHS`: rechazaría el 100% del tráfico.

**Dos correcciones a lo que yo mismo escribí antes:** (a) su `processWebhook` SÍ valida
firma (`stripe.webhooks.constructEvent`) — lo dije al revés; (b) lo que lo invalida es
el esquema inexistente, no la firma.

Queda un aviso bloqueante en la cabecera de `routes/billingRoutes.ts`, porque el riesgo
real es que *parece* montable.

**Lo que sí vale la pena rescatar:** el webhook vivo NO maneja
`customer.subscription.created/updated/deleted` ni `charge.dispute.created`. Esos
huecos son reales. La forma correcta de cerrarlos es **portar esos handlers al webhook
vivo**, contra la tabla `"Invoices"` real — no montar un endpoint rival.

**M3. Sin conciliación.** No hay job que compare lo que el proveedor dice que cobró
contra lo acreditado. Un webhook perdido es dinero perdido en silencio. Es el requisito
que sigue al de idempotencia, igual que la idempotencia lo era antes de acreditar.

**M4. Rieles retirados.** CoinGate y MercadoPago desmontados el 2026-07-29 (código en el
repo, cableado comentado). La idempotencia que se construyó para ellos vive en
`helpers/paymentWebhookIdempotency` y es agnóstica de proveedor: **es la pieza que
resuelve M1** si se decide llevar el camino de facturas al ledger.

## 8. Orden de ejecución

La regla: **primero lo que hace observable el sistema, después lo que lo mejora.** No
tiene sentido optimizar lo que no se puede medir.

**Fase 1 — Ver (días, coste bajo, sin desplegar nada nuevo)**
`S2` webhook de prueba MercadoPago · `S1` contar verdicts de firma · `R2` triaje de
`error.log` · `A1.1` saber si hay tráfico por la superficie `api` · `O2` explicar los
reinicios.
→ *Al final de esta fase se sabe qué está roto de verdad. Puede reordenar el resto.*

**Fase 2 — Frontera y puerta (la que desbloquea todo lo demás)**
`O1` checkout de producción separado · `O3` alertas que alguien reciba · `D4` CI verde
(empezando por la decisión de prettier).
→ *A partir de aquí, un cambio se puede desplegar y revertir sin miedo.*

**Fase 3 — Cerrar el aislamiento**
`A1` enforce · `A2` `companyId` obligatorio · `A3` **suite cross-tenant** · `A4` ratchet.
→ *Aislamiento a 9.5. La suite A3 es la pieza que convierte análisis en prueba.*

**Fase 4 — Dinero y realidad**
`M1` acreditación · `M3` conciliación · `M2` unificar PayPal · `R1` divergencias.

**Fase 5 — Deuda estructural (la larga)**
`D2`/`D3` split real del monolito · `D1` fuera-de-expediente · `D6` cobertura · `D5`
envelope · `S3` tokens globales.

---

## 9. Qué NO llega a 10, y por qué

Conviene decirlo ahora y no descubrirlo en la fase 5.

- **10 en seguridad exige un tercero.** Auditoría o pentest externo. Lo que se haga desde
  dentro llega a 9; el punto que falta es precisamente el que no se puede autoconceder.
- **10 en ops exige redundancia**, y el sistema vive en un NAS de 4 núcleos y 15 GB que
  ya se satura y se reinicia solo. Sin un segundo nodo, hay un techo físico.
- **10 en deuda técnica exige que el monolito deje de serlo.** 6.862 L → módulos de
  verdad es trabajo de meses, no de olas.
- **9 sí es alcanzable en los seis ejes**, y las fases 1–3 se llevan la mayor parte del
  camino con el menor coste.

La forma más rápida de mover la nota hoy no es escribir código: es **ejecutar la fase 1**,
que son horas y no requiere desplegar nada.
