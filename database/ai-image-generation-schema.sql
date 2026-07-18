-- ============================================================================
-- Script SQL: Módulo de Generación de Imágenes con IA
-- Proyecto: Chateam v0925
-- Migrado desde: Laravel AiGen (Proyecto Source)
-- Base de Datos: PostgreSQL
-- ============================================================================
-- ⚠️ IMPORTANTE - ORDEN DE EJECUCIÓN:
-- 1. Abre pgAdmin y conecta a tu base de datos
-- 2. EJECUTA PRIMERO: ai-provider-config-schema.sql (crea tabla AIProviderConfigs)
-- 3. EJECUTA DESPUÉS: este script (ai-image-generation-schema.sql)
-- 4. Verifica que todas las tablas se hayan creado correctamente
-- ============================================================================
-- NOTA: Si prefieres ejecutar solo este script sin crear AIProviderConfigs,
--       comenta las líneas 50-54 (CONSTRAINT fk_ai_image_gen_provider)
-- ============================================================================

-- Tabla: AIImageGenerations
-- Representa una solicitud de generación de imágenes con IA
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIImageGenerations" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "aiProviderConfigId" INTEGER,
    prompt TEXT NOT NULL,
    "imageSize" VARCHAR(50) NOT NULL,
    "numberOfImages" INTEGER DEFAULT 1 NOT NULL,
    "stylePreset" VARCHAR(100),
    model VARCHAR(50) DEFAULT 'dall-e-3' NOT NULL,
    status VARCHAR(50) DEFAULT 'pending' NOT NULL,
    "errorMessage" TEXT,
    "totalCreditsUsed" INTEGER NOT NULL,
    "totalCostUsd" DECIMAL(10, 5),
    metadata JSONB,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_ai_image_gen_company
        FOREIGN KEY ("companyId")
        REFERENCES "Companies"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ai_image_gen_user
        FOREIGN KEY ("userId")
        REFERENCES "Users"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ai_image_gen_provider
        FOREIGN KEY ("aiProviderConfigId")
        REFERENCES "AIProviderConfigs"(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Constraints
    CONSTRAINT check_image_size
        CHECK ("imageSize" IN ('1024x1024', '512x512', '256x256')),

    CONSTRAINT check_number_of_images
        CHECK ("numberOfImages" BETWEEN 1 AND 10),

    CONSTRAINT check_status
        CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'partial_failure')),

    CONSTRAINT check_model
        CHECK (model IN ('dall-e-2', 'dall-e-3'))
);

-- Índices para AIImageGenerations
CREATE INDEX idx_ai_image_gen_company ON "AIImageGenerations"("companyId");
CREATE INDEX idx_ai_image_gen_user ON "AIImageGenerations"("userId");
CREATE INDEX idx_ai_image_gen_status ON "AIImageGenerations"(status);
CREATE INDEX idx_ai_image_gen_created ON "AIImageGenerations"("createdAt");
CREATE INDEX idx_ai_image_gen_company_created ON "AIImageGenerations"("companyId", "createdAt");

-- Comentarios para AIImageGenerations
COMMENT ON TABLE "AIImageGenerations" IS 'Almacena las solicitudes de generación de imágenes con IA';
COMMENT ON COLUMN "AIImageGenerations"."imageSize" IS 'Tamaño de imagen: 1024x1024, 512x512, 256x256';
COMMENT ON COLUMN "AIImageGenerations".status IS 'Estado: pending, processing, completed, failed, partial_failure';
COMMENT ON COLUMN "AIImageGenerations"."totalCreditsUsed" IS 'Total de créditos consumidos en esta generación';

-- ============================================================================
-- Tabla: AIImageGenerationItems
-- Representa cada imagen individual generada
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIImageGenerationItems" (
    id SERIAL PRIMARY KEY,
    "aiImageGenerationId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalUrl" VARCHAR(500),
    "fileSize" BIGINT,
    "mimeType" VARCHAR(50) DEFAULT 'image/png',
    "downloadCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_ai_image_item_generation
        FOREIGN KEY ("aiImageGenerationId")
        REFERENCES "AIImageGenerations"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    -- Constraints
    CONSTRAINT check_file_size
        CHECK ("fileSize" > 0 OR "fileSize" IS NULL),

    CONSTRAINT check_download_count
        CHECK ("downloadCount" >= 0)
);

-- Índices para AIImageGenerationItems
CREATE INDEX idx_ai_image_items_generation ON "AIImageGenerationItems"("aiImageGenerationId");
CREATE INDEX idx_ai_image_items_company ON "AIImageGenerationItems"("companyId");
CREATE INDEX idx_ai_image_items_created ON "AIImageGenerationItems"("createdAt");

-- Comentarios para AIImageGenerationItems
COMMENT ON TABLE "AIImageGenerationItems" IS 'Almacena cada imagen individual generada';
COMMENT ON COLUMN "AIImageGenerationItems"."fileName" IS 'Nombre del archivo almacenado en el servidor';
COMMENT ON COLUMN "AIImageGenerationItems"."originalUrl" IS 'URL temporal de OpenAI (expira en 1 hora)';
COMMENT ON COLUMN "AIImageGenerationItems"."downloadCount" IS 'Contador de descargas de la imagen';

-- ============================================================================
-- Tabla: AIImageCreditTransactions
-- Gestiona las transacciones de créditos para generación de imágenes
-- ============================================================================

CREATE TABLE IF NOT EXISTS "AIImageCreditTransactions" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "aiImageGenerationId" INTEGER,
    "transactionType" VARCHAR(50) NOT NULL,
    "creditsAmount" INTEGER NOT NULL,
    "costUsd" DECIMAL(10, 5),
    description VARCHAR(100),
    metadata JSONB,
    status VARCHAR(50) DEFAULT 'completed' NOT NULL,
    "createdAt" TIMESTAMP NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Foreign Keys
    CONSTRAINT fk_ai_image_credits_company
        FOREIGN KEY ("companyId")
        REFERENCES "Companies"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ai_image_credits_user
        FOREIGN KEY ("userId")
        REFERENCES "Users"(id)
        ON DELETE CASCADE
        ON UPDATE CASCADE,

    CONSTRAINT fk_ai_image_credits_generation
        FOREIGN KEY ("aiImageGenerationId")
        REFERENCES "AIImageGenerations"(id)
        ON DELETE SET NULL
        ON UPDATE CASCADE,

    -- Constraints
    CONSTRAINT check_transaction_type
        CHECK ("transactionType" IN ('debit', 'credit', 'refund')),

    CONSTRAINT check_credits_amount
        CHECK ("creditsAmount" > 0),

    CONSTRAINT check_transaction_status
        CHECK (status IN ('pending', 'completed', 'failed', 'refunded'))
);

-- Índices para AIImageCreditTransactions
CREATE INDEX idx_ai_image_credits_company ON "AIImageCreditTransactions"("companyId");
CREATE INDEX idx_ai_image_credits_user ON "AIImageCreditTransactions"("userId");
CREATE INDEX idx_ai_image_credits_type ON "AIImageCreditTransactions"("transactionType");
CREATE INDEX idx_ai_image_credits_status ON "AIImageCreditTransactions"(status);
CREATE INDEX idx_ai_image_credits_created ON "AIImageCreditTransactions"("createdAt");
CREATE INDEX idx_ai_image_credits_company_type ON "AIImageCreditTransactions"("companyId", "transactionType");

-- Comentarios para AIImageCreditTransactions
COMMENT ON TABLE "AIImageCreditTransactions" IS 'Registro de transacciones de créditos para generación de imágenes';
COMMENT ON COLUMN "AIImageCreditTransactions"."transactionType" IS 'Tipo de transacción: debit (resta), credit (suma), refund (reembolso)';
COMMENT ON COLUMN "AIImageCreditTransactions"."creditsAmount" IS 'Cantidad de créditos (siempre positivo, el tipo indica si suma o resta)';

-- ============================================================================
-- Modificaciones a tabla Companies
-- Agregar campos para gestión de créditos de imágenes
-- ============================================================================

-- Verificar si las columnas no existen antes de agregarlas
DO $$
BEGIN
    -- Agregar imageGenerationCredits si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Companies'
        AND column_name = 'imageGenerationCredits'
    ) THEN
        ALTER TABLE "Companies"
        ADD COLUMN "imageGenerationCredits" INTEGER DEFAULT 0 NOT NULL;
    END IF;

    -- Agregar totalImageGenerationCreditsUsed si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'Companies'
        AND column_name = 'totalImageGenerationCreditsUsed'
    ) THEN
        ALTER TABLE "Companies"
        ADD COLUMN "totalImageGenerationCreditsUsed" INTEGER DEFAULT 0 NOT NULL;
    END IF;
END $$;

-- Constraints para los nuevos campos (solo si no existen)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_image_gen_credits'
    ) THEN
        ALTER TABLE "Companies"
        ADD CONSTRAINT check_image_gen_credits
        CHECK ("imageGenerationCredits" >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'check_total_image_credits_used'
    ) THEN
        ALTER TABLE "Companies"
        ADD CONSTRAINT check_total_image_credits_used
        CHECK ("totalImageGenerationCreditsUsed" >= 0);
    END IF;
END $$;

-- Índice para optimizar consultas de balance de créditos (solo si no existe)
CREATE INDEX IF NOT EXISTS idx_companies_image_credits ON "Companies"("imageGenerationCredits");

-- Comentarios para las nuevas columnas
COMMENT ON COLUMN "Companies"."imageGenerationCredits" IS 'Créditos disponibles para generación de imágenes';
COMMENT ON COLUMN "Companies"."totalImageGenerationCreditsUsed" IS 'Total histórico de créditos usados en generación de imágenes';

-- ============================================================================
-- Función para actualizar updatedAt automáticamente
-- ============================================================================

-- Crear función si no existe
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW."updatedAt" = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updatedAt automáticamente
DROP TRIGGER IF EXISTS update_ai_image_generations_updated_at ON "AIImageGenerations";
CREATE TRIGGER update_ai_image_generations_updated_at
    BEFORE UPDATE ON "AIImageGenerations"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_image_items_updated_at ON "AIImageGenerationItems";
CREATE TRIGGER update_ai_image_items_updated_at
    BEFORE UPDATE ON "AIImageGenerationItems"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_ai_image_credits_updated_at ON "AIImageCreditTransactions";
CREATE TRIGGER update_ai_image_credits_updated_at
    BEFORE UPDATE ON "AIImageCreditTransactions"
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Datos iniciales de prueba (OPCIONAL - Comentar si no se necesita)
-- ============================================================================

-- Descomentar las siguientes líneas si deseas agregar créditos iniciales a todas las companies
-- UPDATE "Companies" SET "imageGenerationCredits" = 100 WHERE "imageGenerationCredits" = 0;

-- ============================================================================
-- Verificación de la instalación
-- ============================================================================

-- Verificar que todas las tablas se crearon correctamente
SELECT
    'AIImageGenerations' as tabla,
    COUNT(*) as registros
FROM "AIImageGenerations"
UNION ALL
SELECT
    'AIImageGenerationItems' as tabla,
    COUNT(*) as registros
FROM "AIImageGenerationItems"
UNION ALL
SELECT
    'AIImageCreditTransactions' as tabla,
    COUNT(*) as registros
FROM "AIImageCreditTransactions";

-- Verificar los nuevos campos en Companies
SELECT
    id,
    name,
    "imageGenerationCredits",
    "totalImageGenerationCreditsUsed"
FROM "Companies"
LIMIT 5;

-- ============================================================================
-- FIN DEL SCRIPT
-- ============================================================================

-- NOTAS IMPORTANTES:
-- 1. Este script es idempotente: puede ejecutarse múltiples veces sin errores
-- 2. Las foreign keys aseguran integridad referencial
-- 3. Los índices optimizan las consultas más frecuentes
-- 4. Los triggers mantienen updatedAt actualizado automáticamente
-- 5. Los constraints previenen datos inválidos
-- 6. Las columnas agregadas a Companies tienen valores por defecto
--
-- PRÓXIMOS PASOS:
-- 1. Registrar los modelos en database/index.ts
-- 2. Crear los servicios de la aplicación
-- 3. Implementar los controladores y rutas
-- 4. Testing con Postman/Insomnia
