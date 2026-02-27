-- =====================================================
-- ACTUALIZACION: Agregar campo tokensConsumed a AISubplans
-- Fecha: 2026-01-12
-- Descripcion: Agrega tracking de consumo de tokens y hace
--              aiProviderConfigId opcional (ya no se usa)
-- =====================================================

-- Ejecutar en pgAdmin o psql

-- 1. Agregar columna de tokens consumidos
ALTER TABLE "AISubplans"
ADD COLUMN IF NOT EXISTS "tokensConsumed" BIGINT NOT NULL DEFAULT 0;

-- 2. Hacer aiProviderConfigId nullable (para compatibilidad con registros existentes)
-- La columna se mantiene para posible rollback, pero ya no se usa en el codigo
ALTER TABLE "AISubplans"
ALTER COLUMN "aiProviderConfigId" DROP NOT NULL;

-- =====================================================
-- COMENTARIOS (Documentacion en BD)
-- =====================================================

COMMENT ON COLUMN "AISubplans"."tokensConsumed" IS 'Tokens consumidos del subplan - se actualiza al usar IA';
COMMENT ON COLUMN "AISubplans"."aiProviderConfigId" IS 'DEPRECATED: Ya no se usa. Subplanes no estan ligados a un proveedor especifico';

-- =====================================================
-- VERIFICACION
-- =====================================================

-- Verificar que la columna fue agregada
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'AISubplans'
ORDER BY ordinal_position;

-- Ver datos actuales
SELECT
    id,
    name,
    tokens,
    "tokensConsumed",
    "aiProviderConfigId",
    "isActive"
FROM "AISubplans"
ORDER BY id;

-- =====================================================
-- NOTAS
-- =====================================================
--
-- 1. La columna aiProviderConfigId se mantiene nullable para no romper
--    registros existentes. En el codigo se comento pero no se elimino.
--
-- 2. El campo tokensConsumed se inicializa en 0 y se ira actualizando
--    cada vez que se use IA (en futura implementacion del servicio).
--
-- 3. El tracking de consumo se mostrara en:
--    - /ai/subplans (columnas Usados y Restantes)
--    - /openai/dashboard (nueva seccion Consumo de Tokens por Subplan)
--
-- =====================================================
BEGIN;

-- 1. Agregar columna aiProviderId con relación a AIProviderConfigs
ALTER TABLE "Prompts" 
ADD COLUMN "aiProviderId" INTEGER NULL;

-- 2. Hacer que apiKey sea opcional (cambiar a NULL)
ALTER TABLE "Prompts" 
ALTER COLUMN "apiKey" DROP NOT NULL;

-- 3. Agregar foreign key hacia AIProviderConfigs
ALTER TABLE "Prompts"
ADD CONSTRAINT "fk_prompts_ai_provider"
FOREIGN KEY ("aiProviderId")
REFERENCES "AIProviderConfigs"(id)
ON DELETE SET NULL
ON UPDATE CASCADE;

-- 4. Crear índice para mejorar rendimiento de consultas
CREATE INDEX "idx_prompts_ai_provider_id" ON "Prompts"("aiProviderId");

-- 5. Agregar comentarios para documentación
COMMENT ON COLUMN "Prompts"."aiProviderId" IS 'ID del proveedor de IA configurado en AIProviderConfigs';
COMMENT ON COLUMN "Prompts"."apiKey" IS 'API Key legacy (opcional) - se recomienda usar aiProviderId';

COMMIT;
-- ============================================================================
-- Script: Agregar campos baseUrl y capabilities a tabla Prompts
-- Permite almacenar config del provider directamente en el prompt
-- ============================================================================

BEGIN;

-- 1. Agregar columna baseUrl (URL del proveedor)
ALTER TABLE "Prompts"
ADD COLUMN IF NOT EXISTS "baseUrl" VARCHAR(500) NULL;

-- 2. Agregar columna capabilities (JSON con capacidades habilitadas)
ALTER TABLE "Prompts"
ADD COLUMN IF NOT EXISTS "capabilities" JSONB NULL
DEFAULT '{"textGenerationEnabled": true, "translationEnabled": false, "imageGenerationEnabled": false, "imageAnalysisEnabled": false, "speechToTextEnabled": false}'::jsonb;

-- 3. Agregar comentarios
COMMENT ON COLUMN "Prompts"."baseUrl" IS 'URL base del proveedor de IA (copiado desde AIProviderConfig)';
COMMENT ON COLUMN "Prompts"."capabilities" IS 'Capacidades habilitadas (copiado desde AIProviderConfig al guardar)';

-- 4. Crear índice GIN para búsquedas rápidas en JSON
CREATE INDEX IF NOT EXISTS "idx_prompts_capabilities" ON "Prompts" USING GIN ("capabilities");

COMMIT;

-- Verificar cambios
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'Prompts'
AND column_name IN ('baseUrl', 'capabilities')
ORDER BY ordinal_position;

-- ============================================================================
-- Script Completo: Migración de Prompts Legacy a AIProviderConfig
-- Ejecutar en pgAdmin
-- ============================================================================

BEGIN;

-- ============================================================================
-- PASO 1: Agregar columnas necesarias a la tabla Prompts
-- ============================================================================

-- Agregar columna baseUrl
ALTER TABLE "Prompts"
ADD COLUMN IF NOT EXISTS "baseUrl" VARCHAR(500) NULL;

-- Agregar columna capabilities
ALTER TABLE "Prompts"
ADD COLUMN IF NOT EXISTS "capabilities" JSONB NULL
DEFAULT '{"textGenerationEnabled": true, "translationEnabled": false, "imageGenerationEnabled": false, "imageAnalysisEnabled": false, "speechToTextEnabled": false}'::jsonb;

-- Agregar comentarios
COMMENT ON COLUMN "Prompts"."baseUrl" IS 'URL base del proveedor de IA (copiado desde AIProviderConfig)';
COMMENT ON COLUMN "Prompts"."capabilities" IS 'Capacidades habilitadas (copiado desde AIProviderConfig al guardar)';

-- Crear índice GIN para búsquedas rápidas en JSON
CREATE INDEX IF NOT EXISTS "idx_prompts_capabilities" ON "Prompts" USING GIN ("capabilities");

COMMIT;

-- ============================================================================
-- PASO 2: Migrar Prompts Legacy a AIProviderConfig
-- ============================================================================

BEGIN;

-- Crear AIProviderConfigs para cada apiKey única por compañía
-- y actualizar prompts con el aiProviderId correspondiente

DO $$
DECLARE
    legacy_prompt RECORD;
    provider_id INT;
    existing_provider_id INT;
    prompts_migrated INT := 0;
    providers_created INT := 0;
BEGIN
    RAISE NOTICE '🔄 Iniciando migración de prompts legacy...';
    
    -- Iterar sobre cada combinación única de companyId + apiKey
    FOR legacy_prompt IN 
        SELECT DISTINCT 
            "companyId", 
            "apiKey"
        FROM "Prompts"
        WHERE "apiKey" IS NOT NULL 
        AND "aiProviderId" IS NULL
        ORDER BY "companyId", "apiKey"
    LOOP
        RAISE NOTICE '📊 Procesando compañía % con apiKey %...', 
            legacy_prompt."companyId", 
            LEFT(legacy_prompt."apiKey", 10) || '...';
        
        -- Verificar si ya existe un provider con esta apiKey para esta compañía
        SELECT id INTO existing_provider_id
        FROM "AIProviderConfigs"
        WHERE "companyId" = legacy_prompt."companyId"
        AND "apiKey" = legacy_prompt."apiKey"
        LIMIT 1;
        
        IF existing_provider_id IS NOT NULL THEN
            -- Provider ya existe, usar ese ID
            provider_id := existing_provider_id;
            RAISE NOTICE '   ℹ️  Provider % ya existe para esta apiKey', provider_id;
        ELSE
            -- Crear nuevo AIProviderConfig
            INSERT INTO "AIProviderConfigs" (
                "companyId",
                "provider",
                "name",
                "apiKey",
                "isActive",
                "isDefault",
                "connectionStatus",
                "textGenerationEnabled",
                "translationEnabled",
                "imageGenerationEnabled",
                "imageAnalysisEnabled",
                "speechToTextEnabled",
                "settings",
                "createdAt",
                "updatedAt"
            ) VALUES (
                legacy_prompt."companyId",
                'openai',
                'OpenAI (migrado desde prompts)',
                legacy_prompt."apiKey",
                true,
                true, -- Default para el primer provider
                'pending',
                true,  -- Solo generación de texto habilitada para legacy
                false,
                false,
                false,
                false,
                '{"defaultModel": "gpt-4o", "defaultTemperature": 0.7, "defaultMaxTokens": 2000}'::jsonb,
                NOW(),
                NOW()
            )
            RETURNING id INTO provider_id;
            
            providers_created := providers_created + 1;
            RAISE NOTICE '   ✅ Provider % creado', provider_id;
        END IF;
        
        -- Actualizar todos los prompts con este aiProviderId y copiar datos del provider
        WITH updated AS (
            UPDATE "Prompts"
            SET 
                "aiProviderId" = provider_id,
                "baseUrl" = NULL, -- OpenAI usa la URL por defecto
                "capabilities" = '{"textGenerationEnabled": true, "translationEnabled": false, "imageGenerationEnabled": false, "imageAnalysisEnabled": false, "speechToTextEnabled": false}'::jsonb,
                "updatedAt" = NOW()
            WHERE "companyId" = legacy_prompt."companyId"
            AND "apiKey" = legacy_prompt."apiKey"
            AND "aiProviderId" IS NULL
            RETURNING id
        )
        SELECT COUNT(*) INTO prompts_migrated FROM updated;
        
        RAISE NOTICE '   ✅ % prompts actualizados con aiProviderId %', 
            prompts_migrated, provider_id;
    END LOOP;
    
    RAISE NOTICE '';
    RAISE NOTICE '📊 Resumen de migración:';
    RAISE NOTICE '   ✅ Providers creados: %', providers_created;
    RAISE NOTICE '   ✅ Prompts migrados: %', prompts_migrated;
    RAISE NOTICE '✅ Migración completada';
    
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION '❌ Error durante migración: %', SQLERRM;
END $$;

COMMIT;

-- ============================================================================
-- PASO 3: Verificación de la migración
-- ============================================================================

-- Verificar columnas agregadas
SELECT
    column_name,
    data_type,
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'Prompts'
AND column_name IN ('baseUrl', 'capabilities', 'aiProviderId')
ORDER BY ordinal_position;

-- Verificar prompts migrados
SELECT 
    COUNT(*) as total_prompts,
    COUNT("aiProviderId") as prompts_with_provider,
    COUNT(*) - COUNT("aiProviderId") as prompts_sin_provider
FROM "Prompts";

-- Verificar providers creados
SELECT 
    id,
    "companyId",
    name,
    provider,
    "isActive",
    "textGenerationEnabled",
    "createdAt"
FROM "AIProviderConfigs"
WHERE name LIKE '%migrado%'
ORDER BY "companyId", id;

-- Verificar si quedan prompts sin migrar
SELECT 
    id,
    name,
    "companyId",
    "apiKey",
    "aiProviderId"
FROM "Prompts"
WHERE "apiKey" IS NOT NULL 
AND "aiProviderId" IS NULL
LIMIT 10;