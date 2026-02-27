-- =====================================================
-- MIGRACION: Proveedor por Defecto por Capacidad
-- Fecha: 2026-01-15
-- Descripcion: Agrega columnas para indicar cual proveedor
--              es el default para cada capacidad de IA
-- =====================================================

-- Ejecutar en pgAdmin o psql

-- =====================================================
-- 1. AGREGAR COLUMNA textToSpeechEnabled (si no existe)
-- =====================================================
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "textToSpeechEnabled" BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- 2. AGREGAR COLUMNAS isDefaultFor*
-- =====================================================

-- Default para Generacion de Texto
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForText" BOOLEAN NOT NULL DEFAULT false;

-- Default para Traduccion
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForTranslation" BOOLEAN NOT NULL DEFAULT false;

-- Default para Generacion de Imagenes
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForImages" BOOLEAN NOT NULL DEFAULT false;

-- Default para Analisis de Imagenes (Vision AI)
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForImageAnalysis" BOOLEAN NOT NULL DEFAULT false;

-- Default para Speech-to-Text
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForSTT" BOOLEAN NOT NULL DEFAULT false;

-- Default para Text-to-Speech
ALTER TABLE "AIProviderConfigs"
ADD COLUMN IF NOT EXISTS "isDefaultForTTS" BOOLEAN NOT NULL DEFAULT false;

-- =====================================================
-- 3. COMENTARIOS (Documentacion en BD)
-- =====================================================

COMMENT ON COLUMN "AIProviderConfigs"."textToSpeechEnabled"
IS 'Habilita Text-to-Speech (conversion de texto a voz)';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForText"
IS 'Indica si este proveedor es el default para generacion de texto';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForTranslation"
IS 'Indica si este proveedor es el default para traduccion';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForImages"
IS 'Indica si este proveedor es el default para generacion de imagenes';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForImageAnalysis"
IS 'Indica si este proveedor es el default para Vision AI';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForSTT"
IS 'Indica si este proveedor es el default para Speech-to-Text';

COMMENT ON COLUMN "AIProviderConfigs"."isDefaultForTTS"
IS 'Indica si este proveedor es el default para Text-to-Speech';

-- =====================================================
-- 4. VERIFICACION
-- =====================================================

-- Verificar que las columnas fueron creadas
SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_name = 'AIProviderConfigs'
AND column_name IN (
    'textToSpeechEnabled',
    'isDefaultForText',
    'isDefaultForTranslation',
    'isDefaultForImages',
    'isDefaultForImageAnalysis',
    'isDefaultForSTT',
    'isDefaultForTTS'
);

-- Ver el estado actual de los proveedores
SELECT
    id,
    name,
    provider,
    "isActive",
    "textGenerationEnabled", "isDefaultForText",
    "translationEnabled", "isDefaultForTranslation",
    "imageGenerationEnabled", "isDefaultForImages",
    "imageAnalysisEnabled", "isDefaultForImageAnalysis",
    "speechToTextEnabled", "isDefaultForSTT",
    "textToSpeechEnabled", "isDefaultForTTS"
FROM "AIProviderConfigs"
ORDER BY id;
