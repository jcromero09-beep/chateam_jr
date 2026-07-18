-- =============================================================================
-- UGC Phase 1 — Tablas de estructura (6 tablas + 13 columnas en Plans)
-- Idempotente: seguro de ejecutar multiples veces
-- Fecha: 2026-03-01
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AgentIdentities — Identidades de agentes IA para redes sociales
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AgentIdentities" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  "usernameSuggestion" VARCHAR(255),
  age INTEGER,
  city VARCHAR(255),
  occupation VARCHAR(255),
  "bioInstagram" TEXT,
  "bioTiktok" TEXT,
  "personalityTraits" JSONB DEFAULT '[]',
  "communicationStyle" TEXT,
  "writingExamples" JSONB DEFAULT '[]',
  interests JSONB DEFAULT '[]',
  catchphrases JSONB DEFAULT '[]',
  "favoriteBrands" JSONB DEFAULT '[]',
  "contentPillars" JSONB DEFAULT '[]',
  "activeHours" JSONB DEFAULT '{}',
  "responseStyle" JSONB DEFAULT '{}',
  "physicalDescription" JSONB DEFAULT '{}',
  backstory TEXT,
  niche VARCHAR(100),
  "platformFocus" JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'draft',
  metadata JSONB DEFAULT '{}',
  "createdBy" INTEGER REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_identity_company ON "AgentIdentities" ("companyId");
CREATE INDEX IF NOT EXISTS idx_agent_identity_status ON "AgentIdentities" (status);
CREATE INDEX IF NOT EXISTS idx_agent_identity_niche ON "AgentIdentities" (niche);
CREATE INDEX IF NOT EXISTS idx_agent_identity_creator ON "AgentIdentities" ("createdBy");

-- =============================================================================
-- 2. AgentMemories — Memoria contextual de cada identidad
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AgentMemories" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "agentIdentityId" INTEGER NOT NULL REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "memoryType" VARCHAR(50) DEFAULT 'past_post',
  content TEXT NOT NULL,
  context TEXT,
  "extractedBy" VARCHAR(50) DEFAULT 'seed',
  confidence DECIMAL(3,2) DEFAULT 1.00,
  "validUntil" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_memory_identity ON "AgentMemories" ("agentIdentityId");
CREATE INDEX IF NOT EXISTS idx_agent_memory_type ON "AgentMemories" ("memoryType");
CREATE INDEX IF NOT EXISTS idx_agent_memory_company_identity ON "AgentMemories" ("companyId", "agentIdentityId");

-- =============================================================================
-- 3. AgentProfilePhotos — Fotos de perfil generadas por DALL-E
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AgentProfilePhotos" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "agentIdentityId" INTEGER NOT NULL REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "photoType" VARCHAR(50) DEFAULT 'profile',
  url VARCHAR(1024) NOT NULL,
  "originalUrl" VARCHAR(1024),
  "dallePrompt" TEXT,
  "dalleRevisedPrompt" TEXT,
  "localPath" VARCHAR(1024),
  "fileSize" INTEGER,
  "isActive" BOOLEAN DEFAULT true,
  version INTEGER DEFAULT 1,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_photo_identity ON "AgentProfilePhotos" ("agentIdentityId");
CREATE INDEX IF NOT EXISTS idx_agent_photo_type ON "AgentProfilePhotos" ("photoType");

-- =============================================================================
-- 4. UGCCampaigns — Campanas de contenido UGC
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCampaigns" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "productId" INTEGER,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  "productBrief" JSONB DEFAULT '{}',
  "generationConfig" JSONB DEFAULT '{}',
  "publishConfig" JSONB DEFAULT '{}',
  "optimizationConfig" JSONB DEFAULT '{}',
  budget DECIMAL(10,2) DEFAULT 0,
  "budgetSpent" DECIMAL(10,2) DEFAULT 0,
  "totalVideosGenerated" INTEGER DEFAULT 0,
  "totalPostsPublished" INTEGER DEFAULT 0,
  "overallScore" DECIMAL(5,2),
  "startedAt" TIMESTAMPTZ,
  "completedAt" TIMESTAMPTZ,
  "nextOptimizationAt" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdBy" INTEGER REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_company ON "UGCCampaigns" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_status ON "UGCCampaigns" (status);
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_creator ON "UGCCampaigns" ("createdBy");

-- =============================================================================
-- 5. UGCVideoJobs — Pipeline de generacion de videos UGC
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCVideoJobs" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "ugcCampaignId" INTEGER NOT NULL REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "userId" INTEGER NOT NULL REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  stage VARCHAR(50) DEFAULT 'script_generation',
  status VARCHAR(50) DEFAULT 'pending',
  progress INTEGER DEFAULT 0,
  script TEXT,
  "scriptVersion" INTEGER DEFAULT 1,
  "avatarProvider" VARCHAR(100),
  "avatarId" VARCHAR(255),
  "avatarVideoUrl" VARCHAR(1024),
  "videoProvider" VARCHAR(100),
  "videoProviderJobId" VARCHAR(255),
  "rawVideoUrl" VARCHAR(1024),
  "compositorProvider" VARCHAR(100),
  "finalVideoUrl" VARCHAR(1024),
  "thumbnailUrl" VARCHAR(1024),
  "fileName" VARCHAR(512),
  "fileSize" BIGINT,
  duration INTEGER,
  "mimeType" VARCHAR(100) DEFAULT 'video/mp4',
  "totalCreditsUsed" DECIMAL(10,2) DEFAULT 0,
  "totalCostUsd" DECIMAL(10,4) DEFAULT 0,
  "creativeScore" DECIMAL(5,2),
  "scoreDetails" JSONB,
  "errorMessage" TEXT,
  "retryCount" INTEGER DEFAULT 0,
  "pipelineLog" JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_video_job_company ON "UGCVideoJobs" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_video_job_campaign ON "UGCVideoJobs" ("ugcCampaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_video_job_status ON "UGCVideoJobs" (status);
CREATE INDEX IF NOT EXISTS idx_ugc_video_job_stage ON "UGCVideoJobs" (stage);

-- =============================================================================
-- 6. UGCVideoAssets — Assets finales de video
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCVideoAssets" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "ugcVideoJobId" INTEGER NOT NULL REFERENCES "UGCVideoJobs"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "ugcCampaignId" INTEGER NOT NULL REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "assetType" VARCHAR(50) DEFAULT 'composed_final',
  "fileName" VARCHAR(512) NOT NULL,
  "originalUrl" VARCHAR(1024),
  "localPath" VARCHAR(1024) NOT NULL,
  "fileSize" BIGINT DEFAULT 0,
  "mimeType" VARCHAR(100) DEFAULT 'video/mp4',
  duration INTEGER,
  version INTEGER DEFAULT 1,
  "isActive" BOOLEAN DEFAULT true,
  "downloadCount" INTEGER DEFAULT 0,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_video_asset_job ON "UGCVideoAssets" ("ugcVideoJobId");
CREATE INDEX IF NOT EXISTS idx_ugc_video_asset_type ON "UGCVideoAssets" ("assetType");
CREATE INDEX IF NOT EXISTS idx_ugc_video_asset_company ON "UGCVideoAssets" ("companyId");

-- =============================================================================
-- 7. Agregar 13 columnas a Plans (idempotente)
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgc') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgc" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgcAutoPublish') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgcAutoPublish" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgcAbTesting') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgcAbTesting" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgcOptimization') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgcOptimization" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgcCreatorNetwork') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgcCreatorNetwork" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useUgcPayments') THEN
    ALTER TABLE "Plans" ADD COLUMN "useUgcPayments" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='maxUgcVideosPerMonth') THEN
    ALTER TABLE "Plans" ADD COLUMN "maxUgcVideosPerMonth" INTEGER DEFAULT 0;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='maxSocialAccounts') THEN
    ALTER TABLE "Plans" ADD COLUMN "maxSocialAccounts" INTEGER DEFAULT 0;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useAgentIdentities') THEN
    ALTER TABLE "Plans" ADD COLUMN "useAgentIdentities" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useAgentDeviceFarm') THEN
    ALTER TABLE "Plans" ADD COLUMN "useAgentDeviceFarm" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='useAgentEngagement') THEN
    ALTER TABLE "Plans" ADD COLUMN "useAgentEngagement" BOOLEAN DEFAULT false;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='maxAgentIdentities') THEN
    ALTER TABLE "Plans" ADD COLUMN "maxAgentIdentities" INTEGER DEFAULT 0;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='Plans' AND column_name='maxAgentDevices') THEN
    ALTER TABLE "Plans" ADD COLUMN "maxAgentDevices" INTEGER DEFAULT 0;
  END IF;
END$$;

COMMIT;

-- =============================================================================
-- FIN — UGC Phase 1 Tables
-- =============================================================================
