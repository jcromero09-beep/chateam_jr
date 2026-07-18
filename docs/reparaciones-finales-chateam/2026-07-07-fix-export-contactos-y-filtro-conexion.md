# Fix — Exportar contactos daba error (require ESM) + filtro por conexión

**Fecha:** 2026-07-07
**Estado:** ✅ Hecho
**Archivos:** `jobs/ExportContactsToExcel.ts`, `controllers/ContactController.ts`, `frontend/src/pages/Contacts.tsx`

---

## Síntoma

Al pulsar **Exportar** en la página de Contactos, la operación terminaba en error y el archivo no se descargaba.

## Causa raíz (diagnóstico reproducido)

Se reprodujo el job de exportación con una empresa real (117 contactos). El job:

1. ✅ Obtenía los contactos.
2. ✅ **Generaba el Excel correctamente** (el archivo sí se creaba).
3. ❌ **Justo después**, para enviar la notificación de "export completado", hacía:
   ```ts
   const { add } = require("../queues");   // ← BUG
   ```
   Ese `require()` de CommonJS, en el runtime **ESM** del proyecto, re-resolvía `../queues` y arrastraba la dependencia nativa `whatsapp-rust-bridge`, fallando con:
   ```
   No "exports" main defined in .../node_modules/whatsapp-rust-bridge/package.json
   ```
4. El `catch` del job hacía `throw` → el job quedaba **failed**. Aunque el Excel existía, el flujo se marcaba como error.

> Es el **mismo patrón** que los otros dos fixes de hoy (`StartWhatsAppSession` y el registro de la cola `VerifyContactsWhatsapp`): en ESM hay que usar `import` / `await import()`, nunca `require()`.

## Reparación

**1. `jobs/ExportContactsToExcel.ts`** — `require` → `await import` (2 ocurrencias) y se quitó el `createRequire` que quedaba sin uso:
```ts
// ANTES
const { add } = require("../queues");
// DESPUÉS
const { add } = await import("../queues");
```
`await import` usa el caché ESM (queues ya está cargado en el worker), así que no re-resuelve `whatsapp-rust-bridge`.

**Verificación (worker real):** se encoló un job en la cola `ExportContacts` y el worker lo procesó completo:
```
📥 Iniciando → ✅ Archivo Excel generado → ✅ 117 contactos exportados
→ 🔔 Notificación enviada → ✅ Job completed
```
0 errores de `whatsapp-rust-bridge`; `.xlsx` de 66 KB descargable.

## Mejora — Filtro por conexión

Se agregó la posibilidad de **exportar solo los contactos de una conexión (whatsappId)**:

- **`jobs/ExportContactsToExcel.ts`**: `getCompanyContacts` acepta `filters.whatsappId` → `whereClause.whatsappId`.
- **`controllers/ContactController.ts`** (`exportToExcel`): lee `whatsappId` del body y lo pasa en `filters`.
- **`frontend/src/pages/Contacts.tsx`** (`handleExportContacts`): reutiliza el filtro de conexión **ya existente** en la vista (`whatsappFilter`). Si hay una conexión seleccionada, el POST envía `{ whatsappId }` y se exportan solo sus contactos; si es "Todas", se exporta todo. El toast indica la conexión.

## Notas de despliegue

- Requiere `pm2 restart chateam-worker` (job) y `pm2 restart node-1 node-2` (controller).
- Frontend: `npm run build:prod` + `pm2 restart chateam-frontend`.
- BD SAGRADA: no se toca BD; el export solo lee.
