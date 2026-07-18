# Flujo automatico de mensajes de campana

Este documento explica como ChatEAM JR detecta, guarda y consulta mensajes que vienen desde campanas publicitarias, especialmente Click-to-WhatsApp / CTWA.

## Objetivo

Cuando un cliente escribe desde un anuncio, el sistema debe guardar una evidencia en `CampaignMessages`. Ese registro permite saber que ticket, contacto, mensaje y conexion pertenecen a una campana.

La tabla clave es:

```text
CampaignMessages
```

Campos principales:

```text
companyId       empresa duena del dato
contactId       contacto que escribio
messageId       mensaje exacto guardado en Messages
ticketId        ticket/conversacion donde entro el mensaje
whatsappId      conexion por donde entro
sourceId        id del anuncio/fuente cuando el proveedor lo envia
sourceType      tipo de fuente: EXTERNAL_AD, ad, MANUAL_ASSIGNMENT, etc.
sourceUrl       URL del anuncio o fuente
headline        titulo del anuncio
body            texto del anuncio
ctwaClid        click id de Click-to-WhatsApp si Meta lo envia
channel         whatsapp, meta, facebook, etc.
rawData         payload original de la metadata de campana
```

## Fuentes que detectan campanas

### 1. WhatsApp Web / Baileys

Archivo:

```text
services/WbotServices/wbotMessageListener.ts
```

Flujo:

1. Llega un mensaje entrante por WhatsApp.
2. El listener procesa contacto, ticket y mensaje.
3. Si el mensaje trae `contextInfo.externalAdReply` y no es `fromMe`, se considera mensaje de campana.
4. Se busca el mensaje ya guardado en `Messages` usando `wid = msg.key.id`.
5. Se llama a `CreateCampaignMessageService`.
6. Se crea una fila en `CampaignMessages` con `sourceType = EXTERNAL_AD` y `channel = whatsapp`.

Esta es la ruta que hoy esta funcionando para los registros recientes de `chateam Demo` y `AriaSofts`.

### 2. WhatsApp Web / Baileys fallback

Archivo:

```text
services/WbotServices/wbotMessageListener.ts
```

Flujo:

1. Algunos mensajes salientes pueden traer `contextInfo.conversionSource`.
2. Si no existe ya un `CampaignMessage` para ese `messageId` o `ticketId`, el sistema crea un registro fallback.
3. Se guarda como `sourceType = FB_ADS_REPLY_CONTEXT`.

Este caso sirve como respaldo cuando WhatsApp no entrega el `externalAdReply` completo en el mensaje entrante.

### 3. Meta Cloud API / Coexistencia

Archivo:

```text
services/MetaServices/metaMessageListener.ts
```

Flujo:

1. Llega un webhook de Meta.
2. El listener resuelve contacto, ticket y mensaje.
3. El detector revisa metadata CTWA en dos posibles ubicaciones:

```text
message.referral
message.context.referral
```

4. Si existe `referral` y el mensaje no es `fromMe`, se llama a `CreateCampaignMessageService`.
5. Se crea una fila en `CampaignMessages` con `channel = meta`.

Nota importante: Meta puede enviar `referral` directamente en el mensaje, no necesariamente dentro de `context.referral`. El listener debe soportar ambas formas.

### 4. Facebook / Instagram

Archivo:

```text
services/FacebookServices/facebookMessageListener.ts
```

Flujo:

1. Llega un evento social.
2. Se revisa `webhookEvent.referral` o `message.referral`.
3. Si hay referral y no es `fromMe`, se crea `CampaignMessage`.

### 5. Asignacion manual

Archivo:

```text
controllers/CampaignMessageController.ts
```

Si el proveedor no envio metadata de campana, un usuario/admin puede asignar manualmente una campana a un ticket. En ese caso `sourceType` puede aparecer como `MANUAL_ASSIGNMENT`.

## Servicio que guarda el registro

Archivo:

```text
services/CampaignMessageServices/CreateCampaignMessageService.ts
```

Responsabilidad:

1. Recibe los IDs ya resueltos: `companyId`, `contactId`, `messageId`, `ticketId`, `whatsappId`.
2. Recibe la evidencia de campana: `sourceId`, `sourceType`, `sourceUrl`, `headline`, `body`, `ctwaClid`, `thumbnail`, `channel`, `rawData`.
3. Inserta una fila en `CampaignMessages`.
4. Loguea si creo el registro o si fallo.

## Como saber si un ticket pertenece a una campana

La forma correcta es buscar filas en `CampaignMessages` por `ticketId`.

```sql
SELECT
  cm.id,
  cm."companyId",
  cm."ticketId",
  cm."messageId",
  cm."contactId",
  c.name AS contact_name,
  c.number,
  cm."whatsappId",
  w.name AS whatsapp_name,
  cm."sourceId",
  cm."sourceType",
  cm.headline,
  cm.body,
  cm."ctwaClid",
  cm.channel,
  cm."createdAt"
FROM "CampaignMessages" cm
LEFT JOIN "Contacts" c ON c.id = cm."contactId"
LEFT JOIN "Whatsapps" w ON w.id = cm."whatsappId"
WHERE cm."ticketId" = :ticketId
ORDER BY cm."createdAt" DESC;
```

Si esta consulta devuelve filas, el ticket tiene atribucion de campana.

## Como saber si un mensaje exacto pertenece a campana

```sql
SELECT
  cm.*,
  m.wid,
  m.body,
  m."fromMe",
  m."createdAt" AS message_created_at
FROM "CampaignMessages" cm
LEFT JOIN "Messages" m ON m.id = cm."messageId"
WHERE cm."messageId" = :messageId;
```

Si existe una fila, ese mensaje fue el que trajo la metadata de campana.

## Significado de sourceType

```text
EXTERNAL_AD
  Mensaje entrante con metadata de anuncio detectada por WhatsApp/Baileys.

ad
  Mensaje entrante con referral de Meta Cloud API. Meta normalmente manda source_type="ad".

FB_ADS_REPLY_CONTEXT
  Registro fallback desde conversionSource en contexto de respuesta.

MANUAL_ASSIGNMENT
  Campana asignada manualmente desde la interfaz.

SALES_IMPORT
  Registro creado por importacion de ventas, no necesariamente por mensaje entrante.
```

## Consultas de auditoria

Registros recientes por empresa:

```sql
SELECT
  cm.id,
  cm."companyId",
  c.name,
  c.number,
  cm."messageId",
  cm."ticketId",
  w.name AS whatsapp_name,
  cm."sourceId",
  cm."sourceType",
  cm.headline,
  cm.channel,
  cm."createdAt"
FROM "CampaignMessages" cm
LEFT JOIN "Contacts" c ON c.id = cm."contactId"
LEFT JOIN "Whatsapps" w ON w.id = cm."whatsappId"
WHERE cm."companyId" = :companyId
ORDER BY cm."createdAt" DESC
LIMIT 50;
```

Conteo por hora:

```sql
SELECT
  date_trunc('hour', cm."createdAt") AS hour,
  cm.channel,
  cm."sourceType",
  COUNT(*)
FROM "CampaignMessages" cm
WHERE cm."companyId" = :companyId
  AND cm."createdAt" >= now() - interval '48 hours'
GROUP BY 1, 2, 3
ORDER BY 1 DESC, 2, 3;
```

Mensajes guardados con metadata `referral` pero sin `CampaignMessage`:

```sql
SELECT
  m.id,
  m."companyId",
  m."ticketId",
  m.wid,
  m."fromMe",
  m."createdAt"
FROM "Messages" m
LEFT JOIN "CampaignMessages" cm ON cm."messageId" = m.id
WHERE m."companyId" = :companyId
  AND m."createdAt" >= now() - interval '48 hours'
  AND m."dataJson"::text ILIKE '%referral%'
  AND cm.id IS NULL
ORDER BY m."createdAt" DESC
LIMIT 50;
```

## Verificacion del 2026-05-26

Se verifico company `8`.

Resultado:

```text
Se estan creando CampaignMessages recientes por WhatsApp/Baileys.
Los registros recientes aparecen con sourceType=EXTERNAL_AD y channel=whatsapp.
Hay registros recientes en chateam Demo y AriaSofts.
```

Ejemplos encontrados:

```text
id=562 ticketId=1865 contact=593990906538 whatsapp=chateam Demo sourceType=EXTERNAL_AD createdAt=2026-05-26 11:28:55
id=561 ticketId=1815 contact=593981978965 whatsapp=chateam Demo sourceType=EXTERNAL_AD createdAt=2026-05-26 10:37:44
id=560 ticketId=1747 contact=593988404157 whatsapp=chateam Demo sourceType=EXTERNAL_AD createdAt=2026-05-26 10:20:38
```

Tambien se verifico el numero `593997645725`:

```text
Existe CampaignMessage id=533, ticketId=1582, sourceType=MANUAL_ASSIGNMENT, channel=facebook, createdAt=2026-05-22 11:00:04.
No aparece como auto-registro reciente de mensaje entrante.
```

## Reglas de diagnostico

Si un ticket no aparece como campana:

1. Revisar si existe fila en `CampaignMessages` por `ticketId`.
2. Si no existe, revisar si el mensaje tiene `externalAdReply`, `conversionSource` o `referral` en `Messages.dataJson`.
3. Si el proveedor no envio metadata, el sistema no puede atribuir automaticamente ese ticket.
4. En ese caso se debe usar asignacion manual o una regla adicional basada en conversiones externas.

Si el mensaje llega por Meta/coexistencia:

1. Revisar logs `[META-CAMPAIGN-AUDIT]`.
2. Confirmar si el payload trae `message.referral` o `message.context.referral`.
3. Confirmar que luego exista `CampaignMessages.channel = meta`.

## Conclusion operativa

El flujo automatico depende de que el proveedor entregue metadata de campana en el mensaje. Cuando esa metadata existe, el sistema debe guardar:

```text
Messages -> CampaignMessages
```

La prueba principal de atribucion es `CampaignMessages.ticketId`.

