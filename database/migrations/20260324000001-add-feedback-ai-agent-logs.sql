-- Migration: Add feedback fields to AIAgentLogs
-- Created: 2026-03-24
-- Description: Agrega columnas de feedback implícito y corrección humana a AIAgentLogs para cerrar el loop de aprendizaje

-- 1. Feedback implícito (se infiere después de la respuesta IA)
ALTER TABLE "AIAgentLogs" ADD COLUMN IF NOT EXISTS "feedbackImplicit" VARCHAR(20);
COMMENT ON COLUMN "AIAgentLogs"."feedbackImplicit" IS 'positive | negative | escalated | corrected - se infiere automáticamente';

-- 2. Corrección humana (si un agente reescribe la respuesta de la IA)
ALTER TABLE "AIAgentLogs" ADD COLUMN IF NOT EXISTS "humanCorrection" TEXT;
COMMENT ON COLUMN "AIAgentLogs"."humanCorrection" IS 'Texto de la respuesta humana que reemplazó/corrigió la respuesta de la IA';

-- 3. Tiempo de corrección (cuánto tardó el humano en corregir)
ALTER TABLE "AIAgentLogs" ADD COLUMN IF NOT EXISTS "correctionDeltaMs" INTEGER;
COMMENT ON COLUMN "AIAgentLogs"."correctionDeltaMs" IS 'Milisegundos desde la respuesta IA hasta la corrección humana';

-- 4. Log padre (para encadenar respuestas IA → correcciones)
ALTER TABLE "AIAgentLogs" ADD COLUMN IF NOT EXISTS "parentLogId" INTEGER REFERENCES "AIAgentLogs"(id);
COMMENT ON COLUMN "AIAgentLogs"."parentLogId" IS 'ID del log de IA que fue corregido por este humano';

-- 5. Índices para consultas frecuentes
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_feedback ON "AIAgentLogs"("feedbackImplicit") WHERE "feedbackImplicit" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_parent ON "AIAgentLogs"("parentLogId") WHERE "parentLogId" IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_agent_logs_ticket_feedback ON "AIAgentLogs"("ticketId", "feedbackImplicit") WHERE "feedbackImplicit" IS NOT NULL;

-- Verificar
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'AIAgentLogs'
  AND column_name IN ('feedbackImplicit', 'humanCorrection', 'correctionDeltaMs', 'parentLogId')
ORDER BY column_name;
