-- ============================================================================
-- Script SQL: Tabla AIProviderConfigs
-- Proyecto: Chateam v0925
-- Base de Datos: PostgreSQL
-- ============================================================================
-- INSTRUCCIONES:
-- 1. Ejecuta ESTE script PRIMERO antes del script ai-image-generation-schema.sql
-- 2. Esta tabla almacena las configuraciones de proveedores de IA (OpenAI, etc.)
-- ============================================================================

-- ============================================================================
-- Tabla: AIProviderConfigs
-- Almacena configuraciones de proveedores de IA (OpenAI, Anthropic, etc.)
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIProviderConfigs" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    provider VARCHAR(50) NOT NULL,
    name VARCHAR(100) NOT NULL,
    "apiKey" TEXT NOT NULL,
    "apiSecret" TEXT,
    "baseUrl" VARCHAR(255),
    "isActive" BOOLEAN DEFAULT true NOT NULL,
    "isDefault" BOOLEAN DEFAULT false NOT NULL,
    settings JSONB DEFAULT '{}',
    "dailyTokenLimit" INTEGER DEFAULT 100000,
    "hourlyTokenLimit" INTEGER DEFAULT 10000,
    "requestsPerMinute" INTEGER DEFAULT 1000,
    "totalTokensUsed" BIGINT DEFAULT 0,
    "totalRequests" BIGINT DEFAULT 0,
    "totalCost" DECIMAL(12, 5) DEFAULT 0,
    "connectionStatus" VARCHAR(50) DEFAULT 'pending' NOT NULL,
    "lastTestedAt" TIMESTAMP,
    "lastError" TEXT,
    "availableModels" JSONB DEFAULT '[]',
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_ai_provider_config_company
        FOREIGN KEY ("companyId")
        REFERENCES "Companies"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- Constraints
    CONSTRAINT check_provider_type
        CHECK (provider IN ('openai', 'anthropic', 'google', 'azure', 'cohere', 'mistral', 'deepseek')),

    CONSTRAINT check_connection_status
        CHECK ("connectionStatus" IN ('pending', 'connected', 'error', 'disabled'))
);

-- Índices para AIProviderConfigs
CREATE INDEX idx_ai_provider_config_company ON "AIProviderConfigs"("companyId");
CREATE INDEX idx_ai_provider_config_provider ON "AIProviderConfigs"(provider);
CREATE INDEX idx_ai_provider_config_active ON "AIProviderConfigs"("isActive");
CREATE INDEX idx_ai_provider_config_default ON "AIProviderConfigs"("isDefault");
CREATE INDEX idx_ai_provider_config_company_provider ON "AIProviderConfigs"("companyId", provider);

-- Comentarios para AIProviderConfigs
COMMENT ON TABLE "AIProviderConfigs" IS 'Configuraciones de proveedores de IA por company';
COMMENT ON COLUMN "AIProviderConfigs".provider IS 'Tipo de proveedor: openai, anthropic, google, azure, cohere, mistral, deepseek';
COMMENT ON COLUMN "AIProviderConfigs"."apiKey" IS 'API Key del proveedor (debe estar encriptada en producción)';
COMMENT ON COLUMN "AIProviderConfigs"."isDefault" IS 'Si es la configuración por defecto para este proveedor';
COMMENT ON COLUMN "AIProviderConfigs".settings IS 'Configuraciones específicas del proveedor (JSON)';
COMMENT ON COLUMN "AIProviderConfigs"."connectionStatus" IS 'Estado de conexión: pending, connected, error, disabled';

-- ============================================================================
-- Función para actualizar updatedAt automáticamente
-- ============================================================================

-- Crear función si no existe (será reutilizada por otras tablas)
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar updatedAt automáticamente
DROP TRIGGER IF EXISTS update_ai_provider_configs_updated_at ON "AIProviderConfigs";
CREATE TRIGGER update_ai_provider_configs_updated_at
    BEFORE UPDATE ON "AIProviderConfigs"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Verificación de la instalación
-- ============================================================================

SELECT
    'AIProviderConfigs' as tabla,
    COUNT(*) as registros
FROM "AIProviderConfigs";

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- NOTA: Ahora puedes ejecutar el script ai-image-generation-schema.sql sin errores
