-- =====================================================
-- Agregar maxAgents a AISubplans
-- ChatEAM JR - 2026-03-16
-- =====================================================

-- Agregar columna maxAgents
ALTER TABLE "AISubplans" ADD COLUMN IF NOT EXISTS "maxAgents" INTEGER DEFAULT 1;

-- Actualizar subplanes existentes con valor por defecto
UPDATE "AISubplans" SET "maxAgents" = 1 WHERE "maxAgents" IS NULL;

-- Verificar columna agregada
SELECT
    'AISubplans.maxAgents' as column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'AISubplans' AND column_name = 'maxAgents';
