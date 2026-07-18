# Spec — Citas / Agendas (Appointments) · chateam_jr

> Grupo CRM/Ventas. Método Spec-First (Playbook Fase 5). Evidencia: `archivo:línea` real (solo lectura) +
> Fase 1 `SPEC-FIRST/fase1/01-vision-y-alcance.md §3.8, §4.5` + Fase 2 `02-auditoria-tecnica.md`.
> Fecha: 2026-07-12.

## Propósito

Módulo de agendamiento: define servicios, disponibilidad por agente, reserva/reprograma/confirma/completa
citas de contactos, envía recordatorios automáticos por cola, sincroniza con Google Calendar/Outlook y
sugiere horarios con IA. Cierra el ciclo comercial permitiendo convertir una conversación en una cita
gestionada con recordatorios y trazabilidad. 10 tablas dedicadas, 8 páginas de UI (Fase 1 §3.8).

## Actores y capacidades

- **El usuario puede** crear/editar/eliminar servicios agendables (`GET/POST/PUT/DELETE /appointments/services`).
- **El usuario puede** definir disponibilidad por agente, en bloque, y bloqueos
  (`POST /appointments/availability`, `/availability/bulk`, `/availability/blocks`).
- **El usuario puede** consultar slots disponibles y el calendario por fecha/día
  (`GET /appointments/availability/slots`, `/calendar/dates`, `/calendar/day`).
- **El usuario puede** reservar, ver, actualizar, reprogramar, cancelar, confirmar y completar citas
  (`POST /appointments/appointments`, `.../:id/reschedule|cancel|confirm|complete`).
- **El usuario puede** gestionar plantillas de recordatorio y ver historial/estadísticas de recordatorios
  (`/appointments/reminders/templates`, `/reminders/history`, `/reminders/stats`).
- **El sistema permite** sincronizar citas con Google Calendar y Outlook
  (`/calendar/google/setup`, `/calendar/outlook/setup`, `CalendarSyncService.ts`).
- **El sistema permite** sugerir y optimizar horarios con IA
  (`GET /appointments/ai/suggestions`, `/ai/optimize`, tabla `appointment_ai_suggestions`).
- **El sistema permite** enviar recordatorios automáticos vía cola Bull (`AppointmentReminder`/
  `SendAppointmentReminder`).

## Rutas/Controladores (evidencia) y modelo de datos

Todas montadas bajo prefijo `/appointments` (`routes/index.ts:567`), `isAuth` salvo el callback OAuth de
Google. Controlador único `AppointmentController` (`controllers/AppointmentController.ts`).

| Método | Ruta (prefijo `/appointments`) | Handler | Evidencia |
|---|---|---|---|
| GET/POST/PUT/DELETE | `/services[/:id]` | `listServices`/`createService`/`updateService`/`deleteService` | `routes/appointmentRoutes.ts:9-12` |
| GET | `/availability/slots` | `getAvailableSlots` | `routes/appointmentRoutes.ts:16` |
| POST | `/availability`, `/availability/bulk` | `setAvailability`, `saveAvailabilityBulk` | `:17-18` |
| GET/POST/DELETE | `/availability/blocks[/:id]` | `getCompanyBlocks`/`createBlock`/`deleteBlock` | `:20-22` |
| GET | `/calendar/dates`, `/calendar/day` | `getAppointmentDates`, `getAppointmentsByDate` | `:36-37` |
| GET | `/appointments[/:id]` | `getAppointments`, `getAppointmentById` | `:41-42` |
| POST | `/appointments` | `createBooking` | `routes/appointmentRoutes.ts:43` |
| PUT/DELETE | `/appointments/:id` | `updateAppointment`, `deleteAppointment` | `:44-45` |
| POST | `/appointments/:id/reschedule|cancel|confirm|complete` | `reschedule/cancel/confirm/complete` | `:46-49` |
| POST/GET/DELETE | `/calendar/google\|outlook/*` | `setupGoogleSync`/`setupOutlookSync`/`getUserSyncs`/`disableSync` | `:53-58` |
| GET | `/calendar/google/callback` | `handleGoogleCallback` (**sin isAuth**, OAuth) | `routes/appointmentRoutes.ts:58` |
| GET/POST | `/ai/suggestions[...]`, `/ai/optimize` | `getAISuggestions`/`applySuggestion`/`optimizeSchedule` | `:62-65` |
| GET/POST/PUT/DELETE | `/reminders/templates[/:id]` | CRUD plantillas + `toggleTemplate` | `:69-73` |
| GET | `/reminders/history`, `/reminders/stats` | `getReminderHistory`, `getReminderStats` | `:77-78` |
| GET/POST | `/availability/blocks-for-date`, `/mark-booked`, `/release/:appointmentId` | gestión de bloqueo de slot | `:82-84` |

**Modelo de datos (tablas, `models/Appointments/`):** `Appointment.ts` (`appointments`, con
`rescheduledFrom/To` self-FK), `AppointmentService.ts` (`appointment_services`), `AppointmentAvailability.ts`
(`appointment_availability`, 143 filas), `AppointmentBlock.ts` (`appointment_blocks`),
`AppointmentReminder.ts` (`appointment_reminders`), `AppointmentCalendarSync.ts`
(`appointment_calendar_sync(s)`), `AppointmentAnalytics.ts` (`appointment_analytics`),
`AppointmentAISuggestion.ts` (`appointment_ai_suggestions`), `ReminderTemplate.ts` (`reminder_templates`).

## Flujos clave

**Happy path — agendar una cita:**
1. El agente (o el contacto vía bot/IA) elige un servicio (`appointment_services`) y un slot disponible
   (`GET /availability/slots`).
2. `POST /appointments/appointments` → `createBooking` crea el `appointment` con `contactId`/`ticketId`;
   opcionalmente `POST /availability/mark-booked` marca el bloque como ocupado.
3. Se agenda un recordatorio (`appointment_reminders`, cola `AppointmentReminder`).
4. Si hay sync activa, se replica a Google/Outlook (`CalendarSyncService`).

**Happy path — reprogramar:**
1. `POST /appointments/:id/reschedule` → nuevo slot; `appointments.rescheduledFrom/To` enlaza el histórico.
2. Se libera el bloque anterior (`/availability/release/:appointmentId`) y se marca el nuevo.

**Ramas de error:**
- *Sin disponibilidad configurada:* `appointment_availability` con pocos bloques (143 filas totales) → no hay
  slots que ofrecer (Fase 1 §4.5).
- *Doble-booking:* no se verificó en código validación de solapamiento; riesgo de dos citas en el mismo slot
  (pendiente, Fase 1 §4.5).
- *Recordatorio no enviado:* si el worker de colas está caído (Fase 2 C-4), `SendAppointmentReminder` no se
  procesa y la cita queda sin recordatorio.
- *OAuth Google:* `/calendar/google/callback` no lleva `isAuth` (necesario para el redirect de OAuth); debe
  validar `state` para evitar CSRF.

## Deuda/bugs conocidos (Fase 2)

- **C-4 (P0)** — Worker de colas caído: los recordatorios automáticos (`AppointmentReminder`/
  `SendAppointmentReminder`) no se procesan hasta reparar el worker (`02-auditoria-tecnica.md:19,51`).
- **Validación de solapamiento no confirmada** — riesgo de doble-booking; sin lock de slot verificado
  (Fase 1 §4.5).
- **Callback OAuth sin `state` verificado** — `handleGoogleCallback` sin `isAuth`; revisar anti-CSRF y
  scope de `companyId` (Fase 2 §1, multi-tenant sin defensa en profundidad).
- **Secretos de sync en claro** — tokens de Google/Outlook deberían cifrarse en reposo (alineado a S-9 P1,
  `02-auditoria-tecnica.md:26,39`).

## Criterios de aceptación (Given/When/Then, testables)

1. **Given** un servicio y un bloque de disponibilidad de la company X, **When** un agente hace
   `POST /appointments/appointments` con un slot libre, **Then** responde 201/200, se crea un `appointment`
   con `companyId=X` y (si aplica) el bloque queda marcado como ocupado.
2. **Given** una cita existente, **When** se hace `POST /appointments/:id/reschedule` a otro slot, **Then**
   la cita apunta al nuevo horario, `rescheduledFrom/To` queda enlazado y el slot anterior se libera.
3. **Given** un slot ya reservado, **When** otro agente intenta reservar el mismo slot, **Then** la segunda
   reserva es rechazada (no se crean dos `appointments` en el mismo bloque).
4. **Given** el worker de colas operativo y una cita futura con plantilla de recordatorio activa, **When**
   se alcanza la ventana del recordatorio, **Then** se registra un envío en `/reminders/history`.
5. **Given** un agente de la company X, **When** hace `GET /appointments/appointments`, **Then** responde
   200 y ningún registro pertenece a otra company.
6. **Given** una sync de Google configurada, **When** se crea/actualiza una cita, **Then** el evento se
   refleja en el calendario externo (o queda registrado el intento en `appointment_calendar_sync`).
