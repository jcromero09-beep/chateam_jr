-- ============================================================================
-- EMAIL MARKETING PHASE 1 — Columnas de Plan
-- ============================================================================
-- Agrega 8 columnas de feature gating para email marketing a la tabla Plans.
-- Actualiza los valores por plan: Starter, Pro, Enterprise.
-- SQL idempotente: se puede ejecutar multiples veces sin error.
--
-- Ejecutar con:
--   PGPASSWORD='...' psql -h localhost -U atendimento -d chateamjr -f email-phase1-plan-columns.sql
-- ============================================================================

-- ============================================================================
-- 1. AGREGAR COLUMNAS (idempotente con DO $$ / EXCEPTION)
-- ============================================================================

-- useEmailMarketing
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "useEmailMarketing" BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna useEmailMarketing ya existe, saltando.';
END $$;

-- useEmailAutomation
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "useEmailAutomation" BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna useEmailAutomation ya existe, saltando.';
END $$;

-- useEmailAbTesting
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "useEmailAbTesting" BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna useEmailAbTesting ya existe, saltando.';
END $$;

-- useEmailAiOptimization
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "useEmailAiOptimization" BOOLEAN DEFAULT false;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna useEmailAiOptimization ya existe, saltando.';
END $$;

-- maxEmailCampaignsPerMonth
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "maxEmailCampaignsPerMonth" INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna maxEmailCampaignsPerMonth ya existe, saltando.';
END $$;

-- maxEmailContactLists
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "maxEmailContactLists" INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna maxEmailContactLists ya existe, saltando.';
END $$;

-- maxEmailContactsPerList
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "maxEmailContactsPerList" INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna maxEmailContactsPerList ya existe, saltando.';
END $$;

-- maxEmailSendsPerDay
DO $$ BEGIN
  ALTER TABLE "Plans" ADD COLUMN "maxEmailSendsPerDay" INTEGER DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN
  RAISE NOTICE 'Columna maxEmailSendsPerDay ya existe, saltando.';
END $$;


-- ============================================================================
-- 2. ACTUALIZAR VALORES POR PLAN
-- ============================================================================

-- Plan ID 1 (Demo) — sin email marketing (ya tiene defaults false/0)
-- No requiere UPDATE explicito

-- Plan ID 2 (Starter) — email marketing basico
UPDATE "Plans"
SET
  "useEmailMarketing" = true,
  "useEmailAutomation" = false,
  "useEmailAbTesting" = false,
  "useEmailAiOptimization" = false,
  "maxEmailCampaignsPerMonth" = 10,
  "maxEmailContactLists" = 3,
  "maxEmailContactsPerList" = 500,
  "maxEmailSendsPerDay" = 500
WHERE id = 2;

-- Plan ID 4 (Pro) — email marketing avanzado
UPDATE "Plans"
SET
  "useEmailMarketing" = true,
  "useEmailAutomation" = true,
  "useEmailAbTesting" = true,
  "useEmailAiOptimization" = false,
  "maxEmailCampaignsPerMonth" = 50,
  "maxEmailContactLists" = 10,
  "maxEmailContactsPerList" = 5000,
  "maxEmailSendsPerDay" = 5000
WHERE id = 4;

-- Plan ID 8 (Enterprise) — email marketing completo
UPDATE "Plans"
SET
  "useEmailMarketing" = true,
  "useEmailAutomation" = true,
  "useEmailAbTesting" = true,
  "useEmailAiOptimization" = true,
  "maxEmailCampaignsPerMonth" = 999,
  "maxEmailContactLists" = 999,
  "maxEmailContactsPerList" = 999999,
  "maxEmailSendsPerDay" = 50000
WHERE id = 8;


-- ============================================================================
-- 3. VERIFICACION
-- ============================================================================

SELECT
  id,
  name,
  "useEmailMarketing",
  "useEmailAutomation",
  "useEmailAbTesting",
  "useEmailAiOptimization",
  "maxEmailCampaignsPerMonth",
  "maxEmailContactLists",
  "maxEmailContactsPerList",
  "maxEmailSendsPerDay"
FROM "Plans"
WHERE id IN (1, 2, 4, 8)
ORDER BY id;
