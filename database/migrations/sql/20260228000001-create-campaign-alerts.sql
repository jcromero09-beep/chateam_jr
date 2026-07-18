-- ============================================================
-- Migración: Crear tabla CampaignAlerts
-- Fecha: 2026-02-28
-- Descripción: Sistema de alertas de rendimiento para campañas Meta Ads
-- ============================================================

-- Crear tipos ENUM
CREATE TYPE "enum_CampaignAlerts_alertType" AS ENUM (
  'cpa_high',
  'ctr_low',
  'budget_depleted',
  'frequency_high',
  'no_conversions',
  'spend_anomaly',
  'no_impressions',
  'performance_drop',
  'custom'
);

CREATE TYPE "enum_CampaignAlerts_severity" AS ENUM (
  'critical',
  'warning',
  'info'
);

CREATE TYPE "enum_CampaignAlerts_status" AS ENUM (
  'active',
  'acknowledged',
  'resolved'
);

-- Crear tabla
CREATE TABLE IF NOT EXISTS "CampaignAlerts" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE,
  "campaignId" VARCHAR(50) NOT NULL,
  "campaignName" VARCHAR(255) NOT NULL,
  "alertType" "enum_CampaignAlerts_alertType" NOT NULL,
  "severity" "enum_CampaignAlerts_severity" NOT NULL DEFAULT 'warning',
  "title" VARCHAR(255) NOT NULL,
  "message" TEXT NOT NULL,
  "metric" VARCHAR(50),
  "currentValue" FLOAT,
  "thresholdValue" FLOAT,
  "status" "enum_CampaignAlerts_status" NOT NULL DEFAULT 'active',
  "acknowledgedBy" INTEGER REFERENCES "Users"("id") ON UPDATE CASCADE ON DELETE SET NULL,
  "acknowledgedAt" TIMESTAMP WITH TIME ZONE,
  "resolvedAt" TIMESTAMP WITH TIME ZONE,
  "metadata" JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Crear índices
CREATE INDEX "campaign_alerts_company_id" ON "CampaignAlerts" ("companyId");
CREATE INDEX "campaign_alerts_campaign_id" ON "CampaignAlerts" ("campaignId");
CREATE INDEX "campaign_alerts_alert_type" ON "CampaignAlerts" ("alertType");
CREATE INDEX "campaign_alerts_status" ON "CampaignAlerts" ("status");
CREATE INDEX "campaign_alerts_severity" ON "CampaignAlerts" ("severity");

-- Índice compuesto para búsqueda eficiente de alertas activas por empresa
CREATE INDEX "campaign_alerts_company_status" ON "CampaignAlerts" ("companyId", "status");

-- Índice compuesto para deduplicación de alertas
CREATE INDEX "campaign_alerts_dedup" ON "CampaignAlerts" ("companyId", "campaignId", "alertType", "status");

-- ============================================================
-- Para revertir:
-- DROP TABLE IF EXISTS "CampaignAlerts";
-- DROP TYPE IF EXISTS "enum_CampaignAlerts_alertType";
-- DROP TYPE IF EXISTS "enum_CampaignAlerts_severity";
-- DROP TYPE IF EXISTS "enum_CampaignAlerts_status";
-- ============================================================
