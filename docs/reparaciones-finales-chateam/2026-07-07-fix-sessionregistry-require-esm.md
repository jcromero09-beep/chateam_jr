# Fix — `require()` de sessionRegistry rompía el registro de sesión en node-1 (ESM)

**Fecha:** 2026-07-07
**Estado:** ✅ Hecho
**Archivos:** `services/WbotServices/StartWhatsAppSession.ts` (línea ~92)

---

## Síntoma

En los logs de **node-1** aparecía repetidamente (37 veces en el histórico; node-2: 0 veces):

```
[StartWhatsAppSession] Error registrando en Redis: Cannot find module '../../libs/sessionRegistry'
```

Se disparaba en cada arranque/reconexión de sesiones de WhatsApp (Baileys) en node-1.

## Causa raíz

El proyecto corre en **ESM** (`"type": "module"` + `tsx`). En `StartWhatsAppSession.ts` había un **registro de respaldo** de la sesión en Redis que cargaba el módulo con `require()` de CommonJS:

```ts
// línea 12 (ya existía, correcto):
import { sessionRegistry } from "../../libs/sessionRegistry";
...
// línea ~92 (BUG):
const { sessionRegistry } = require("../../libs/sessionRegistry");
await sessionRegistry.register(whatsapp.id);
```

En runtime ESM, `require()` de una ruta relativa sin extensión falla con `Cannot find module`. El `catch` lo tragaba como warning, así que **este registro de respaldo nunca se ejecutaba**. No era fatal porque el registro principal (vía el `import` estático de la línea 12, usado más arriba en el mismo archivo) sí funciona — por eso el sistema distribuido seguía operando. Pero el respaldo quedaba muerto y ensuciaba los logs.

> Es el **mismo patrón de bug** que apareció al registrar la cola nueva `VerifyContactsWhatsapp` en el worker: un `require()` que arrastraba `whatsapp-rust-bridge` fallaba con `No "exports" main defined`. En ESM hay que usar `import` (estático o dinámico `await import()`), no `require()`.

## Reparación

Se eliminó el `require()` redundante y se reutiliza el `sessionRegistry` **ya importado estáticamente** en la línea 12 (que sí resuelve en ESM):

```ts
// ANTES
const { sessionRegistry } = require("../../libs/sessionRegistry");
await sessionRegistry.register(whatsapp.id);

// DESPUÉS
await sessionRegistry.register(whatsapp.id);
```

El `try/catch` se mantiene igual (por si Redis está caído).

## Por qué es seguro

- No cambia la lógica: `sessionRegistry` es un **singleton exportado** (`export const sessionRegistry = new SessionRegistry()`), así que el import estático y el `require` apuntaban al mismo objeto. Solo se elimina la forma rota de obtenerlo.
- `sessionRegistry` solo depende de `./cache` (Redis); no arrastra Baileys ni binarios nativos.
- No toca BD ni contratos. Afecta solo el registro de respaldo de sesiones en Redis de node-1.

## Verificación

- `tsc --noEmit`: sin errores nuevos en `StartWhatsAppSession.ts`.
- Tras `pm2 restart node-1`: el mensaje `Error registrando en Redis: Cannot find module...` **ya no aparece**; en su lugar debe verse `Sesión <id> registrada en Redis`.
- node-1 sigue respondiendo `HTTP 200` en `/health`.

## Cómo revertir (si hiciera falta)

Volver a poner la línea `const { sessionRegistry } = require("../../libs/sessionRegistry");` antes del `await sessionRegistry.register(...)`. (No recomendado: reintroduce el bug.)
