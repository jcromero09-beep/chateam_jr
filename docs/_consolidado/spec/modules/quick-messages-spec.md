# Spec de Módulo — Mensajes Rápidos (Quick Replies) · chateam_jr

> Grupo: OMNICANAL. Fuente: `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.5`, `SPEC-FIRST/fase2/02-auditoria-tecnica.md` (C-1).
> Base URL producción: `https://padeldev.codigo.plus/be`.

## Propósito
Biblioteca de respuestas predefinidas (plantillas) que el agente inserta en un chat con un atajo, con embeddings para sugerencia semántica y asistencia IA (sugerir intención, reescribir). Reduce el tiempo de respuesta reutilizando textos frecuentes. `QuickMessages` tiene 35 filas reales con columna `intentEmbedding` vector(1536) e índice ivfflat.

## Actores y capacidades
- **El usuario puede** listar mensajes rápidos para el selector del chat (`GET /quick-messages/list`), listarlos paginados (`GET /quick-messages`), ver uno (`GET /quick-messages/:id`), crear (`POST /quick-messages`), editar (`PUT /quick-messages/:id`) y eliminar (`DELETE /quick-messages/:id`).
- **El usuario puede** adjuntar/quitar media a un mensaje rápido (`POST|DELETE /quick-messages/:id/media-upload`).
- **El usuario puede** pedir a la IA que sugiera la intención de un texto (`POST /quick-messages/ai/suggest-intent`) y que reescriba/redacte un mensaje (`POST /quick-messages/ai/redraft`).
- **El sistema permite** almacenar el `intentEmbedding` (vector 1536) para búsqueda/sugerencia semántica del mensaje rápido más pertinente.

## Rutas/Controladores (evidencia) y modelo de datos
Router: `routes/quickMessageRoutes.ts` (plano, `index.ts:500`). Middleware `isAuth` en todas.

| Método/Ruta | Controlador:línea |
|---|---|
| `GET /quick-messages/list` | `controllers/QuickMessageController.ts:202` (`findList`, usa `FindService`) — `:12` — **500 en vivo** |
| `GET /quick-messages` | `QuickMessageController.ts:57` (`index`, usa `ListService`) — `:14` |
| `POST /quick-messages/ai/suggest-intent` | `QuickMessageController.ts` (`suggestAiIntent`) — `:16` |
| `POST /quick-messages/ai/redraft` | `QuickMessageController.ts` (`redraftMessage`) — `:18` |
| `GET /quick-messages/:id` | `QuickMessageController.ts` (`show`, usa `ShowService`) — `:20` |
| `POST /quick-messages` | `QuickMessageController.ts` (`store`, usa `CreateService`) — `:22` |
| `PUT /quick-messages/:id` | `QuickMessageController.ts` (`update`, usa `UpdateService`) — `:24` |
| `DELETE /quick-messages/:id` | `QuickMessageController.ts` (`remove`, usa `DeleteService`) — `:26` |
| `POST|DELETE /quick-messages/:id/media-upload` | `QuickMessageController.ts` (`mediaUpload`/`deleteMedia`) — `:28-39` |

**Tablas**: `QuickMessages` (35 filas; `intentEmbedding` vector(1536) con índice ivfflat). Modelo: `models/QuickMessage.ts`. Servicios: `services/QuickMessageService/{ListService,CreateService,ShowService,UpdateService,DeleteService,FindService}.ts`.

## Flujos clave
- **Happy path (usar en chat):** agente abre el selector → `GET /quick-messages/list` devuelve sus mensajes → selecciona uno → el texto (y media) se inserta en el compositor del ticket.
- **Happy path (crear con IA):** agente escribe un borrador → `POST /quick-messages/ai/redraft` mejora el texto → `POST /quick-messages/ai/suggest-intent` propone la intención → `POST /quick-messages` guarda el mensaje con su `intentEmbedding`.
- **Error — listado roto (C-1):** `GET /quick-messages/list` (`findList` → `FindService`) responde **500 en los 4 perfiles** → el selector de mensajes rápidos no carga hoy.
- **Error — cross-tenant:** los mensajes rápidos deben filtrarse por `companyId`; un usuario no debe ver los de otra company.

## Deuda/bugs conocidos (Fase 2)
- **C-1 (P0):** `GET /quick-messages/list` en **500** (mismo en los 4 perfiles → bug de código, probable include/columna faltante en `FindService`). Fuente `02-auditoria-tecnica.md` C-1.
- Dependencia del proveedor IA (OpenAI/Anthropic) para `suggest-intent`/`redraft`: definir fallback si el proveedor falla o el plan no incluye IA.
- Coste de generar `intentEmbedding` (vector 1536) en cada create/update: validar que no bloquea el request de guardado.

## Criterios de aceptación (Given/When/Then)
1. **Given** cualquier perfil autenticado con mensajes rápidos, **When** hace `GET /be/quick-messages/list`, **Then** responde 200 con la lista de sus mensajes rápidos (hoy 500 — bloqueador C-1).
2. **Given** un usuario autenticado, **When** hace `POST /be/quick-messages` con `{shortcut,message}`, **Then** se crea el registro con su `companyId` y se calcula/persiste `intentEmbedding`.
3. **Given** un borrador de texto, **When** el usuario hace `POST /be/quick-messages/ai/redraft` con ese texto, **Then** responde 200 con una versión reescrita (o error controlado si el proveedor IA no está disponible/permitido por plan).
4. **Given** un mensaje rápido existente, **When** el usuario hace `POST /be/quick-messages/:id/media-upload` con un archivo, **Then** la media queda asociada y se devuelve en `GET /be/quick-messages/:id`.
5. **Given** un usuario de la company A, **When** hace `GET /be/quick-messages`, **Then** no aparece ningún mensaje rápido de la company B.
