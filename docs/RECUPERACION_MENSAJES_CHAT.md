# Recuperacion de mensajes faltantes en chats

Fecha de verificacion: 2026-07-11

## Objetivo

Agregar un boton en el chat para intentar recuperar mensajes que no se ven completos cuando WhatsApp/Baileys queda algunos minutos sin conexion o cuando llegan mensajes cifrados como placeholders.

El limite operativo definido es de 20 mensajes por intento.

## Que hace el boton

El boton aparece en el header del ticket cuando el ticket es de WhatsApp o grupo.

Archivo:

- `frontend/src/pages/Tickets.tsx`

Flujo:

1. El usuario abre un ticket.
2. Presiona el boton con icono de refrescar y tooltip `Recuperar mensajes faltantes`.
3. El frontend llama:

```http
POST /messages/ticket/:ticketId/recover
Content-Type: application/json

{
  "limit": 20
}
```

4. El frontend muestra un toast con el resultado:

- placeholders solicitados;
- placeholders ya resueltos;
- historial solicitado;
- fallidos;
- o que no hay mensajes recuperables.

## Endpoint backend

Archivo:

- `routes/messageRoutes.ts`
- `controllers/MessageController.ts`

Ruta:

```http
POST /messages/ticket/:ticketId/recover
```

Controlador:

```ts
recoverTicketMessages
```

El controlador toma:

- `ticketId` desde la URL;
- `companyId` y `userId` desde `req.user`;
- `limit` desde body o query, default 20.

Luego llama dinamicamente a:

```ts
services/MessageServices/RecoverTicketMessagesService.ts
```

## Servicio de recuperacion

Archivo:

- `services/MessageServices/RecoverTicketMessagesService.ts`

Reglas principales:

1. El limite se normaliza entre 1 y 20.
2. Busca el ticket por `ticketId + companyId`.
3. Obtiene la sesion Baileys real con `GetTicketWbot(ticket)`.
4. Verifica que la sesion soporte `requestPlaceholderResend`.
5. Busca mensajes del ticket con:

```sql
mediaType = 'ciphertext'
wid IS NOT NULL
```

6. Para cada placeholder recuperable:

- reconstruye el `WAMessageKey`;
- valida que no tenga mas de 14 dias;
- llama `wbot.requestPlaceholderResend(key, metadata)`;
- guarda metadata de recuperacion dentro de `Messages.dataJson.chateamRecovery`.

7. Si no hay suficientes placeholders y la sesion soporta historial:

- toma el primer mensaje visible del ticket como ancla;
- llama `wbot.fetchMessageHistory(remainingLimit, anchorKey, anchorTimestamp)`;
- guarda temporalmente el `requestId` en Redis por 10 minutos.

8. Cuando WhatsApp responde con history sync, `libs/wbot.ts` procesa la respuesta, filtra mensajes validos del mismo `remoteJid`, los inserta con `handleMessage` y emite socket:

```ts
company-${companyId}-messageRecovery
```

## Metodos Baileys usados

Baileys 7 expone ambos metodos:

```ts
requestPlaceholderResend(messageKey, msgData)
fetchMessageHistory(count, oldestMsgKey, oldestMsgTimestamp)
```

En sesiones remotas, `helpers/GetWhatsappWbot.ts` los proxya hacia el nodo donde vive la conexion.

## Prueba realizada

Primero se revisaron conexiones de company 1 y company 8.

Resultado:

- Company 1: `NominApp B` estaba en estado `PENDING`, no servia para prueba real.
- Company 8: conexiones WhatsApp conectadas disponibles:
  - `chateam Demo`, `whatsappId=14`
  - `AriaSofts`, `whatsappId=32`
  - `Jefe de Ventas`, `whatsappId=33`

Se buscaron placeholders `ciphertext` en company 1 y 8:

```text
0 placeholders ciphertext encontrados
```

Por eso no se pudo probar el camino principal `requestPlaceholderResend` con un placeholder real sin fabricar datos.

Se probo el camino real de historial con:

- companyId: 8
- conexion: `AriaSofts`
- whatsappId: 32
- ticketId: 8194
- limite: 1

Llamada probada por HTTP contra el backend local:

```http
POST http://localhost:3001/messages/ticket/8194/recover
{
  "limit": 1
}
```

Respuesta:

```json
{
  "success": true,
  "ticketId": 8194,
  "limit": 1,
  "ciphertextFound": 0,
  "placeholder": {
    "requested": 0,
    "alreadyResolved": 0,
    "alreadyRequested": 0,
    "failed": 0,
    "skipped": 0,
    "requests": []
  },
  "history": {
    "requested": true,
    "requestId": "3EB059ABBD9279DD92543C",
    "anchorMessageId": "3A45726EB7C02D3D058C",
    "count": 1
  },
  "message": "No habia placeholders; se solicito historial anterior al primer mensaje visible."
}
```

Conclusion de la prueba:

- El boton/endpoint llega al backend correctamente.
- La sesion Baileys de company 8 acepto la solicitud de historial.
- WhatsApp devolvio `requestId`, por lo que `fetchMessageHistory` funciona en esa conexion.
- Despues de esperar 15 segundos, el ticket seguia con 2 mensajes; es decir, WhatsApp no habia entregado todavia mensajes nuevos para ese pedido, o no habia historial adicional disponible para ese ancla.

## Limitaciones conocidas

1. Si no existen mensajes `ciphertext`, no se ejecuta `requestPlaceholderResend`.
2. La recuperacion de historial es asincrona; recibir `requestId` confirma que se solicito, pero no garantiza que WhatsApp entregue mensajes.
3. El historial depende de que WhatsApp tenga mensajes anteriores disponibles para ese chat y esa sesion.
4. El sistema no debe fabricar placeholders para probar en produccion, porque eso no prueba Baileys realmente y puede ensuciar la conversacion.
5. Si el ticket ya tiene el primer mensaje visible correcto, `fetchMessageHistory` puede no agregar nada.

## Como verificar en produccion

1. Abrir un ticket WhatsApp con mensajes faltantes.
2. Presionar `Recuperar mensajes faltantes`.
3. Revisar el toast:
   - `historial solicitado` significa que `fetchMessageHistory` fue aceptado.
   - `N solicitados` significa que se llamo `requestPlaceholderResend` para placeholders reales.
4. Esperar unos segundos.
5. Verificar si aparecen mensajes nuevos en el chat.
6. Si no aparecen, revisar logs por:

```text
RecoverTicketMessages
MessageRecovery
history response
```

7. Revisar en BD si `Messages.dataJson.chateamRecovery` fue actualizado para placeholders.

## Mejoras recomendadas

1. Mostrar en el toast el `requestId` cuando se solicite historial.
2. Escuchar el socket `company-${companyId}-messageRecovery` en frontend para mostrar un segundo toast cuando WhatsApp responda.
3. Agregar una pequena bitacora visible en el ticket: ultimo intento, cantidad solicitada, cantidad recuperada.
4. Agregar logs estructurados para el caso `history.requested=true`.
5. Agregar una prueba controlada en staging con un placeholder real para validar `requestPlaceholderResend` de punta a punta.
