# Quick-replies · Desactivar IA semántica + botón "Redactar con IA" (2026-07-07)  ✅

## 1) IA semántica desactivada (reversible, NO borrada)
Flag `const AI_FEATURES_ENABLED = false` en `pages/QuickReplies.tsx` oculta:
- Toggle "Habilitar para IA" + campos intent/key del modal.
- Tarjeta "Habilitados para IA" (estadística superior).
- Columna "IA" de la tabla (`<th>` + `<td>` + `colSpan` 7→6).
Para **reactivar**: poner el flag en `true`. El código queda intacto (regla: no borrar código en uso).

## 2) Botón "Redactar con IA" (nuevo)
Toma *atajo* + *mensaje*, la IA lo reescribe con emojis descriptivos y **reemplaza** el campo Mensaje.

### Backend (corre con `tsx` → solo `tsc`, sin build)
- **`services/AIAgentServices/QuickReplyRedraftService.ts`** (NUEVO): `redraft()` reutiliza `generateText` (`modelKey: gpt-5.5`, `temp 0.6`). Fallback: devuelve el texto original si la IA falla. Prompt: no inventa datos (precios/direcciones), conserva `{{variables}}`.
- **`controllers/QuickMessageController.ts`**: `redraftMessage()` (usa `companyId` de `req.user`).
- **`routes/quickMessageRoutes.ts`**: `POST /quick-messages/ai/redraft` (`isAuth`), colocada **antes** de `/:id` para no colisionar.

### Frontend
- **`pages/QuickReplies.tsx`**: estado `redrafting`, handler `handleRedraftWithAI` (`api.post('/quick-messages/ai/redraft')` → `setFormData(message)`), botón junto al Textarea.

## 3) Fix footer del DateRangePicker (modo 1 mes)
En el panel angosto de Tickets el footer (texto del rango + 3 botones) no cabía en una fila → el texto se rompía palabra por palabra y "Aplicar" se cortaba. Ahora, cuando `months === 1`, el footer **se apila** (texto arriba, botones abajo). En 2 meses (Campañas) queda igual.

## Verificación
Backend `tsc --noEmit` EXIT 0 · Frontend `tsc --noEmit` EXIT 0 · `vite build` EXIT 0.

## Pendiente de desplegar
- **Frontend:** `cd frontend && npm run build:prod` + `pm2 restart chateam-frontend`.
- **Backend** (para activar el endpoint `/quick-messages/ai/redraft`): `pm2 restart node-1 node-2`.
