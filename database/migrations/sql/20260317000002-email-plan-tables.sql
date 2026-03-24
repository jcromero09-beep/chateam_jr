-- =====================================================
-- MIGRACIÓN: Sistema de Planes de Email
-- Fecha: 2026-03-17
-- =====================================================

-- 1. Crear tabla EmailPlans
CREATE TABLE IF NOT EXISTS "EmailPlans" (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,
    description TEXT,
    "emailCreditsPerCycle" INTEGER NOT NULL DEFAULT 100,
    "maxEmailSendsPerDay" INTEGER NOT NULL DEFAULT 50,
    "maxTemplates" INTEGER NOT NULL DEFAULT 10,
    price DECIMAL(10,2) NOT NULL,
    recurrence VARCHAR(50) NOT NULL DEFAULT 'MENSUAL',
    "stripePriceId" VARCHAR(255),
    "stripeProductId" VARCHAR(255),
    "paypalProductId" VARCHAR(255),
    "paypalPlanId" VARCHAR(255),
    "isPublic" BOOLEAN DEFAULT true,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 2. Crear tabla CompanyEmailPlans (sin FK para evitar errores de referencia)
CREATE TABLE IF NOT EXISTS "CompanyEmailPlans" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "emailPlanId" INTEGER NOT NULL,
    "emailCreditsUsed" INTEGER DEFAULT 0,
    "emailCreditsTotal" INTEGER NOT NULL,
    "emailCreditsResetAt" TIMESTAMP,
    "dueDate" TIMESTAMP,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMP DEFAULT NOW(),
    "updatedAt" TIMESTAMP DEFAULT NOW()
);

-- 3. Agregar campos a Invoices para soportar planes de email
ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS "isEmailPlan" BOOLEAN DEFAULT false;
ALTER TABLE "Invoices" ADD COLUMN IF NOT EXISTS "emailPlanId" INTEGER;

-- 4. Crear índices
CREATE INDEX IF NOT EXISTS idx_company_email_plan_company ON "CompanyEmailPlans"("companyId");
CREATE INDEX IF NOT EXISTS idx_company_email_plan_email ON "CompanyEmailPlans"("emailPlanId");
CREATE INDEX IF NOT EXISTS idx_invoices_email_plan ON "Invoices"("isEmailPlan", "emailPlanId");

-- 5. Insertar planes de email por defecto ( seed )
INSERT INTO "EmailPlans" (name, description, "emailCreditsPerCycle", "maxEmailSendsPerDay", "maxTemplates", price, recurrence, "isPublic", "isActive")
VALUES
    ('Email Básico', 'Plan básico para envío de emails', 100, 50, 5, 9.99, 'MENSUAL', true, true),
    ('Email Profesional', 'Plan profesional con más créditos', 500, 200, 20, 29.99, 'MENSUAL', true, true),
    ('Email Enterprise', 'Plan enterprise con créditos ilimitados', 2000, 1000, 100, 99.99, 'MENSUAL', true, true)
ON CONFLICT (name) DO NOTHING;

-- =====================================================
-- FIN DE MIGRACIÓN
-- =====================================================
