-- Agregar columnas de Email Plan a la tabla companies
-- Fecha: 2026-03-17

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "emailCreditsTotal" BIGINT DEFAULT 0;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "activeEmailPlanId" INTEGER REFERENCES "EmailPlans"(id);
