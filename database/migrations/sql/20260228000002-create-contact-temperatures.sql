-- ============================================================
-- Migración: Crear tabla ContactTemperatures
-- Fecha: 2026-02-28
-- Descripción: Sistema de temperatura de contactos para segmentación inteligente
-- Fase 2 del plan Campaigns/Insights
-- ============================================================

-- Crear tipo ENUM para categoría
CREATE TYPE "enum_ContactTemperatures_category" AS ENUM ('cold', 'warm', 'hot');

-- Crear tabla
CREATE TABLE IF NOT EXISTS "ContactTemperatures" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "contactId" INTEGER NOT NULL REFERENCES "Contacts"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "temperature" FLOAT NOT NULL DEFAULT 0,
  "category" "enum_ContactTemperatures_category" NOT NULL DEFAULT 'cold',
  "lastMessageAt" TIMESTAMP WITH TIME ZONE,
  "lastTicketAt" TIMESTAMP WITH TIME ZONE,
  "messageCount30d" INTEGER DEFAULT 0,
  "ticketCount30d" INTEGER DEFAULT 0,
  "tagKey" VARCHAR(50),
  "reasons" JSONB,
  "lastRecalculatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE("companyId", "contactId")
);

-- Índices para consultas frecuentes
CREATE INDEX "ct_company_id" ON "ContactTemperatures" ("companyId");
CREATE INDEX "ct_contact_id" ON "ContactTemperatures" ("contactId");
CREATE INDEX "ct_category" ON "ContactTemperatures" ("category");
CREATE INDEX "ct_company_category" ON "ContactTemperatures" ("companyId", "category");
CREATE INDEX "ct_temperature" ON "ContactTemperatures" ("temperature" DESC);

-- ============================================================
-- Para revertir:
-- DROP TABLE IF EXISTS "ContactTemperatures";
-- DROP TYPE IF EXISTS "enum_ContactTemperatures_category";
-- ============================================================
