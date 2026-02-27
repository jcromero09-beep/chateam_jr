-- =====================================================
-- MIGRACION: Agregar Capacidades de IA a AIProviderConfigs
-- Fecha: 2026-01-09
-- Descripcion: Agrega columnas para controlar las acciones
--              que cada proveedor de IA puede realizar
-- =====================================================

-- Ejecutar en pgAdmin o psql

-- 1. Agregar columna: Generacion de Texto (default TRUE - mas comun)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "textGenerationEnabled" BOOLEAN NOT NULL DEFAULT true;

-- 2. Agregar columna: Traduccion
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "translationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 3. Agregar columna: Generacion de Imagenes
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "imageGenerationEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 4. Agregar columna: Analisis de Imagenes (Vision AI)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "imageAnalysisEnabled" BOOLEAN NOT NULL DEFAULT false;

-- 5. Agregar columna: Speech-to-Text
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "speechToTextEnabled" BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- PRECIOS POR CAPACIDAD (Creditos)
-- Fecha: 2026-01-12
-- =====================================================

-- 6. Agregar columna: Precio generacion de texto (creditos por palabra)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "textGenerationPricing" DECIMAL(10,4) NOT NULL DEFAULT 2;

-- 7. Agregar columna: Precio traduccion (creditos por palabra)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "translationPricing" DECIMAL(10,4) NOT NULL DEFAULT 3;

-- 8. Agregar columna: Precio generacion de imagenes (JSON por tamaño)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "imageGenerationPricing" JSONB NOT NULL DEFAULT '{"1024x1024": 30, "512x512": 20, "256x256": 10}';

-- 9. Agregar columna: Precio Vision AI (creditos por imagen)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "imageAnalysisPricing" DECIMAL(10,4) NOT NULL DEFAULT 15;

-- 10. Agregar columna: Precio Speech-to-Text (creditos por segundo)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "speechToTextPricing" DECIMAL(10,4) NOT NULL DEFAULT 10;

-- =====================================================
-- INDICES (Opcionales - mejoran rendimiento en consultas)
-- =====================================================

-- Indice parcial para proveedores con generacion de texto habilitada
CREATE INDEX IF NOT EXISTS idx_ai_provider_text_gen
ON "AIProviderConfigs"("textGenerationEnabled")
WHERE "textGenerationEnabled" = true;

-- Indice parcial para proveedores con generacion de imagenes habilitada
CREATE INDEX IF NOT EXISTS idx_ai_provider_image_gen
ON "AIProviderConfigs"("imageGenerationEnabled")
WHERE "imageGenerationEnabled" = true;

-- Indice parcial para proveedores con Vision AI habilitada
CREATE INDEX IF NOT EXISTS idx_ai_provider_image_analysis
ON "AIProviderConfigs"("imageAnalysisEnabled")
WHERE "imageAnalysisEnabled" = true;

-- Indice parcial para proveedores con STT habilitada
CREATE INDEX IF NOT EXISTS idx_ai_provider_stt
ON "AIProviderConfigs"("speechToTextEnabled")
WHERE "speechToTextEnabled" = true;

-- =====================================================
-- COMENTARIOS (Documentacion en BD)
-- =====================================================

COMMENT ON COLUMN "AIProviderConfigs"."textGenerationEnabled"
IS 'Habilita generacion de texto (chat, completions, respuestas de IA)';

COMMENT ON COLUMN "AIProviderConfigs"."translationEnabled"
IS 'Habilita traduccion de texto entre idiomas';

COMMENT ON COLUMN "AIProviderConfigs"."imageGenerationEnabled"
IS 'Habilita generacion de imagenes (DALL-E, Stable Diffusion)';

COMMENT ON COLUMN "AIProviderConfigs"."imageAnalysisEnabled"
IS 'Habilita Vision AI (analisis de imagenes, OCR, chat con imagenes)';

COMMENT ON COLUMN "AIProviderConfigs"."speechToTextEnabled"
IS 'Habilita Speech-to-Text (transcripcion de audio con Whisper)';

-- Comentarios para columnas de precios
COMMENT ON COLUMN "AIProviderConfigs"."textGenerationPricing"
IS 'Creditos por palabra generada';

COMMENT ON COLUMN "AIProviderConfigs"."translationPricing"
IS 'Creditos por palabra traducida';

COMMENT ON COLUMN "AIProviderConfigs"."imageGenerationPricing"
IS 'Creditos por imagen segun tamaño (JSON: {"1024x1024": 30, "512x512": 20, "256x256": 10})';

COMMENT ON COLUMN "AIProviderConfigs"."imageAnalysisPricing"
IS 'Creditos por imagen analizada (Vision AI)';

COMMENT ON COLUMN "AIProviderConfigs"."speechToTextPricing"
IS 'Creditos por segundo de audio transcrito (STT)';

-- =====================================================
-- VERIFICACION
-- =====================================================

-- Verificar que las columnas fueron creadas
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'AIProviderConfigs'
AND column_name IN (
    'textGenerationEnabled',
    'translationEnabled',
    'imageGenerationEnabled',
    'imageAnalysisEnabled',
    'speechToTextEnabled',
    'textGenerationPricing',
    'translationPricing',
    'imageGenerationPricing',
    'imageAnalysisPricing',
    'speechToTextPricing'
);

-- Ver las capacidades de los proveedores
SELECT
    id,
    name,
    provider,
    "textGenerationEnabled",
    "translationEnabled",
    "imageGenerationEnabled",
    "imageAnalysisEnabled",
    "speechToTextEnabled"
FROM "AIProviderConfigs"
ORDER BY id;

-- Ver los precios de los proveedores
SELECT
    id,
    name,
    provider,
    "textGenerationPricing",
    "translationPricing",
    "imageGenerationPricing",
    "imageAnalysisPricing",
    "speechToTextPricing"
FROM "AIProviderConfigs"
ORDER BY id;
