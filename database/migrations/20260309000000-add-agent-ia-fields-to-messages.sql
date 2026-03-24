-- Migration: Add Agent IA fields to Messages table
-- Created: 2026-03-09
-- Description: Agrega campos para metadata de agentes IA en la tabla Messages

-- 1. Agregar columna agentUsed
ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "agentUsed" VARCHAR(100);

-- 2. Agregar columna intent
ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "intent" VARCHAR(100);

-- 3. Agregar columna confidenceScore
ALTER TABLE "Messages" ADD COLUMN IF NOT EXISTS "confidenceScore" DECIMAL(3, 2);

-- Verificar que las columnas fueron agregadas
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'Messages'
  AND column_name IN ('agentUsed', 'intent', 'confidenceScore')
ORDER BY column_name;
