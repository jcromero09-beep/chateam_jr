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

## ✅ De paso: fuga parcial de tokens en 5 sitios

Mirando el contexto del aviso apareció esto, en cada operación de Meta:

```
[MetaMarketing] 📋 facebookSystemUserToken: SET (EAAM2fltLUkoBQzZBgki...2PZAzQZDZD)
```

**30 caracteres del token de sistema en claro** — 20 del principio y 10 del final —
en un log de 74 MB con permisos `rwxrwxrwx` que nadie rota. El patrón
`token.substring(0, 20) + "..."` estaba repetido en **5 ficheros** (MetaMarketing,
Telegram, SyncDatasets, metaManualConnect, metaSend).

Es tentador porque parece prudente, pero no lo es: 30 caracteres no permiten
reconstruir el token, pero son más de lo necesario para nada. Lo que se quería
saber en el log es "¿está puesto?" y "¿sigue siendo el mismo?", y para eso basta
una huella no reversible: `utils/tokenFingerprint` →
`SET (len=211, sha256:9f2a1c4b7e08)`.

La longitud se conserva porque distingue un token real de uno truncado o de
relleno, que es un fallo de configuración habitual.

## Pendientes del triaje, por valor

**A. ✅ HECHO — Los 1.088 DeprecationWarnings (nº 1).**

No era un bug de código: era **de clasificación**. El handler por defecto de Node
para el evento `warning` escribe con `console.error`, y `utils/consoleToLogger`
enruta `console.error` a `logger.error` —con buen motivo, para unificar formato y
sanitizar secretos—. Efecto no buscado: **todo aviso del runtime se contaba como
error**, y los 9 errores reales quedaban en el 0,8 % de las líneas.

`utils/processWarnings.ts` desengancha el handler por defecto, loguea a `warn` y
**deduplica**: la primera aparición de cada `(name, code, message)` con su traza —
que es lo único que sirve para localizar el origen— y a partir de ahí solo cuenta,
con resumen periódico. Mismo criterio que el inventario de `tenantScope` y el
contador de `tokenAuth`.

Nota: **no se localizó el `promisify` culpable.** No salta al importar el grafo de
Meta, solo en llamada, así que está en una dependencia y hace falta una llamada
real a Meta con `--trace-deprecation` para pinpointearlo. Da igual para el problema
de señal —el aviso ahora sale una vez con su traza—, pero queda sin cerrar.

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
