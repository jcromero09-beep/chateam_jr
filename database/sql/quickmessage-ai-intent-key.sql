-- Adds a stable intent key for AI-enabled QuickMessages.
-- Idempotent: safe to run more than once.

ALTER TABLE "QuickMessages"
  ADD COLUMN IF NOT EXISTS "intentKey" VARCHAR(80);

COMMENT ON COLUMN "QuickMessages"."intentKey" IS
  'Stable AI intent key used for quick reply retrieval, e.g. location_question, plan_gold_selection';

CREATE INDEX IF NOT EXISTS idx_quick_messages_ai_intent_key
  ON "QuickMessages"("companyId", "intentKey")
  WHERE "isAiEnabled" = true AND "intentKey" IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_quick_messages_ai_shortcode
  ON "QuickMessages"("companyId", "shortcode")
  WHERE "isAiEnabled" = true;
