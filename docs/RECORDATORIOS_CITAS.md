# Recordatorios de Citas

Este documento explica como funciona el envio de recordatorios de citas en ChaTeam, que mensaje se envia, cuando se programa y por que conexion sale.

## Resumen

Cuando se crea una cita, el sistema busca una plantilla activa de WhatsApp para la empresa y programa un recordatorio segun el campo `timing` de esa plantilla.

El valor `timing` representa horas antes de la cita. Por ejemplo:

- `timing = 24`: envia el recordatorio 24 horas antes de la cita.
- `timing = 2`: envia el recordatorio 2 horas antes de la cita.
- `timing = 0`: envia el recordatorio al llegar la hora de la cita.

Si no existe una plantilla activa de WhatsApp, no se programa recordatorio automatico desde la plantilla.

## Que Mensajes Se Envían

La plantilla de recordatorio tiene dos textos principales:

- `messageCreated`: mensaje inmediato cuando la cita fue creada.
- `messageConfirm`: mensaje para pedir confirmacion de la cita.
- `messageReminder`: mensaje de recordatorio cuando la cita ya esta confirmada.

El mensaje `messageCreated` se envia apenas se crea la cita. Sirve para informar los datos principales de la cita: fecha, hora, servicio y usuario/agente asignado.

El cron de recordatorios decide el texto segun el estado de la cita:

- Si la cita esta `confirmed`, usa `messageReminder`.
- Si la cita aun no esta confirmada, usa `messageConfirm`.
- Si la cita no tiene plantilla asociada, usa un mensaje default de recordatorio de cita.

Las variables soportadas en la plantilla son:

- `{{clientName}}`
- `{{date}}`
- `{{time}}`
- `{{service}}`
- `{{agent}}`
- `{{user}}`
- `{{title}}`
- `{{location}}`
- `{{meetingUrl}}`

## Cuando Se Programa

Al crear una cita se ejecuta `ReminderService.createDefaultReminders`.

Antes de programar el recordatorio futuro, el sistema intenta enviar `messageCreated` de forma inmediata usando `ReminderService.sendAppointmentCreatedMessage`. Ese envio es best-effort: si falla, la cita igual queda creada y el error se registra en logs.

Luego `createDefaultReminders`:

1. Verifica que la cita sea futura.
2. Busca la plantilla WhatsApp activa configurada para la cita o empresa.
3. Calcula `remindAt = appointment.startTime - template.timing horas`.
4. Crea una fila en `appointment_reminders` con estado `pending`.

El cron del backend revisa cada minuto los recordatorios pendientes:

```ts
status = "pending"
remindAt <= now
```

Solo procesa citas que no esten `cancelled` ni `completed`.

## Conexion Correcta de Envio

El recordatorio debe salir por la misma conexion asociada a la conversacion/cita. La resolucion actual es:

1. Si la cita tiene `ticketId`, usa el `whatsappId` del ticket.
2. Si no hay ticket, usa el `whatsappId` del contacto.
3. Si no hay ticket ni conexion en el contacto, usa como ultimo recurso una conexion `CONNECTED` de la empresa.

Si existe una conexion original, pero ya no esta `CONNECTED`, el recordatorio falla con error claro. Esto evita que el mensaje salga por otro numero equivocado.

## Envio y Persistencia

El cron crea o reutiliza el ticket del contacto y envia el texto con `CoexistenceAwareTextSender`.

Ese sender respeta coexistencia:

- Si el ticket esta en coexistencia, enruta por el router central y aplica el canal/fallback configurado.
- Si el ticket no esta en coexistencia, usa el flujo legacy de WhatsApp/Baileys.

Cuando el router central ya persiste el mensaje, el cron no crea duplicado. Si el envio legacy no persiste automaticamente, el cron crea el registro en `Messages`.

## Casos de Falla

Un recordatorio puede marcarse como `failed` cuando:

- El contacto no tiene numero.
- La cita, contacto y recordatorio pertenecen a empresas distintas.
- La conexion original del ticket/contacto no esta `CONNECTED`.
- No hay ninguna conexion `CONNECTED` disponible para la empresa.
- El envio por WhatsApp falla.

El motivo queda guardado en `appointment_reminders.errorMessage`.

## Consideraciones Operativas

Despues de cambiar esta logica hay que reiniciar el backend para que el cron tome el codigo nuevo.

Si tambien se usa el worker de colas para `AppointmentReminder`, reiniciar el worker.

Los cambios de `timing` aplican a recordatorios creados despues del cambio. Las filas ya existentes en `appointment_reminders` conservan su `remindAt` anterior, salvo que la cita se reprograme o se regenere el recordatorio.
