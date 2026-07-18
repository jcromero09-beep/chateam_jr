-- =====================================================
-- Hacer AIProviderConfig GLOBAL (companyId nullable)
-- ChatEAM JR - 2026-03-16
-- =====================================================

-- 1. Primero, hacer companyId nullable
ALTER TABLE "AIProviderConfigs" ALTER COLUMN "companyId" DROP NOT NULL;

-- 2. Opcional: Crear un índice para proveedores globales
CREATE INDEX IF NOT EXISTS "idx_ai_provider_global" ON "AIProviderConfigs" ("companyId") WHERE "companyId" IS NULL;

-- 3. Verificar estructura
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'AIProviderConfigs' AND column_name = 'companyId';
