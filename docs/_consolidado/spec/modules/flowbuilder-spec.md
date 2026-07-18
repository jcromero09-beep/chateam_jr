# Spec — FlowBuilder (constructor de flujos conversacionales) · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` real (solo lectura) +
> Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.13` + Fase 2 `02-auditoria-tecnica.md`. Fecha: 2026-07-12.

## Propósito

Constructor visual (reactflow) de flujos de bot conversacional: nodos de texto, imagen, audio, menú, etc.,
que se ejecutan al recibir mensajes. Tres variantes: flujo de conversación general (`FlowBuilder`), flujo por
defecto de la company (`FlowDefault`) y flujo asociado a campaña (`FlowCampaign`). Automatiza la atención y la
captación (bots de bienvenida, menús, respuestas guiadas) reduciendo la carga de los agentes.

## Actores y capacidades

- **El usuario puede** crear, listar, ver, actualizar y eliminar flujos conversacionales
  (`POST/PUT/GET/DELETE /flowbuilder`, `GET /flowbuilder/:idFlow`).
- **El usuario puede** guardar el grafo de nodos del flujo (`POST /flowbuilder/flow`) y obtenerlo
  (`GET /flowbuilder/flow/:idFlow`).
- **El usuario puede** duplicar un flujo (`POST /flowbuilder/duplicate`).
- **El usuario puede** subir media para nodos: imagen, audio y contenido genérico
  (`POST /flowbuilder/img`, `/flowbuilder/audio`, `/flowbuilder/content`).
- **El usuario puede** definir/editar el flujo por defecto de la company (`GET/POST/PUT /flowdefault`).
- **El usuario puede** crear/listar/ver/actualizar flujos de campaña (`/flowcampaign`).
- **El sistema permite** persistir el grafo, los audios (`FlowAudios`) y las imágenes (`FlowImgs`) por flujo.

## Rutas/Controladores (evidencia) y modelo de datos

Montaje `routes/index.ts:523` (flowDefault), `:524` (flowBuilder), `:525` (flowCampaign). Todas con `isAuth`
(multi-tenant por `companyId`). Controladores: `FlowBuilderController`, `FlowDefaultController`,
`FlowCampaignController`.

| Método | Ruta | Handler | Evidencia |
|---|---|---|---|
| POST | `/flowbuilder` | `FlowBuilderController.createFlow` | `routes/flowBuilderRoutes.ts:12` |
| PUT | `/flowbuilder` | `FlowBuilderController.updateFlow` | `routes/flowBuilderRoutes.ts:14` |
| DELETE | `/flowbuilder/:idFlow` | `FlowBuilderController.deleteFlow` | `routes/flowBuilderRoutes.ts:16` |
| GET | `/flowbuilder` | `FlowBuilderController.myFlows` | `routes/flowBuilderRoutes.ts:22` |
| GET | `/flowbuilder/:idFlow` | `FlowBuilderController.flowOne` | `routes/flowBuilderRoutes.ts:24` |
| POST | `/flowbuilder/flow` | `FlowBuilderController.FlowDataUpdate` (guarda grafo) | `routes/flowBuilderRoutes.ts:26` |
| POST | `/flowbuilder/duplicate` | `FlowBuilderController.FlowDuplicate` | `routes/flowBuilderRoutes.ts:32` |
| GET | `/flowbuilder/flow/:idFlow` | `FlowBuilderController.FlowDataGetOne` | `routes/flowBuilderRoutes.ts:38` |
| POST | `/flowbuilder/img` | `FlowBuilderController.FlowUploadImg` (multer) | `routes/flowBuilderRoutes.ts:44` |
| POST | `/flowbuilder/audio` | `FlowBuilderController.FlowUploadAudio` (multer) | `routes/flowBuilderRoutes.ts:51` |
| POST | `/flowbuilder/content` | `FlowBuilderController.FlowUploadAll` (multer) | `routes/flowBuilderRoutes.ts:58` |
| POST/PUT/GET | `/flowdefault` | `FlowDefaultController.createFlow/updateFlow/getFlows` | `routes/flowDefaultRoutes.ts:10,14,16` |
| POST/GET/PUT | `/flowcampaign[/:idFlow]` | `FlowCampaignController.createFlowCampaign/flowCampaigns/flowCampaign/updateFlowCampaign` | `routes/flowCampaignRoutes.ts:11,13,15,17` |

**Modelo de datos (tablas):** `FlowBuilders` (`models/FlowBuilder.ts`), `FlowDefaults`
(`models/FlowDefault.ts`), `FlowCampaigns` (`models/FlowCampaign.ts`), `FlowAudios` (`models/FlowAudio.ts`),
`FlowImgs` (`models/FlowImg.ts`).

## Flujos clave

**Happy path — diseñar y publicar un flujo:**
1. El usuario crea el flujo (`POST /flowbuilder` con nombre).
2. Edita el grafo de nodos en la UI (reactflow) y lo guarda (`POST /flowbuilder/flow`).
3. Sube media de nodos (`/flowbuilder/img`, `/flowbuilder/audio`) → se persiste en `FlowImgs`/`FlowAudios`.
4. Asocia el flujo como default de la company (`POST /flowdefault`) o a una campaña (`/flowcampaign`).
5. Al recibir un mensaje entrante, el motor de flujos (invocado desde `wbotMessageListener`) ejecuta los
   nodos.

**Ramas de error:**
- *Nodo sin implementación de UI:* 11 carpetas `FlowBuilder*Modal/` están **vacías** (Audio/Img/List/Pdf/
  Text/URL/Video/Interval/Menu/Randomizer/SingleBlock) — el nodo referenciado no tiene editor (Fase 1 §3.13).
- *Media inválida:* subida sin `limits`/`fileFilter` (multer) → riesgo de archivos no validados (Fase 2 §1).
- *Flujo de otra company:* editar `idFlow` ajeno debe fallar por scope `companyId` (hoy sólo `isAuth`).
- *Echo SMB no debe disparar flujo:* mensajes `fromMe:true`/`business_app` NO deben ejecutar FlowBuilder
  (regla de Coexistencia, `spec/meta-coexistencia-spec.md §S4`).

## Deuda/bugs conocidos (Fase 2)

- **11 modales de nodo VACÍOS** — `FlowBuilderAudioModal/`, `...ImgModal/`, `...ListModal/`, `...PdfModal/`,
  `...TextModal/`, `...URLModal/`, `...VideoModal/`, `...IntervalModal/`, `...MenuModal/`,
  `...RandomizerModal/`, `...SingleBlockModal/` sin implementación de UI (Fase 1 §3.13): confirmar con
  producto si son features planeadas o descartadas antes de venderlas.
- **C-4 (P0) worker de colas caído** — si el motor de flujos depende de colas para intervalos/nodos
  asíncronos (`Interval`), no se procesan hasta reparar el worker (`02-auditoria-tecnica.md:19,51`).
- **A-1 (P1) god-object `wbotMessageListener.ts` (7.501 líneas)** — el disparo de flujos vive en este hub de
  ~40 ciclos; alto acoplamiento dificulta cambiar la ejecución de flujos (`02-auditoria-tecnica.md:28,59`).
- **Uploads sin validación** — `multer` sin `limits`/`fileFilter` en `img`/`audio`/`content` (Fase 2 §1).
- **Multi-tenant sin defensa en profundidad** — scope `companyId` por query (Fase 2 §1).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un usuario autenticado de la company X, **When** hace `POST /flowbuilder` con un nombre, **Then**
   responde 200/201 y el flujo creado tiene `companyId=X`.
2. **Given** un flujo existente, **When** el usuario hace `POST /flowbuilder/flow` con un grafo de nodos,
   **Then** responde 200 y `GET /flowbuilder/flow/:idFlow` devuelve el mismo grafo persistido.
3. **Given** un flujo, **When** se hace `POST /flowbuilder/img` con una imagen válida, **Then** responde 200 y
   se crea una fila en `FlowImgs` asociada a ese flujo.
4. **Given** un flujo asignado como `flowdefault` de la company X y un mensaje entrante de un contacto nuevo,
   **When** llega el mensaje, **Then** el motor ejecuta el primer nodo del flujo por defecto.
5. **Given** un mensaje `fromMe:true` con `sourceChannel:"business_app"` (echo SMB), **When** se procesa,
   **Then** NO se dispara ningún flujo de FlowBuilder (regla de Coexistencia).
6. **Given** un usuario de la company X, **When** hace `GET /flowbuilder`, **Then** responde 200 y ningún
   flujo devuelto pertenece a otra company.
