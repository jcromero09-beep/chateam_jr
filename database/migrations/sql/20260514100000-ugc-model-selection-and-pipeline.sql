-- =============================================================================
-- UGC Campaigns — Model Selection + Pipeline Builder
-- Combina PR #1 (model-selection) + PR #2 (pipeline mode + voice/lipsync)
--
-- IDEMPOTENTE: usa IF NOT EXISTS en todo. Se puede ejecutar N veces sin daño.
-- BD SAGRADA: solo INSERT/UPDATE/CREATE/ADD COLUMN — nunca DROP/TRUNCATE.
--
-- Uso:
--   psql -h localhost -U atendimento -d chateamjr \
--     -f database/migrations/sql/20260514100000-ugc-model-selection-and-pipeline.sql
--
-- Verificación post-aplicación:
--   psql -d chateamjr -c "\d UGCCampaigns" | grep -E "model|pipeline"
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- PR #1 — Model Selection (9 columnas)
-- -----------------------------------------------------------------------------

-- Adapter key de fal.ai para video (ej: 'kling-v2.6-pro-i2v')
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "videoModelKey" VARCHAR(80) NULL;

-- Model ID literal de fal.ai (denormalizado para auditoría)
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "videoModelId" VARCHAR(160) NULL;

-- Defaults validados por adapter.defaultSchema (duration, aspect_ratio, etc.)
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "videoModelDefaults" JSONB NULL DEFAULT '{}'::jsonb;

-- URL del video de motion-reference (solo motion-control adapters)
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "videoModelMotionReferenceUrl" TEXT NULL;

-- Adapter key de fal.ai para imagen (ej: 'nano-banana-2-edit')
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "imageModelKey" VARCHAR(80) NULL;

-- Model ID literal de fal.ai para imagen
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "imageModelId" VARCHAR(160) NULL;

-- Defaults validados por adapter.defaultSchema del imageModel
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "imageModelDefaults" JSONB NULL DEFAULT '{}'::jsonb;

-- Timestamp de última actualización de la model-selection
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "modelSelectedAt" TIMESTAMP WITH TIME ZONE NULL;

-- FK al User que confirmó la selección
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "modelSelectedBy" INTEGER NULL;

-- FK constraint para modelSelectedBy → Users.id
-- (idempotente: el bloque DO solo crea la constraint si no existe)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'UGCCampaigns_modelSelectedBy_fkey'
  ) THEN
    ALTER TABLE "UGCCampaigns"
      ADD CONSTRAINT "UGCCampaigns_modelSelectedBy_fkey"
      FOREIGN KEY ("modelSelectedBy")
      REFERENCES "Users"("id")
      ON UPDATE CASCADE
      ON DELETE SET NULL;
  END IF;
END$$;

-- Índices para reportes "campañas con modelo configurado"
CREATE INDEX IF NOT EXISTS "idx_ugc_campaigns_video_model_key"
  ON "UGCCampaigns" ("videoModelKey");

CREATE INDEX IF NOT EXISTS "idx_ugc_campaigns_image_model_key"
  ON "UGCCampaigns" ("imageModelKey");


-- -----------------------------------------------------------------------------
-- PR #2 — Pipeline Builder (5 columnas)
-- -----------------------------------------------------------------------------

-- Adapter key del TTS (ej: 'elevenlabs-tts-v3')
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "voiceModelKey" VARCHAR(80) NULL;

ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "voiceModelDefaults" JSONB NULL DEFAULT '{}'::jsonb;

-- Adapter key del lipsync (ej: 'sync-lipsync')
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "lipsyncModelKey" VARCHAR(80) NULL;

ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "lipsyncModelDefaults" JSONB NULL DEFAULT '{}'::jsonb;

-- pipelineMode — enum string
-- Default 'image-then-video' garantiza que campañas legacy del PR #1
-- mantienen su comportamiento sin necesidad de backfill de datos.
ALTER TABLE "UGCCampaigns"
  ADD COLUMN IF NOT EXISTS "pipelineMode" VARCHAR(40)
  NOT NULL DEFAULT 'image-then-video';

-- Check constraint para validar valores válidos
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'UGCCampaigns_pipelineMode_check'
  ) THEN
    ALTER TABLE "UGCCampaigns"
      ADD CONSTRAINT "UGCCampaigns_pipelineMode_check"
      CHECK ("pipelineMode" IN (
        'image-then-video',
        'text-to-video-direct',
        'lipsync-talking-head'
      ));
  END IF;
END$$;

-- Índice para reportes "campañas por modo"
CREATE INDEX IF NOT EXISTS "idx_ugc_campaigns_pipeline_mode"
  ON "UGCCampaigns" ("pipelineMode");


-- -----------------------------------------------------------------------------
-- Comentarios en columnas (auto-documentación de BD)
-- -----------------------------------------------------------------------------

COMMENT ON COLUMN "UGCCampaigns"."videoModelKey" IS
  'Adapter key fal.ai (ej: kling-v2.6-pro-i2v). Resuelve a un FalAdapter en el registry.';

COMMENT ON COLUMN "UGCCampaigns"."videoModelId" IS
  'Model ID literal fal.ai. Denormalizado para auditoría aunque el adapter cambie de modelId vía env.';

COMMENT ON COLUMN "UGCCampaigns"."videoModelDefaults" IS
  'JSONB con defaults configurables del adapter (duration, aspect_ratio, etc.). Validado por adapter.defaultSchema.';

COMMENT ON COLUMN "UGCCampaigns"."videoModelMotionReferenceUrl" IS
  'URL del video de motion-reference. Solo usado por motion-control adapters (Kling v3 Pro Motion Control).';

COMMENT ON COLUMN "UGCCampaigns"."imageModelKey" IS
  'Adapter key del modelo de imagen (text-to-image o image-to-image).';

COMMENT ON COLUMN "UGCCampaigns"."voiceModelKey" IS
  'Adapter key del TTS. NULL si el pipeline no incluye voz.';

COMMENT ON COLUMN "UGCCampaigns"."lipsyncModelKey" IS
  'Adapter key del lipsync. NULL salvo modo lipsync-talking-head.';

COMMENT ON COLUMN "UGCCampaigns"."pipelineMode" IS
  'Modo del pipeline: image-then-video (default, retrocompat PR #1) | text-to-video-direct | lipsync-talking-head.';


COMMIT;

-- =============================================================================
-- POST-VERIFICACIÓN — corre esto después del COMMIT para confirmar
-- =============================================================================
--
-- Listar columnas nuevas:
-- \d+ "UGCCampaigns"
--
-- Verificar constraint del enum:
-- SELECT conname, pg_get_constraintdef(oid)
-- FROM pg_constraint
-- WHERE conrelid = '"UGCCampaigns"'::regclass
--   AND conname IN ('UGCCampaigns_pipelineMode_check', 'UGCCampaigns_modelSelectedBy_fkey');
--
-- Verificar índices:
-- SELECT indexname FROM pg_indexes
-- WHERE tablename = 'UGCCampaigns'
--   AND indexname LIKE 'idx_ugc_campaigns%';
--
-- Conteo rápido (debe coincidir con # campañas existentes):
-- SELECT COUNT(*), "pipelineMode"
-- FROM "UGCCampaigns"
-- GROUP BY "pipelineMode";
-- =============================================================================
