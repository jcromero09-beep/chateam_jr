# Spec de Módulo — Tomacorrientes inteligentes WiFi (Smart Plugs) · chateam_jr

> Grupo: IoT. Módulo nuevo (2026-09-07), rama `claude/smart-plug-wifi-integration-pzyrvd`.
> Base URL producción: `https://padeldev.codigo.plus/be`.
> Estado de realidad: **PARCIAL** — el código existe y las rutas están montadas, pero
> nada fue ejecutado contra hardware real ni contra la BD (ver §Pendiente de verificación).

## Propósito

Permitir que una company registre y opere tomacorrientes inteligentes WiFi TP-Link Tapo
(P100/P105/P110/P115) desde la plataforma: encender, apagar, alternar, consultar el estado
real y leer el consumo eléctrico en los modelos que lo miden.

El caso de uso que motiva el módulo es operar una toma desde una conversación de WhatsApp
(por ejemplo, encender un equipo a pedido del cliente sin intervención humana).

## Alcance del "se configura en red WiFi"

**El pareo WiFi NO lo hace la plataforma.** La toma se da de alta en la red del cliente con
la app Tapo (SmartConfig / modo AP), que es el único camino soportado por el fabricante en
firmware de fábrica. Lo que este módulo registra es el resultado de ese pareo: la dirección
de la toma en la LAN más la credencial de la cuenta Tapo con la que se abre la sesión local.

Consecuencia de arquitectura, y es la limitación más importante del módulo:

> La toma vive en la LAN del cliente, no en la del servidor. `POST /smart-plugs` sólo
> funciona si el backend puede alcanzar esa IP. Para clientes remotos hace falta un agente
> en sitio o una VPN; el servidor central **no** llega a una IP privada ajena.

## Actores y capacidades

- **El usuario puede** registrar una toma ya pareada (`POST /smart-plugs`), listar las de su
  company (`GET /smart-plugs`), ver el registro guardado (`GET /smart-plugs/:id`),
  actualizarlo (`PUT /smart-plugs/:id`) y eliminarlo (`DELETE /smart-plugs/:id`).
- **El usuario puede** consultar el estado **real** del dispositivo (`GET /smart-plugs/:id/state`),
  que además persiste lo leído.
- **El usuario puede** encender, apagar o alternar la toma (`POST /smart-plugs/:id/command`).
- **El sistema** guarda la contraseña Tapo cifrada en reposo (AES-256-GCM) y nunca la
  devuelve en ninguna respuesta HTTP.

## Rutas/Controladores (evidencia) y modelo de datos

Router: `routes/smartPlugRoutes.ts` (plano, montado en `routes/index.ts:492`).
Middleware `isAuth` en todas: el alcance es siempre la company del token.

| Método/Ruta | Router:línea | Controlador:línea |
|---|---|---|
| `POST /smart-plugs` | `smartPlugRoutes.ts:22` | `SmartPlugController.ts:58` (`store`) |
| `GET /smart-plugs` | `smartPlugRoutes.ts:24` | `SmartPlugController.ts:87` (`index`) |
| `GET /smart-plugs/:id/state` | `smartPlugRoutes.ts:27` | `SmartPlugController.ts:135` (`state`) |
| `POST /smart-plugs/:id/command` | `smartPlugRoutes.ts:29` | `SmartPlugController.ts:163` (`command`) |
| `GET /smart-plugs/:id` | `smartPlugRoutes.ts:31` | `SmartPlugController.ts:120` (`show`) |
| `PUT /smart-plugs/:id` | `smartPlugRoutes.ts:33` | `SmartPlugController.ts:193` (`update`) |
| `DELETE /smart-plugs/:id` | `smartPlugRoutes.ts:35` | `SmartPlugController.ts:223` (`remove`) |

**Tabla**: `SmartPlugs` (**0 filas — la migración todavía no se ejecutó**).
Migración: `database/migrations/20260907000001-create-smart-plugs.ts`.
Modelo: `models/SmartPlug.ts` (registrado en `database/index.ts:216,476`).
Servicios: `services/SmartPlugServices/` — `TapoDriver`, `RegisterSmartPlugService`,
`ListSmartPlugsService`, `ShowSmartPlugService`, `UpdateSmartPlugService`,
`DeleteSmartPlugService`, `SmartPlugStateService`, `SmartPlugCommandService`,
`smartPlugUtils`.

Dependencia nueva: `tp-link-tapo-connect@^2.0.15` (`package.json:135`).

## Decisiones de diseño

1. **`relayOn` en BD es caché, no verdad.** Alguien puede apretar el botón físico o usar la
   app Tapo sin que el backend se entere. `GET /:id` devuelve el último valor conocido;
   `GET /:id/state` consulta el dispositivo.
2. **Todo comando se confirma releyendo el estado.** `turnOn()` resuelve cuando la toma
   acepta el comando, no cuando el relé conmuta. Si el estado leído después no coincide con
   el deseado, se responde `502 ERR_SMART_PLUG_COMMAND_NOT_APPLIED` en vez de mentir. Esto
   importa porque el consumidor previsto es el bot de WhatsApp, donde una respuesta falsa se
   le muestra a un humano.
3. **Sesiones cacheadas 10 min con un reintento.** El handshake KLAP es caro. Si la operación
   falla con sesión cacheada se reintenta una vez con sesión nueva, porque un token expirado
   es indistinguible de un error de red hasta que se reintenta.
4. **Timeout de 8 s en toda operación.** Una IP muerta en la LAN cuelga el socket sin
   devolver nunca; sin timeout el request de Express queda colgado.
5. **Carga diferida del paquete.** `tp-link-tapo-connect` se resuelve la primera vez que se
   opera una toma, no al levantar el proceso. Si la dependencia falta, el backend arranca
   igual y sólo estos endpoints responden `503 ERR_SMART_PLUG_DRIVER_UNAVAILABLE`.
6. **Sin medición no es falla.** Los P100/P105 no miden consumo; `getEnergyUsage` devuelve
   `null` en vez de propagar el error.
7. **`DELETE` borra de verdad.** La fila es sólo el registro de acceso, no guarda histórico.
   Para dejar de operar una toma conservando el registro está el flag `active`.

## Códigos de error

| Código | HTTP | Cuándo |
|---|---|---|
| `ERR_SMART_PLUG_MISSING_NAME` | 400 | Nombre vacío |
| `ERR_SMART_PLUG_INVALID_HOST` | 400 | Host con esquema, puerto, path o caracteres fuera de patrón |
| `ERR_SMART_PLUG_INVALID_EMAIL` | 400 | Email Tapo sin `@` |
| `ERR_SMART_PLUG_MISSING_PASSWORD` | 400 | Contraseña Tapo vacía |
| `ERR_SMART_PLUG_INVALID_ACTION` | 400 | Acción distinta de `on`/`off`/`toggle` |
| `ERR_SMART_PLUG_INVALID_ID` | 400 | `:id` no es entero positivo |
| `ERR_SMART_PLUG_NOT_FOUND` | 404 | No existe, o es de otra company |
| `ERR_SMART_PLUG_ALREADY_EXISTS` | 409 | Ya hay una toma con ese host en la company |
| `ERR_SMART_PLUG_INACTIVE` | 409 | Toma con `active=false` |
| `ERR_SMART_PLUG_UNREACHABLE` | 422 | La toma no respondió (IP mal, credencial mal, fuera de red) |
| `ERR_SMART_PLUG_COMMAND_NOT_APPLIED` | 502 | La toma respondió pero el relé no conmutó |
| `ERR_SMART_PLUG_DRIVER_UNAVAILABLE` | 503 | Falta `tp-link-tapo-connect` en el servidor |

## Flujos clave

- **Happy path (alta):** el usuario parea la toma con la app Tapo → anota su IP en la LAN →
  `POST /smart-plugs` con `{name, host, tapoEmail, tapoPassword}` → el backend **sonda el
  dispositivo antes de guardar** → si responde, se crea la fila con `status=online`,
  `model`, `macAddress` y `vendorDeviceId` tomados del propio dispositivo.
- **Happy path (operar):** `POST /smart-plugs/:id/command {"action":"toggle"}` → se lee el
  estado previo → se conmuta → se relee para confirmar → 200 con
  `{previousRelayOn, relayOn, changed}`.
- **Error — toma fuera de red:** cualquier operación → 422 `ERR_SMART_PLUG_UNREACHABLE`, la
  fila queda con `status=offline` y `lastError` con el motivo.
- **Error — cross-tenant:** toda lectura pasa por `ShowSmartPlugService`, que filtra por
  `{id, companyId}`; un id de otra company da 404, no 403 (no se confirma su existencia).
- **Cambio de IP por DHCP:** `PUT /smart-plugs/:id` con el nuevo `host` → se sonda con los
  datos nuevos **antes** de guardarlos → la sesión cacheada se invalida.

## Criterios de aceptación (Given/When/Then)

1. **Given** una toma Tapo pareada y alcanzable en `192.168.1.50`, **When** el usuario hace
   `POST /be/smart-plugs` con `{name, host, tapoEmail, tapoPassword}`, **Then** responde 201,
   la fila queda con `status=online` y `model`/`macAddress` completados desde el dispositivo.
2. **Given** un host inalcanzable o una credencial incorrecta, **When** el usuario hace
   `POST /be/smart-plugs`, **Then** responde 422 `ERR_SMART_PLUG_UNREACHABLE` y **no** se crea
   ninguna fila.
3. **Given** una toma registrada y encendida, **When** el usuario hace
   `POST /be/smart-plugs/:id/command {"action":"off"}`, **Then** responde 200 con
   `relayOn=false` y `changed=true`, y el relé físico queda abierto.
4. **Given** una toma registrada, **When** el usuario hace `GET /be/smart-plugs/:id/state`,
   **Then** responde 200 con el estado leído del dispositivo y la fila queda con
   `lastSeenAt` actualizado.
5. **Given** una toma P110, **When** se consulta `/state`, **Then** `energy` trae
   `currentPowerMw` y `todayEnergyWh`; **Given** una P100, **Then** `energy` es `null` y la
   respuesta sigue siendo 200.
6. **Given** un usuario de la company A, **When** hace `GET /be/smart-plugs/:id` con el id de
   una toma de la company B, **Then** responde 404 `ERR_SMART_PLUG_NOT_FOUND`.
7. **Given** cualquier respuesta de cualquier endpoint del módulo, **When** se inspecciona el
   JSON, **Then** **no** aparece el campo `tapoPassword` (todas serializan con `toSafeJSON()`).
8. **Given** una toma guardada, **When** se lee la fila directo en BD, **Then** `tapoPassword`
   empieza con `enc:v1:` (cifrada en reposo).

## Pendiente de verificación (no ejecutado)

Ninguno de los criterios anteriores fue ejecutado. Con `node_modules` vacío en el entorno de
trabajo, la verificación posible fue sólo sintáctica (`node --experimental-strip-types --check`,
15/15 archivos OK). Requiere autorización según `AGENTS.md §4`:

1. `npm install` — la dependencia `tp-link-tapo-connect` no está instalada.
2. `npm run type-check` (`tsc --noEmit`) — **el módulo no tiene typecheck todavía**.
3. `npm run lint`.
4. `npm run db:migrate` — la tabla `SmartPlugs` no existe.
5. Prueba contra hardware Tapo real en la misma red que el backend.

## Extensión futura

La columna `vendor` existe para no migrar la tabla cuando entre otro fabricante. Un backend
Tasmota (HTTP `/cm?cmnd=Power%20ON`) o Shelly (RPC) implementaría la misma superficie que
`TapoDriver` (`getDeviceInfo`, `setRelay`, `getEnergyUsage`, `probeDevice`) y los servicios
elegirían el driver por `plug.vendor`. Para clientes remotos, ese es además el camino
natural: Tasmota publica por MQTT saliente y evita el problema de alcanzar una LAN ajena.
