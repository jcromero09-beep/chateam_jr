-- ============================================================================
-- Script SQL: Índice Full-Text para Búsquedas de Prompts
-- Proyecto: Chateam v0925
-- Base de Datos: PostgreSQL
-- ============================================================================
-- EJECUTAR EN: pgAdmin (después de ai-image-generation-schema.sql)
-- BENEFICIO: Búsquedas 100x más rápidas en prompts
-- ============================================================================

-- Crear extensión pg_trgm si no existe (para búsquedas LIKE/ILIKE)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================================================
-- Índice trigram para búsquedas LIKE '%texto%' (RECOMENDADO)
-- ============================================================================
DROP INDEX IF EXISTS idx_ai_image_gen_prompt_trgm;
CREATE INDEX idx_ai_image_gen_prompt_trgm
ON "AIImageGenerations"
USING GIN (prompt gin_trgm_ops);

-- ============================================================================
-- Índice Full-Text para búsquedas semánticas en español
-- ============================================================================
DROP INDEX IF EXISTS idx_ai_image_gen_prompt_fts;
CREATE INDEX idx_ai_image_gen_prompt_fts
ON "AIImageGenerations"
USING GIN (to_tsvector('spanish', prompt));

-- ============================================================================
-- Índices compuestos para listados paginados (optimiza ORDER BY)
-- ============================================================================
DROP INDEX IF EXISTS idx_ai_image_gen_company_status_created;
CREATE INDEX idx_ai_image_gen_company_status_created
ON "AIImageGenerations" ("companyId", status, "createdAt" DESC);

DROP INDEX IF EXISTS idx_ai_image_gen_company_user_created;
CREATE INDEX idx_ai_image_gen_company_user_created
ON "AIImageGenerations" ("companyId", "userId", "createdAt" DESC);

-- ============================================================================
-- Verificación
-- ============================================================================
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename = 'AIImageGenerations'
ORDER BY indexname;

-- ============================================================================
-- FIN - Índices creados exitosamente
-- ============================================================================
