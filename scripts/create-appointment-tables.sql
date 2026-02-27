-- Script para crear las tablas de Appointments
-- Ejecutar con: psql -h localhost -p 5432 -U postgres -d chateam -f scripts/create-appointment-tables.sql

-- Tabla de servicios de citas
CREATE TABLE IF NOT EXISTS "appointment_services" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "duration" INTEGER NOT NULL DEFAULT 30,
    "price" DECIMAL(10,2) DEFAULT 0,
    "currency" VARCHAR(10) DEFAULT 'USD',
    "bufferTime" INTEGER DEFAULT 0,
    "maxAdvanceBooking" INTEGER DEFAULT 30,
    "minAdvanceBooking" INTEGER DEFAULT 0,
    "maxAttendees" INTEGER DEFAULT 1,
    "requiresApproval" BOOLEAN DEFAULT false,
    "isActive" BOOLEAN DEFAULT true,
    "color" VARCHAR(20) DEFAULT '#3788d8',
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla principal de citas
CREATE TABLE IF NOT EXISTS "appointments" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "serviceId" BIGINT REFERENCES "appointment_services"("id") ON DELETE SET NULL,
    "userId" BIGINT REFERENCES "Users"("id") ON DELETE SET NULL,
    "contactId" BIGINT REFERENCES "Contacts"("id") ON DELETE SET NULL,
    "ticketId" BIGINT REFERENCES "Tickets"("id") ON DELETE SET NULL,
    "title" VARCHAR(255),
    "description" TEXT,
    "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "duration" INTEGER,
    "timezone" VARCHAR(50) DEFAULT 'UTC',
    "status" VARCHAR(50) DEFAULT 'scheduled',
    "attendeeName" VARCHAR(255),
    "attendeeEmail" VARCHAR(255),
    "attendeePhone" VARCHAR(50),
    "attendeeCount" INTEGER DEFAULT 1,
    "location" VARCHAR(255),
    "locationType" VARCHAR(50) DEFAULT 'in_person',
    "meetingUrl" TEXT,
    "meetingPlatform" VARCHAR(50),
    "notes" TEXT,
    "internalNotes" TEXT,
    "cancellationReason" TEXT,
    "rescheduledFrom" BIGINT REFERENCES "appointments"("id") ON DELETE SET NULL,
    "rescheduledTo" BIGINT REFERENCES "appointments"("id") ON DELETE SET NULL,
    "googleCalendarEventId" VARCHAR(255),
    "outlookCalendarEventId" VARCHAR(255),
    "reminderSent" BOOLEAN DEFAULT false,
    "confirmationSent" BOOLEAN DEFAULT false,
    "aiSuggested" BOOLEAN DEFAULT false,
    "aiOptimizationData" JSONB,
    "metadata" JSONB DEFAULT '{}',
    "createdBy" BIGINT REFERENCES "Users"("id") ON DELETE SET NULL,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "cancelledAt" TIMESTAMP WITH TIME ZONE,
    "confirmedAt" TIMESTAMP WITH TIME ZONE,
    "completedAt" TIMESTAMP WITH TIME ZONE
);

-- Tabla de disponibilidad
CREATE TABLE IF NOT EXISTS "appointment_availability" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "userId" BIGINT NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "serviceId" BIGINT REFERENCES "appointment_services"("id") ON DELETE SET NULL,
    "dayOfWeek" INTEGER NOT NULL CHECK ("dayOfWeek" >= 0 AND "dayOfWeek" <= 6),
    "startTime" TIME NOT NULL,
    "endTime" TIME NOT NULL,
    "isAvailable" BOOLEAN DEFAULT true,
    "timezone" VARCHAR(50) DEFAULT 'UTC',
    "effectiveFrom" DATE,
    "effectiveUntil" DATE,
    "recurrenceRule" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de bloqueos/excepciones
CREATE TABLE IF NOT EXISTS "appointment_blocks" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "userId" BIGINT NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "title" VARCHAR(255) NOT NULL,
    "startTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "endTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "reason" TEXT,
    "isRecurring" BOOLEAN DEFAULT false,
    "recurrenceRule" TEXT,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de recordatorios
CREATE TABLE IF NOT EXISTS "appointment_reminders" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "appointmentId" BIGINT NOT NULL REFERENCES "appointments"("id") ON DELETE CASCADE,
    "reminderType" VARCHAR(50) NOT NULL DEFAULT 'email',
    "remindAt" TIMESTAMP WITH TIME ZONE NOT NULL,
    "minutesBefore" INTEGER DEFAULT 60,
    "status" VARCHAR(50) DEFAULT 'pending',
    "sentAt" TIMESTAMP WITH TIME ZONE,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de sincronización con calendarios externos
CREATE TABLE IF NOT EXISTS "appointment_calendar_syncs" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "userId" BIGINT NOT NULL REFERENCES "Users"("id") ON DELETE CASCADE,
    "provider" VARCHAR(50) NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "tokenExpiry" TIMESTAMP WITH TIME ZONE,
    "calendarId" VARCHAR(255),
    "syncEnabled" BOOLEAN DEFAULT true,
    "lastSyncAt" TIMESTAMP WITH TIME ZONE,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de sugerencias de IA
CREATE TABLE IF NOT EXISTS "appointment_ai_suggestions" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "contactId" BIGINT NOT NULL REFERENCES "Contacts"("id") ON DELETE CASCADE,
    "serviceId" BIGINT REFERENCES "appointment_services"("id") ON DELETE SET NULL,
    "suggestedStartTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "suggestedEndTime" TIMESTAMP WITH TIME ZONE NOT NULL,
    "confidence" DECIMAL(5,4) DEFAULT 0,
    "reasoning" TEXT,
    "factors" JSONB DEFAULT '{}',
    "status" VARCHAR(50) DEFAULT 'pending',
    "appliedAt" TIMESTAMP WITH TIME ZONE,
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabla de analytics
CREATE TABLE IF NOT EXISTS "appointment_analytics" (
    "id" BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "userId" BIGINT REFERENCES "Users"("id") ON DELETE SET NULL,
    "serviceId" BIGINT REFERENCES "appointment_services"("id") ON DELETE SET NULL,
    "date" DATE NOT NULL,
    "totalAppointments" INTEGER DEFAULT 0,
    "completedAppointments" INTEGER DEFAULT 0,
    "cancelledAppointments" INTEGER DEFAULT 0,
    "noShowAppointments" INTEGER DEFAULT 0,
    "totalDuration" INTEGER DEFAULT 0,
    "averageRating" DECIMAL(3,2),
    "revenue" DECIMAL(10,2) DEFAULT 0,
    "metadata" JSONB DEFAULT '{}',
    "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índices para optimización
CREATE INDEX IF NOT EXISTS "idx_appointments_company" ON "appointments"("companyId");
CREATE INDEX IF NOT EXISTS "idx_appointments_user" ON "appointments"("userId");
CREATE INDEX IF NOT EXISTS "idx_appointments_start" ON "appointments"("startTime");
CREATE INDEX IF NOT EXISTS "idx_appointments_status" ON "appointments"("status");
CREATE INDEX IF NOT EXISTS "idx_availability_company_user" ON "appointment_availability"("companyId", "userId");
CREATE INDEX IF NOT EXISTS "idx_availability_day" ON "appointment_availability"("dayOfWeek");
CREATE INDEX IF NOT EXISTS "idx_blocks_company" ON "appointment_blocks"("companyId");
CREATE INDEX IF NOT EXISTS "idx_blocks_user" ON "appointment_blocks"("userId");
CREATE INDEX IF NOT EXISTS "idx_blocks_time" ON "appointment_blocks"("startTime", "endTime");

-- Mensaje de confirmación
DO $$
BEGIN
    RAISE NOTICE 'Tablas de appointments creadas correctamente';
END $$;
