-- =====================================================
-- Tablas para Generación de Videos con IA (OpenAI Sora)
-- ChatEAM JR - 2026-03-16
-- =====================================================

-- -----------------------------------------------------
-- Tabla principal: AIVideoGenerations
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "AIVideoGenerations" (
    "id" SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "aiProviderConfigId" INTEGER,
    "prompt" TEXT NOT NULL,
    "videoSize" VARCHAR(50) NOT NULL,
    "duration" INTEGER NOT NULL,
    "stylePreset" VARCHAR(100),
    "model" VARCHAR(50) NOT NULL DEFAULT 'sora-2',
    "status" VARCHAR(50) NOT NULL DEFAULT 'pending',
    "errorMessage" TEXT,
    "totalCreditsUsed" INTEGER NOT NULL,
    "totalCostUsd" DECIMAL(10, 5),
    "openaiVideoId" VARCHAR(255),
    "progress" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Índices para AIVideoGenerations
CREATE INDEX IF NOT EXISTS "idx_ai_video_gen_company" ON "AIVideoGenerations" ("companyId");
CREATE INDEX IF NOT EXISTS "idx_ai_video_gen_user" ON "AIVideoGenerations" ("userId");
CREATE INDEX IF NOT EXISTS "idx_ai_video_gen_status" ON "AIVideoGenerations" ("status");
CREATE INDEX IF NOT EXISTS "idx_ai_video_gen_created" ON "AIVideoGenerations" ("createdAt");

-- -----------------------------------------------------
-- Tabla: AIVideoGenerationItems
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "AIVideoGenerationItems" (
    "id" SERIAL PRIMARY KEY,
    "aiVideoGenerationId" INTEGER NOT NULL,
    "companyId" INTEGER NOT NULL,
    "fileName" VARCHAR(255) NOT NULL,
    "originalUrl" VARCHAR(500),
    "fileSize" BIGINT,
    "mimeType" VARCHAR(50) DEFAULT 'video/mp4',
    "duration" INTEGER,
    "downloadCount" INTEGER DEFAULT 0,
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fk_ai_video_items_generation"
        FOREIGN KEY ("aiVideoGenerationId")
        REFERENCES "AIVideoGenerations"("id")
        ON DELETE CASCADE
);

-- Índices para AIVideoGenerationItems
CREATE INDEX IF NOT EXISTS "idx_ai_video_items_generation" ON "AIVideoGenerationItems" ("aiVideoGenerationId");
CREATE INDEX IF NOT EXISTS "idx_ai_video_items_company" ON "AIVideoGenerationItems" ("companyId");

-- -----------------------------------------------------
-- Tabla: AIVideoCreditTransactions
-- -----------------------------------------------------
CREATE TABLE IF NOT EXISTS "AIVideoCreditTransactions" (
    "id" SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "aiVideoGenerationId" INTEGER,
    "transactionType" VARCHAR(50) NOT NULL,
    "creditsAmount" INTEGER NOT NULL,
    "costUsd" DECIMAL(10, 5),
    "description" VARCHAR(100),
    "metadata" JSONB,
    "status" VARCHAR(50) NOT NULL DEFAULT 'completed',
    "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "fk_ai_video_credits_generation"
        FOREIGN KEY ("aiVideoGenerationId")
        REFERENCES "AIVideoGenerations"("id")
        ON DELETE SET NULL
);

-- Índices para AIVideoCreditTransactions
CREATE INDEX IF NOT EXISTS "idx_ai_video_credits_company" ON "AIVideoCreditTransactions" ("companyId");
CREATE INDEX IF NOT EXISTS "idx_ai_video_credits_user" ON "AIVideoCreditTransactions" ("userId");
CREATE INDEX IF NOT EXISTS "idx_ai_video_credits_type" ON "AIVideoCreditTransactions" ("transactionType");
CREATE INDEX IF NOT EXISTS "idx_ai_video_credits_status" ON "AIVideoCreditTransactions" ("status");
CREATE INDEX IF NOT EXISTS "idx_ai_video_credits_created" ON "AIVideoCreditTransactions" ("createdAt");

-- Verificar tablas creadas
SELECT
    'AIVideoGenerations' as table_name,
    COUNT(*) as columns
FROM information_schema.columns
WHERE table_name = 'AIVideoGenerations'
UNION ALL
SELECT
    'AIVideoGenerationItems',
    COUNT(*)
FROM information_schema.columns
WHERE table_name = 'AIVideoGenerationItems'
UNION ALL
SELECT
    'AIVideoCreditTransactions',
    COUNT(*)
FROM information_schema.columns
WHERE table_name = 'AIVideoCreditTransactions';
