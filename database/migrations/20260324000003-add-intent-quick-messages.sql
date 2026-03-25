-- Migration: Add IA fields to QuickMessages
-- Created: 2026-03-24
-- Description: Agrega campos para integración semántica de QuickReplies con el orquestador IA

-- 1. Campo intent (descripción semántica del propósito del QuickReply)
ALTER TABLE "QuickMessages" ADD COLUMN IF NOT EXISTS "intent" VARCHAR(100);
COMMENT ON COLUMN "QuickMessages"."intent" IS 'Descripción semántica: "saludo informal", "pedir email", "queja de producto"';

-- 2. Embedding vectorial del intent (para búsqueda semántica)
ALTER TABLE "QuickMessages" ADD COLUMN IF NOT EXISTS "intentEmbedding" vector(1536);
COMMENT ON COLUMN "QuickMessages"."intentEmbedding" IS 'Embedding del campo intent para similitud semántica';

-- 3. Flag de habilitación IA (solo los marcados se usan en pipeline de IA)
ALTER TABLE "QuickMessages" ADD COLUMN IF NOT EXISTS "isAiEnabled" BOOLEAN DEFAULT false;
COMMENT ON COLUMN "QuickMessages"."isAiEnabled" IS 'Si true, este QuickReply se considera en el pipeline IA';

-- 4. Índice vectorial para búsqueda semántica
CREATE INDEX IF NOT EXISTS idx_quick_messages_intent_embedding
  ON "QuickMessages" USING ivfflat (intentEmbedding vector_cosine_ops)
  WITH (lists = 20);

-- 5. Índice para QuickReplies habilitadas para IA
CREATE INDEX IF NOT EXISTS idx_quick_messages_ai_enabled
  ON "QuickMessages"("companyId", "isAiEnabled")
  WHERE "isAiEnabled" = true AND "intent" IS NOT NULL;

-- Verificar
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'QuickMessages'
  AND column_name IN ('intent', 'intentEmbedding', 'isAiEnabled')
ORDER BY column_name;
