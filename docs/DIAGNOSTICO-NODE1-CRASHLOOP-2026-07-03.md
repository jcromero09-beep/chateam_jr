# 📋 Reporte de Diagnóstico — Crash Loop de node-1 + Disco Lleno + Preview de Video

**Fecha:** 2026-07-03
**Servidor:** producción ChatEAM JR (`/home/deploy/chateam_jr`)
**Estado:** En progreso — disco resuelto ✅ · loop de node-1 pendiente ⚠️

---

## 1. Resumen ejecutivo

Se atendieron **tres asuntos encadenados**:

| # | Asunto | Estado |
|---|--------|--------|
| A | Preview/miniatura de video no aparecía al enviar por WhatsApp | ✅ Corregido |
| B | Disco del servidor al 100% (log huérfano de 84 GB) | ✅ Resuelto + blindado |
| C | `node-1` reiniciándose en bucle cada ~30s (rompe envío y conexiones) | ⚠️ Diagnóstico avanzado, causa raíz del disparador pendiente |

**Importante:** el crash loop de node-1 (C) **NO fue causado por el cambio de video (A)**. Evidencia: el patrón existe desde el **8-may-2026**, `node-2` corre el mismo código sin problema, y se descartaron memoria, Redis y el código de envío.

---

## 2. Asunto A — Preview de video (RESUELTO)

### Síntoma
Al enviar un video **desde ChatEAM hacia WhatsApp**, el destinatario no veía la miniatura; había que descargar el video. Recibir videos y Meta Cloud API no tenían el problema.

### Causa raíz (doble)
1. **Falta `jpegThumbnail`:** Baileys genera la miniatura ejecutando el comando `ffmpeg` del **PATH del sistema**, que **no estaba instalado** (solo existía el binario en `node_modules/@ffmpeg-installer`). Fallo silencioso → video sin miniatura.
2. **Faltan `width`/`height`/`seconds`:** Baileys no extrae dimensiones de video. Sin ellas, WhatsApp no renderiza el preview aunque la miniatura viaje. (Comprobado en BD comparando un video enviado vs. uno recibido con preview.)

### Solución aplicada
- Nuevo helper `helpers/GenerateVideoThumbnail.ts`: genera miniatura JPEG (~6 KB, 320px) con el ffmpeg del proyecto + extrae `width`/`height`/`seconds` con `ffprobe`. Todo *best-effort* (si falla, el video se envía igual).
- Integrado en las 3 rutas de envío por Baileys: `services/WbotServices/SendWhatsAppMedia.ts` (bloque directo + `getMessageOptions`, que cubre el proxy interno `/internal/send-media` y campañas) y `services/WbotServices/SendWhatsAppMediaFlow.ts`.
- **`ffmpeg` instalado a nivel de sistema** (red de seguridad global + provee `ffprobe`).

### Notas
- Videos **> ~16 MB** (p.ej. el de 38 MB probado): WhatsApp muestra la miniatura pero **no reproduce inline** (límite del propio WhatsApp). Para reproducción sin descarga habría que **comprimir/transcodificar a <16 MB** antes de enviar (mejora opcional pendiente).

---

## 3. Asunto B — Disco al 100% (RESUELTO)

### Hallazgo
- `/root/.pm2/logs/` ocupaba **86 GB**.
- Un solo archivo: **`atendimento-backend-error.log` = 84 GB**.
- Era de `atendimento-backend`, un **proceso legacy que ya no existe** (no está en ningún PM2), en bucle de crash (`EADDRINUSE :::4000`). Última escritura: **19-nov-2025**. Basura huérfana nunca limpiada.

### Acciones aplicadas
- `truncate -s 0` de los logs huérfanos (atendimento-backend, multipremium) → liberó **85 GB**.
- `pm2 flush` de logs actuales.
- **`pm2-logrotate` instalado y configurado**: máx **50 MB**/archivo, retiene 7, comprime, chequeo cada 30s + rotación diaria.
- **Disco: 94% → 49%** (97 GB libres).

**Resultado:** el disco ya no se volverá a llenar por logs.

---

## 4. Asunto C — Crash loop de node-1 (EN PROGRESO)

### Síntoma
`node-1` (proceso backend *primary*, puerto 3001) se reinicia **cada ~30 segundos**. PM2: `exited with code [1] via signal [SIGINT]`. Esto tumba las conexiones alojadas en node-1 (WhatsApp id 14 "chateam Demo", 33, 34…), impide el envío de video (el proxy interno responde `ECONNREFUSED 127.0.0.1:3001`) y no deja generar el QR de reconexión.

### Mecánica CONFIRMADA
1. Algo **envía una señal de apagado** (SIGINT/SIGTERM) a node-1 de forma recurrente → aparece `🔌 [node-1] Graceful shutdown...` en los logs.
2. node-1 usa `http-graceful-shutdown` con **timeout por defecto de 30.000 ms** y `forceExit: true` (`server-distributed.ts:32`).
3. Como node-1 tiene **sesiones de WhatsApp (Baileys) abiertas que no cierran**, se agota el timeout de 30s → `process.exit(1)` (`node_modules/http-graceful-shutdown/lib/index.js:82-88` y `:242-244`).
4. PM2 lo relevanta → el ciclo se repite exactamente cada 30s.

### Prueba decisiva
Ejecutado **manualmente fuera de PM2**, node-1 también muere con `exit 1` ~30s tras arrancar. → El killer **no es PM2**; es el propio ciclo señal→graceful-shutdown→timeout.

### Pistas correlacionadas
- El problema se agravó al **habilitar un WebChat**. Módulo: `models/WebChat*`, `services/WebChatServices/`, `services/WebChatWidgetServices/`, `routes/webchat*`.
- Sospecha en `services/WebChatWidgetServices/WebChatConversationService.ts` (líneas ~201/249/348): usa `io.of(String(companyId)).emit(...)`, que **crea namespaces de Socket.IO dinámicos** en cada llamada (puede acumular listeners/recursos).
- Al arrancar node-1 aparece: `[Socket.IO] Failed to initialize Redis adapter: Connection timeout` (clientes pub/sub). Posible relación con el disco lleno (Redis no persistía) y/o con el webchat.
- Único código **exclusivo de node-1** (no corre en node-2): el **watchdog** (cada 30s), los **backend cron jobs** y los **queue processors** (`server-distributed.ts:47-53`).

### Causas DESCARTADAS (con evidencia)
- ❌ **El cambio de video** — patrón desde mayo; node-2 mismo código OK; handler de envío con try/catch.
- ❌ **Memoria/OOM** — node-1 usa 61 MB de 5 GB; sin `max_memory_restart` disparado; sin OOM killer.
- ❌ **Redis saturado** — 126/10000 clientes, 0 rechazos, `SETEX` funciona, heartbeat presente.
- ❌ **Disco lleno como causa directa del loop** — el loop persiste con disco al 49%.
- ❌ **Cron/systemd/timer/script externo** — no existe ninguno que reinicie node-1.
- ❌ **`process.exit`/`kill` en el código propio** — no hay (salvo el de puerto EADDRINUSE).
- ❌ **SIGINT por syscall** — auditd con reglas kill/tkill/tgkill (señal 2) no capturó envío alguno → apunta a señal interna (`process.emit`) o SIGTERM (pendiente auditar señal 15).

### PENDIENTE (lo que falta para cerrar)
1. **Identificar QUÉ dispara la señal de apagado** cada 30s (¿watchdog? ¿webchat vía Socket.IO/adapter? ¿un cron/queue del backend?).
2. Confirmar si es **SIGINT o SIGTERM** (ampliar auditoría a señal 15).
3. Verificar la hipótesis del **Socket.IO Redis adapter** (por qué timeout, y si su fallo dispara el shutdown).
4. Investigación en curso con 2 agentes (WebChat + Socket.IO adapter).

### Mitigación disponible (no aplicada aún)
- Mover temporalmente las conexiones de node-1 a **node-2** (estable) para recuperar servicio mientras se cierra el diagnóstico.

---

## 5. Cronología de la investigación

1. Reporte inicial: preview de video no aparece → diagnóstico Baileys/ffmpeg → fix miniatura.
2. Segunda prueba falla → BD revela falta de `width/height/seconds` → fix metadata + ffprobe.
3. Reporte "no se puede enviar videos" → logs muestran `ECONNREFUSED 127.0.0.1:3001` → node-1 caído.
4. node-1 en crash loop (480+ reinicios) → descarte sistemático de causas.
5. Confirmada mecánica graceful-shutdown/timeout 30s.
6. Usuario reporta WebChat habilitado + disco al 100%.
7. Disco: log huérfano de 84 GB → truncado + logrotate. Disco 94%→49%.
8. Loop de node-1 persiste → investigación del disparador en curso (agentes).

---

## 6. Archivos tocados / creados

| Archivo | Cambio |
|---------|--------|
| `helpers/GenerateVideoThumbnail.ts` | **NUEVO** — miniatura + metadata de video |
| `services/WbotServices/SendWhatsAppMedia.ts` | Integración miniatura (bloque directo + `getMessageOptions`) |
| `services/WbotServices/SendWhatsAppMediaFlow.ts` | Integración miniatura (flows) |
| `/root/.claude/tasks/lessons.md` | Lección documentada del preview de video |
| ffmpeg (sistema) | Instalado |
| pm2-logrotate | Instalado + configurado |
| Logs huérfanos (84 GB) | Truncados |

---

*Documento generado durante la sesión de diagnóstico del 2026-07-03.*

---

## 7. Cierre posterior — causa real encontrada y solucion aplicada

**Actualizacion:** 2026-07-03 16:57 -05.

La hipotesis anterior de "senal -> graceful shutdown -> timeout 30s" explicaba el patron visible, pero no era la causa raiz. La investigacion posterior encontro que `node-1` estaba cayendo por un error de carga de modulos al arrancar Baileys bajo el loader equivocado.

### Causa raiz confirmada

PM2 arrancaba el backend con:

```bash
npx tsx server-distributed.ts
```

Con ese comando, al cargar Baileys, `tsx` terminaba pasando por una ruta CommonJS que intentaba resolver `whatsapp-rust-bridge` con `require()`. La version instalada (`whatsapp-rust-bridge@0.5.4`) solo expone entrada ESM en `exports` y no define una entrada `require`, por lo que el proceso registraba repetidamente:

```txt
ERR_PACKAGE_PATH_NOT_EXPORTED
No "exports" main defined in /home/deploy/chateam_jr/node_modules/whatsapp-rust-bridge/package.json
```

El error aparecia como `unhandledRejection` en los logs de aplicacion y PM2 reiniciaba `node-1`, produciendo el loop observado de aproximadamente 30 segundos.

### Prueba de reproduccion

Se verifico la diferencia entre loaders:

```bash
npx tsx -e "import makeWASocket from 'baileys'; console.log(typeof makeWASocket)"
```

Resultado: falla con `ERR_PACKAGE_PATH_NOT_EXPORTED`.

```bash
node --import tsx/esm --input-type=module -e "import makeWASocket from 'baileys'; console.log(typeof makeWASocket)"
```

Resultado: carga correctamente (`function`).

### Solucion aplicada

Se cambio el comando de arranque del backend distribuido en `ecosystem.config.cjs` para usar el loader ESM real:

```bash
node --max-old-space-size=5120 --import tsx/esm server-distributed.ts
```

Luego aparecio un segundo problema causado por el cambio correcto de loader: `backendQueues.ts` usaba `require()` lazy para cargar jobs TypeScript. Bajo ESM eso fallo con:

```txt
MODULE_NOT_FOUND: Cannot find module './jobs/FeedbackInferenceJob'
```

Por eso se ajusto:

- `backendQueues.ts`: `startBackendQueueProcessors()` ahora es `async` y usa `await import("./jobs/...ts")`.
- `server-distributed.ts`: el arranque de node-1 ahora hace `await startBackendQueueProcessors()` antes de iniciar cron jobs.
- `ecosystem.config.cjs`: `node-1` y `node-2` quedan configurados para arrancar con `node --import tsx/esm`; se recargo solo `node-1`.

### Estado verificado despues del fix

Despues de recargar solo `node-1`, PM2 mostro:

```txt
node-1 online | pid 3607463 | uptime 3m | restarts 636 | mem 398.1mb
node-2 online | uptime 71m
chateam-worker online | uptime 4h
```

En los logs posteriores al arranque estable ya no aparecieron nuevos `ERR_PACKAGE_PATH_NOT_EXPORTED` ni `MODULE_NOT_FOUND`; solo trafico normal de la aplicacion.

### Causas descartadas tras la investigacion posterior

- WebChat si usa namespaces dinamicos de Socket.IO (`io.of(String(companyId))`), pero no se encontro ninguna ruta que envie `SIGINT`, `SIGTERM`, `process.exit()`, `process.kill()` o cierre el server.
- El adapter Redis de Socket.IO puede fallar y loguear timeout, pero su error esta capturado y no relanza la excepcion ni tumba el proceso.
- Watchdog, cron jobs y queue processors fueron revisados como sospechosos por correr solo en `node-1`; no fueron la causa directa del crash loop.

### Pendiente operativo

`node-2` seguia online con el comando viejo porque no se reinicio durante la correccion. El archivo `ecosystem.config.cjs` ya quedo preparado para que, en una ventana controlada, `node-2` se recargue con el mismo comando corregido. No usar `reload all` sin necesidad; la accion prudente es recargar `node-2` de forma aislada despues de observar estable a `node-1`.

La sesion WhatsApp `Pacta sunt servanda Demo` seguia mostrando reconexiones programadas (`ERR_WAPP_RECONNECT_SCHEDULED`), pero eso es un problema de sesion/conectividad separado y ya no estaba tumbando el proceso.
