# Spec de Módulo — Contactos (CRM) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.4`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (P-1, C-3).
> Base URL producción: `https://padeldev.codigo.plus/be`.

## Propósito
Directorio CRM de contactos de la company: crear/editar/importar (Excel)/exportar contactos, agruparlos en listas, etiquetarlos, añadir campos personalizados, y alimentar el scoring de Kanban (temperatura) y la memoria semántica IA por contacto. `Contacts` tiene 11.406 filas reales (PII: nombre, teléfono, foto).

## Actores y capacidades
- **El usuario puede** listar contactos paginados (`GET /contacts`), obtener lista simple para selects (`GET /contacts/list`), ver un contacto (`GET /contacts/:contactId`), crear (`POST /contacts`), editar (`PUT /contacts/:contactId`) y eliminar (`DELETE /contacts/:contactId`).
- **El usuario puede** importar contactos del teléfono (`POST /contacts/import`), importar Excel (`POST /contactsImport`), subir archivo (`POST /contacts/upload`), consultar estado del job de importación (`GET /contacts/import/status/:jobId`), exportar a Excel (`POST /contacts/export/excel`) y descargar el export (`GET /contacts/export/download/:jobId`).
- **El usuario puede** bloquear/desbloquear (`PUT /contacts/block/:contactId`), alternar aceptación de audios (`PUT /contacts/toggleAcceptAudio/:contactId`), desactivar el bot para un contacto (`PUT /contacts/toggleDisableBot/:contactId`), ver etiquetas del contacto (`GET /contactTags/:contactId`), actualizar su wallet (`PUT /contact-wallet/:contactId`) y obtener su vCard/foto de perfil (`GET /contacts/profile/:number`).
- **El usuario puede** gestionar listas de contactos: listar (`GET /contact-lists`, `/contact-lists/list`), ver (`GET /contact-lists/:id`), crear (`POST /contact-lists`), subir Excel a una lista (`POST /contact-lists/:id/upload`), editar/eliminar (`PUT|DELETE /contact-lists/:id`).
- **El sistema permite** calcular "temperatura" del contacto (`ContactTemperatures`, 116 filas) para el scoring de Kanban y guardar memoria semántica IA (`contact_memory`, pgvector).

## Rutas/Controladores (evidencia) y modelo de datos
Routers: `routes/contactRoutes.ts` (plano, `index.ts:488`), `routes/contactListRoutes.ts` (`index.ts:505`). Middleware `isAuth` en todas.

| Método/Ruta | Controlador:línea |
|---|---|
| `POST /contacts/import` | `controllers/ImportPhoneContactsController.ts` (`store`) — `contactRoutes.ts:12` |
| `POST /contactsImport` | `controllers/ContactController.ts:72` (`importXls`) — `:14` |
| `GET /contacts` | `ContactController.ts:137` (`index`, paginado vía `ListContactsService`) — `:15` |
| `GET /contacts/list` | `ContactController.ts:318` (`list`, usa `SimpleListService`) — `:16` |
| `GET /contacts/:contactId` | `ContactController.ts` (`show`) — `:17` |
| `POST /contacts` | `ContactController.ts` (`store`) — `:18` |
| `PUT /contacts/:contactId` | `ContactController.ts` (`update`) — `:19` |
| `DELETE /contacts/:contactId` | `ContactController.ts` (`remove`) — `:20` |
| `POST /contacts/upload` | `ContactController.ts` (`upload`) — `:26` |
| `POST /contacts/export/excel` | `ContactController.ts:366` (`exportToExcel`) — `:28` |
| `GET /contactTags/:contactId` | `ContactController.ts` (`getContactTags`) — `:31` |
| `GET|POST|PUT|DELETE /contact-lists...` | `controllers/ContactListController.ts` |

**Handler comentado (ruta desactivada):** `GET /contacts/list-whatsapp` está comentado en `contactRoutes.ts:34`; el handler `listWhatsapp` existe en `ContactController.ts:646` (usa `SimpleListService`). En la sonda RBAC aparecía en **500**.

**Tablas**: `Contacts` (11.406 filas), `ContactLists`, `ContactListItem`, `ContactTags`, `ContactCustomFields`, `ContactTemperatures` (116), `contact_memory`/`ContactMemory` (pgvector), `ContactWallet`, `ContactBinding`. Modelos: `models/Contact.ts`, `models/ContactList.ts`, `models/ContactListItem.ts`, `models/ContactTag.ts`, `models/ContactCustomField.ts`, `models/ContactTemperature.ts`, `models/ContactMemory.ts`.

## Flujos clave
- **Happy path (crear + etiquetar):** `POST /contacts` con nombre/teléfono → contacto creado con `companyId` → `PUT` para asignar tags/campos personalizados → aparece en `GET /contacts` paginado.
- **Happy path (importar Excel asíncrono):** `POST /contacts/export/excel` o `POST /contact-lists/:id/upload` → se encola job → cliente hace polling `GET /contacts/import/status/:jobId` hasta completar.
- **Error — listado sin paginar (P-1):** `GET /contacts/list` usa `SimpleListService` (`Contact.findAll` sin `limit`/`offset`, `services/ContactServices/SimpleListService.ts:30`) → 2 MB/1.4 s medido; ~7 MB en el tenant mayor → riesgo OOM.
- **Error — import Excel inseguro (C-3):** la importación usa `xlsx@0.18.5` con CVE (prototype-pollution + ReDoS) sin fix → cualquier import masivo es superficie de ataque.
- **Error — cross-tenant:** todo query depende del filtro `companyId` (sin `tenantMiddleware`).

## Deuda/bugs conocidos (Fase 2)
- **P-1 (P0):** `GET /contacts/list` sin paginar (`SimpleListService`) → 2 MB/1.4 s, ~7 MB tenant mayor. Fix usar `ListContactsService` paginado.
- **C-3 (P0):** `xlsx@0.18.5` con CVE en import/export. Fix migrar a `exceljs` o fork con parche.
- **`/contacts/list-whatsapp`:** ruta comentada (`contactRoutes.ts:34`); handler `listWhatsapp:646` daba 500 en sonda. Definir si se elimina o se repara+re-monta.
- **PII/compliance:** `Contacts` (11.406 filas PII) sin política de retención/borrado ni endpoint de "derecho al olvido" (LOPDP/RGPD por confirmar con negocio).

## Criterios de aceptación (Given/When/Then)
1. **Given** un usuario autenticado, **When** hace `GET /be/contacts?pageNumber=1`, **Then** recibe 200 con `{contacts,count,hasMore}` limitado a una página y solo contactos de su `companyId`.
2. **Given** el tenant mayor (~11k contactos), **When** hace `GET /be/contacts/list`, **Then** la respuesta está paginada/limitada server-side y su tamaño no supera un umbral acordado (hoy trae el array completo, ~7 MB — bloqueador P-1).
3. **Given** un archivo Excel válido, **When** el usuario hace `POST /be/contacts/export/excel`, **Then** se devuelve un `jobId` y `GET /be/contacts/import/status/:jobId` reporta el progreso hasta `completed` sin usar `xlsx@0.18.5` vulnerable (C-3).
4. **Given** un contacto existente de la company, **When** el usuario hace `PUT /be/contacts/block/:contactId`, **Then** el contacto queda bloqueado y deja de generar tickets entrantes.
5. **Given** una lista de contactos, **When** el usuario hace `POST /be/contact-lists/:id/upload` con un Excel, **Then** los contactos se asocian como `ContactListItem` de esa lista y aparecen en `GET /be/contact-lists/:id`.
6. **Given** un usuario de la company A, **When** solicita `GET /be/contacts/:contactId` de un contacto de la company B, **Then** responde 404/403 sin exponer datos.
