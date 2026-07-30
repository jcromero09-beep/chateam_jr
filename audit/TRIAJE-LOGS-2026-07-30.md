# Triaje de logs de producción — 2026-07-30

Fuente: `~/.pm2/logs/chateam-node-out.log` (74 MB, ventana 17-07 → 30-07).

> ⚠️ **`chateam-node-error.log` está congelado desde el 16 de julio.** El logger
> escribe a stdout, así que los errores reales viven en `out.log` mezclados con los
> INFO. Quien busque errores en el fichero que se llama "error" no encuentra nada y
> concluye que no los hay.

## Lo primero: el log mezcla lo vivo con lo ya arreglado

~500 líneas ERROR **por día**, constante en las dos semanas. Pero un conteo sobre
todo el fichero engaña: los tres errores más llamativos del total
—`WHERE parameter "companyId" has invalid "undefined" value` (38),
`column "undefined" does not exist` (87), `OFFSET NaN` (24)— **no aparecen en los
últimos 3 días**. Están arreglados.

Uno de ellos se pudo confirmar hasta el commit: el `companyId undefined` salía de
`CampaignController.findList`, y ese código ya lleva el comentario
`[Seguridad C-1/S]` de una sesión anterior que lo corrigió (leía `req.query` en vez
de `req.user` — era además un IDOR).

**Un triaje sin ventana temporal produce trabajo falso.** Todo lo de abajo está
acotado a 28–30 de julio.

## Inventario vivo (28–30 julio)

| Nº | Patrón | Vol. | Qué es |
|---|---|---|---|
| 1 | `DeprecationWarning: promisify on a function that returns a Promise` | **1.088** | Ruido. Ahoga todo lo demás. |
| 2 | Meta `(#200) Ad account owner has NOT grant ads_management` (company 9) | ~190 | Permiso no concedido por el cliente. **Reintenta en bucle.** |
| 3 | `[Watchdog] No alive nodes available for reassignment!` | 29 | Operativo. |
| 4 | `operator does not exist: character varying = boolean` | 9 | **Bug real. ARREGLADO abajo.** |
| 5 | `[unhandledRejection] Operation timeout` | 3 | Rechazos sin manejar. |
| 6 | `[coex.error]` | 4 | A revisar. |

## ✅ ARREGLADO — tres cron jobs caídos cada noche (nº 4)

`handleCompanyExpirationAlert`, `[stats.nightly]` y `[calendar]` hacían:

```ts
Company.findAll({ where: { status: true } as any })
```

Postgres lo rechaza: `operator does not exist: character varying = boolean`. Y como
la query lanza, **no fallaba una empresa: fallaba el job entero**. Llevaban así al
menos las dos semanas que cubre el log.

### La causa es drift entre el modelo y el esquema

```
models/Company.ts:56   @Column(DataType.BOOLEAN)  status: boolean;
Postgres  Companies.status →  character varying
```

El call site no estaba mal: era coherente con lo que el modelo declara. **El modelo
es el que miente.** En dos de los tres sitios había además un `as any`, que es justo
lo que impidió que TypeScript avisara.

### Y los datos tienen dos convenciones

```
status = 'true'    16 filas
status = 'active'    1 fila
```

El arreglo acepta las dos (`Op.in`) a propósito: el objetivo era devolver la vida a
los jobs, no decidir cuál convención es la buena. Verificado contra la BD real: el
predicado nuevo devuelve las 17 empresas.

### ⚠️ Lo que este arreglo NO cierra

`company.status` sigue tipado como `boolean` en todo el código mientras la columna
es texto. Consecuencia: **`if (company.status)` es truthy incluso si el valor fuera
la cadena `"false"`.** Hoy no hay ninguna fila con ese valor, así que no se
manifiesta — pero es un fallo esperando a que alguien escriba `"false"`.

Arreglarlo de verdad son dos pasos que necesitan decisión: normalizar los datos a
una sola convención, y corregir el tipo del modelo. Eso toca todo lo que lee
`company.status`, así que es un cambio aparte.

Los otros cuatro modelos con `status` (`Whatsapps`, `Tickets`, `Invoices`,
`Campaigns`) también tienen la columna `character varying`; ahí no hubo drift
porque el código ya los trata como texto.

## Pendientes del triaje, por valor

**A. Los 1.088 DeprecationWarnings (nº 1).** No son un bug, son un problema de
señal: con ese volumen, los 9 errores reales de arriba son el 0,8 % de las líneas.
Localizar el `promisify` sobre una función que ya devuelve Promise y quitarlo hace
legible el resto.

**B. El bucle de reintentos de Meta (nº 2).** El permiso de company 9 no se va a
conceder solo. Un error permanente que se reintenta indefinidamente son ~190
líneas/día y llamadas a la API de Meta que cuentan para el rate limit — de hecho ahí
está también el `Application request limit reached`. Necesita backoff, o marcar la
cuenta y dejar de intentar hasta que alguien la reactive.

**C. `[unhandledRejection]` (nº 5).** Son las candidatas número uno a explicar los
174 reinicios de `chateam-node` — un rechazo sin manejar puede tumbar el proceso.
Conectar este punto con O2 del plan.

**D. `[Watchdog] No alive nodes available for reassignment!` (nº 3).** 29 veces en
3 días. O la topología multi-nodo no está bien configurada, o el watchdog no ve a
sus pares. Ninguna de las dos es buena.
