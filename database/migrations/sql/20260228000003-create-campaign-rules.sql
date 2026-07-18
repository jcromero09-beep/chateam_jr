-- ============================================================
-- Migración: CampaignRules + CampaignRuleLogs
-- Fase 3: Motor de Reglas Automatizadas
-- Fecha: 2026-02-28
-- ============================================================

-- Tabla CampaignRules: Reglas dinámicas creadas por el usuario
CREATE TYPE "enum_CampaignRules_scope" AS ENUM ('account', 'campaign', 'adset', 'ad');
CREATE TYPE "enum_CampaignRules_frequency" AS ENUM ('every_15min', 'every_30min', 'hourly', 'every_6h', 'daily');
CREATE TYPE "enum_CampaignRules_status" AS ENUM ('active', 'paused', 'error');

CREATE TABLE IF NOT EXISTS "CampaignRules" (
  "id" SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "scope" "enum_CampaignRules_scope" NOT NULL DEFAULT 'campaign',
  "scopeIds" JSONB,
  "conditions" JSONB NOT NULL,
  "actions" JSONB NOT NULL,
  "notificationPhones" JSONB,
  "frequency" "enum_CampaignRules_frequency" NOT NULL DEFAULT 'hourly',
  "cooldownMinutes" INTEGER NOT NULL DEFAULT 60,
  "status" "enum_CampaignRules_status" NOT NULL DEFAULT 'active',
  "lastExecutedAt" TIMESTAMP WITH TIME ZONE,
  "lastTriggeredAt" TIMESTAMP WITH TIME ZONE,
  "executionCount" INTEGER DEFAULT 0,
  "triggerCount" INTEGER DEFAULT 0,
  "consecutiveErrors" INTEGER DEFAULT 0,
  "createdBy" INTEGER REFERENCES "Users"("id"),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX "cr_company_id" ON "CampaignRules" ("companyId");
CREATE INDEX "cr_status" ON "CampaignRules" ("status");
CREATE INDEX "cr_company_status" ON "CampaignRules" ("companyId", "status");

-- Tabla CampaignRuleLogs: Historial de ejecuciones de reglas
CREATE TYPE "enum_CampaignRuleLogs_result" AS ENUM ('success', 'failed', 'skipped', 'cooldown');

CREATE TABLE IF NOT EXISTS "CampaignRuleLogs" (
  "id" SERIAL PRIMARY KEY,
  "ruleId" INTEGER NOT NULL REFERENCES "CampaignRules"("id") ON DELETE CASCADE,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
  "campaignId" VARCHAR(50),
  "campaignName" VARCHAR(255),
  "executedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "conditionsMet" BOOLEAN NOT NULL DEFAULT false,
  "metricsSnapshot" JSONB,
  "actionsTaken" JSONB,
  "result" "enum_CampaignRuleLogs_result" NOT NULL DEFAULT 'skipped',
  "error" TEXT,
  "notificationsSent" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX "crl_rule_id" ON "CampaignRuleLogs" ("ruleId");
CREATE INDEX "crl_company_id" ON "CampaignRuleLogs" ("companyId");
CREATE INDEX "crl_executed_at" ON "CampaignRuleLogs" ("executedAt" DESC);
