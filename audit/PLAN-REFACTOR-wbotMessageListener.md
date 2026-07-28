# Plan de descomposición — `services/WbotServices/wbotMessageListener.ts` (6.764 L)

> Solo plan. NO tocar código hasta aprobación. Handler central de mensajes entrantes
> WhatsApp (Baileys) — el punto más caliente del sistema; un error rompe todo el
> procesamiento. Estrategia: extracción incremental, un módulo por PR, caracterización
> antes de mover, verificación (boot + gate + sonda de mensaje real) después de cada paso.

## Mapa actual (por línea)
| Bloque | Líneas | ~L | Riesgo extracción |
|---|---|---|---|
| Getters de mensaje (getBodyMessage, getQuoted*, getContactMessage, getSenderMessage, getTimestampMessage, findCaption) | 304-446 (+top) | ~200 | **BAJO** (puros) |
| Subsistema edición de mensajes (isMessageEditPayload…handleMessageEditUpdate, decrypt secret edit) | 446-1066 | ~620 | **BAJO** (cohesivo, autocontenido) |
| Media (getUnpackedMessage, getMessageMedia, downloadMedia, verifyMediaMessage) | 1066-1541 | ~475 | MEDIO |
| Audio/TTS (convertTextToSpeech…, convertWavToAnotherFormat, sanitizeName, keepOnlySpecifiedChars) | 3774-3849 | ~75 | **BAJO** (puros/IO acotado) |
| ACK (normalizeBaileysAck, handleMsgAck) | 192-250 + 6087-6213 | ~180 | MEDIO |
| Integraciones (sendDialogflowAwswer, flowbuilderIntegration, handleMessageIntegration, flowBuilderQueue) | 1696-1778 + 3865-4746 | ~1.400 | MEDIO-ALTO |
| Campañas (verifyRecentCampaign, verifyCampaignMessageAndCloseTicket) | 6213-6325 | ~110 | BAJO-MEDIO |
| **verifyQueue** | 1861-3674 | **~1.813** | **ALTO** |
| **handleMessage** | 4806-6087 | **~1.281** | **ALTO** |
| Rating (verifyRating, handleRating) | 3674-3774 | ~100 | BAJO |
| Wiring (filterMessages, wbotMessageListener) | 6325-fin | ~410 | dejar al final |

Acoplamiento: 90 imports. Muchas funciones ya `export` → se pueden mover manteniendo el re-export.

## Regla de oro por paso
1. **Caracterizar** la unidad: tests que capturen el comportamiento ACTUAL con entradas
   representativas (mensajes reales anonimizados del ledger/logs).
2. **Extraer** a un archivo nuevo bajo `services/WbotServices/wbot/` (mismo dir, sin carpeta nueva raíz),
   re-exportando desde el original para no romper importadores externos.
3. **Verificar**: boot limpio + gate RBAC + sonda de mensaje entrante real (enviar a un número de prueba y confirmar ticket/mensaje persistido).
4. **Commit** por unidad. Nunca mezclar extracción con cambio de lógica.

## Olas (de menor a mayor riesgo)

### Ola 1 — utilidades puras (riesgo BAJO)
- `wbot/messageGetters.ts` ← getters de mensaje (puros).
- `wbot/audio.ts` ← TTS + conversión wav.
- `wbot/messageEdit.ts` ← subsistema de edición (620 L cohesivas).
- `wbot/rating.ts` ← verifyRating/handleRating.
Ganancia inmediata: ~-1.500 L del archivo, cero cambio de flujo caliente.

### Ola 2 — IO acotado (riesgo MEDIO)
- `wbot/media.ts` ← download/verify media.
- `wbot/ack.ts` ← normalizeBaileysAck + handleMsgAck.
- `wbot/campaign.ts` ← verifyRecentCampaign + close ticket.

### Ola 3 — integraciones (riesgo MEDIO-ALTO)
- `wbot/integrations.ts` ← dispatch dialogflow/n8n/typebot/openai/flowbuilder.
  Requiere caracterización fuerte (cada rama de integración).

### Ola 4 — los monstruos (riesgo ALTO, primero descomponer EN SITIO)
- **verifyQueue (1.813 L)**: NO mover aún. Primero partir internamente en funciones nombradas
  (selección de cola, match de opción, ruteo a chatbot, submenús, salida) dentro del mismo archivo,
  reduciendo el tamaño de la función. Solo tras estabilizar, extraer a `wbot/queueRouting.ts`.
- **handleMessage (1.281 L)**: idem — extraer pasos (dedupe → resolver contacto/ticket → media →
  cola → integración → rating) como funciones internas, luego a `wbot/handleMessage/`.

## Gate de seguridad por ola
- Suite de caracterización verde + `node tests/rbac-smoke.mjs` verde.
- Sonda de mensaje entrante real (texto, media, botón) → ticket correcto.
- Rollback = revertir el commit de la ola (extracción pura → git revert limpio).

## No-objetivos
- No cambiar comportamiento (solo mover/renombrar).
- No tocar el wiring `wbotMessageListener()` hasta el final.
- No refactorizar `verifyQueue`/`handleMessage` moviéndolos antes de descomponerlos en sitio.
