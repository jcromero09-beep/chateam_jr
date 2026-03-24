# Sistema de Mensajes de Seguimiento v2.0

## Resumen de Funcionalidades

Sistema de seguimiento automático de tickets que se dispara cuando se asigna una etiqueta Kanban. Incluye doble validación (tag + ticket), cancelación por respuesta del cliente, y soporte para múltiples seguimientos.

---

## Archivos Modificados

### Backend

| Archivo | Descripción |
|---------|-------------|
| [workers/stageClassifier.worker.ts](workers/stageClassifier.worker.ts) | Lógica principal del sistema de followup |
| [models/Ticket.ts](models/Ticket.ts) | Campo `followupEnabled` en el modelo |
| [controllers/TicketController.ts](controllers/TicketController.ts) | Endpoint `toggleFollowup` |
| [routes/ticketRoutes.ts](routes/ticketRoutes.ts) | Ruta `PUT /tickets/:ticketId/followup` |
| [services/TicketServices/ShowTicketService.ts](services/TicketServices/ShowTicketService.ts) | Incluye `followupEnabled` en atributos |

### Frontend

| Archivo | Descripción |
|---------|-------------|
| [frontend/src/components/ContactDrawer/index.tsx](frontend/src/components/ContactDrawer/index.tsx) | Toggle switch para desactivar followup por ticket |

### Base de Datos

| Archivo | Descripción |
|---------|-------------|
| [database/migrations/add_followup_enabled_to_tickets.sql](database/migrations/add_followup_enabled_to_tickets.sql) | Migración para agregar columna `followupEnabled` |

---

## Funcionalidades Implementadas

### 1. Trigger por Asignación de Etiqueta Kanban
- **Cuándo:** Cuando se asigna una etiqueta Kanban a un ticket
- **Qué hace:** Cancela followups anteriores y programa uno nuevo
- **Ubicación:** `handleTagAssignment()` en `stageClassifier.worker.ts`

### 2. Doble Validación
- **Tag.followupEnabled:** Configuración a nivel de etiqueta
- **Ticket.followupEnabled:** Configuración a nivel de ticket
- **Resultado:** Ambos deben estar activos para enviar followup

### 3. Cancelación por Respuesta del Cliente
- **Verificación:** Antes de enviar, verifica si el cliente respondió después de `assignedAt`
- **Si respondió:** Cancela el followup, no envía nada
- **Ubicación:** `hasClientResponded()` en `stageClassifier.worker.ts`

### 4. Soporte para Múltiples Followups
- **Hasta 3 seguimientos** con delays personalizados
- **followupDelay1/2/3:** Horas de espera entre cada mensaje
- **followupMessage1/2/3:** Contenido de cada mensaje

### 5. Contexto de Conversación para IA
- Lee los últimos 20 mensajes del ticket
- Pasa el contexto al agente IA para redactar mensajes personalizados

### 6. Respeto de Horarios de Atención
- Verifica `Whatsapp.schedules` antes de enviar
- Si está fuera de horario, reagenda para la próxima hora válida

### 7. Toggle por Ticket (Frontend)
- **Ubicación:** ContactDrawer → Configuraciones
- **Comportamiento:** Switch para activar/desactivar followup
- **Endpoint:** `PUT /tickets/:ticketId/followup`

---

## Interfaces Principales

### FollowupJobData
```typescript
interface FollowupJobData {
  ticketId: number;
  tagId?: number;
  tagKey: string;
  companyId: number;
  contactName?: string;
  conversationContext?: string;
  currentFollowup: number;
  followupMessage1: string;
  followupDelay1: number;
  followupMessage2?: string;
  followupDelay2?: number;
  followupMessage3?: string;
  followupDelay3?: number;
  followupCount: number;
  assignedAt?: string;
  ticketFollowupEnabled?: boolean;
}
```

---

## Endpoints

| Método | Ruta | Descripción |
|--------|------|-------------|
| PUT | `/tickets/:ticketId/followup` | Toggle followupEnabled para un ticket |

---

## Colas Bull

| Cola | Proceso | Descripción |
|------|---------|-------------|
| `FollowupQueue` | `SendFollowup` | Procesa el envío de seguimientos |

---

## Configuración de Tags

Los tags Kanban pueden tener configurados:
- `followupEnabled`: Habilitar/deshabilitar seguimiento
- `followupCount`: Número de seguimientos (1-3)
- `followupMessage1/2/3`: Mensajes a enviar
- `followupDelay1/2/3`: Delay en horas

---

## Notas

- El campo `followupEnabled` en tickets tiene valor por defecto `true`
- La migración SQL ya fue ejecutada (101 tickets con valor true)
- El sistema es backward compatible con tags que no tengan configuración de followup
