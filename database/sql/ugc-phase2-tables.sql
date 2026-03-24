-- =============================================================================
-- UGC Phase 2 — Tablas de estructura (6 tablas)
-- Idempotente: seguro de ejecutar multiples veces
-- BD SAGRADA: Solo CREATE TABLE IF NOT EXISTS, nunca DROP ni DELETE
-- Fecha: 2026-03-01
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. AgentDevices — Dispositivos Android fisicos del device farm
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AgentDevices" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "deviceId" VARCHAR(255) NOT NULL UNIQUE,
  name VARCHAR(255),
  model VARCHAR(255),
  "androidVersion" VARCHAR(50),
  ip VARCHAR(50),
  "proxyConfig" JSONB DEFAULT '{}',
  fingerprint JSONB DEFAULT '{}',
  "simNumber" VARCHAR(50),
  "assignedIdentityId" INTEGER REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  status VARCHAR(50) DEFAULT 'offline',
  "lastHeartbeat" TIMESTAMPTZ,
  "dailyActionCount" INTEGER DEFAULT 0,
  "dailyActionLimit" INTEGER DEFAULT 100,
  "cooldownUntil" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_devices_company ON "AgentDevices" ("companyId");
CREATE INDEX IF NOT EXISTS idx_agent_devices_device_id ON "AgentDevices" ("deviceId");
CREATE INDEX IF NOT EXISTS idx_agent_devices_status ON "AgentDevices" (status);
CREATE INDEX IF NOT EXISTS idx_agent_devices_identity ON "AgentDevices" ("assignedIdentityId");

-- =============================================================================
-- 2. AgentInteractions — Interacciones de agentes en redes sociales
-- =============================================================================
CREATE TABLE IF NOT EXISTS "AgentInteractions" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "agentIdentityId" INTEGER NOT NULL REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "agentDeviceId" INTEGER REFERENCES "AgentDevices"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  type VARCHAR(50) NOT NULL,
  platform VARCHAR(50) NOT NULL,
  content TEXT,
  "targetPostId" VARCHAR(255),
  "targetUserId" VARCHAR(255),
  "targetCommentId" VARCHAR(255),
  sentiment VARCHAR(50),
  "consistencyScore" DECIMAL(3,2),
  "executedAt" TIMESTAMPTZ,
  "executionStatus" VARCHAR(50) DEFAULT 'pending',
  "failureReason" TEXT,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_company ON "AgentInteractions" ("companyId");
CREATE INDEX IF NOT EXISTS idx_agent_interactions_identity ON "AgentInteractions" ("agentIdentityId");
CREATE INDEX IF NOT EXISTS idx_agent_interactions_device ON "AgentInteractions" ("agentDeviceId");
CREATE INDEX IF NOT EXISTS idx_agent_interactions_type ON "AgentInteractions" (type);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_platform ON "AgentInteractions" (platform);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_sentiment ON "AgentInteractions" (sentiment);
CREATE INDEX IF NOT EXISTS idx_agent_interactions_exec_status ON "AgentInteractions" ("executionStatus");

-- =============================================================================
-- 3. UGCSocialAccounts — Cuentas sociales conectadas para publicacion
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCSocialAccounts" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL,
  "platformAccountId" VARCHAR(255) NOT NULL,
  username VARCHAR(255) NOT NULL,
  "displayName" VARCHAR(255),
  "profileImageUrl" VARCHAR(1024),
  "accessToken" TEXT NOT NULL,
  "refreshToken" TEXT,
  "tokenExpiresAt" TIMESTAMPTZ,
  scopes JSONB DEFAULT '[]',
  "followerCount" INTEGER DEFAULT 0,
  "followingCount" INTEGER DEFAULT 0,
  "postCount" INTEGER DEFAULT 0,
  "engagementRate" DECIMAL(5,2) DEFAULT 0,
  "lastSyncAt" TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_social_accounts_company ON "UGCSocialAccounts" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_accounts_platform ON "UGCSocialAccounts" (platform);
CREATE INDEX IF NOT EXISTS idx_ugc_social_accounts_platform_id ON "UGCSocialAccounts" ("platformAccountId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_accounts_status ON "UGCSocialAccounts" (status);

-- =============================================================================
-- 4. UGCSocialPosts — Publicaciones en redes sociales con metricas
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCSocialPosts" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "socialAccountId" INTEGER NOT NULL REFERENCES "UGCSocialAccounts"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "ugcCampaignId" INTEGER REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "ugcVideoJobId" INTEGER REFERENCES "UGCVideoJobs"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "agentIdentityId" INTEGER REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "platformPostId" VARCHAR(255),
  platform VARCHAR(50) NOT NULL,
  "postType" VARCHAR(50) NOT NULL,
  caption TEXT,
  "mediaUrl" TEXT,
  "thumbnailUrl" TEXT,
  "publishedAt" TIMESTAMPTZ,
  "scheduledAt" TIMESTAMPTZ,
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  saves INTEGER DEFAULT 0,
  "engagementRate" DECIMAL(5,2) DEFAULT 0,
  "reachCount" INTEGER DEFAULT 0,
  "impressionCount" INTEGER DEFAULT 0,
  "purchaseIntents" INTEGER DEFAULT 0,
  "whatsappTriggers" INTEGER DEFAULT 0,
  roas DECIMAL(8,2) DEFAULT 0,
  "lastMetricsSyncAt" TIMESTAMPTZ,
  status VARCHAR(50) DEFAULT 'draft',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_company ON "UGCSocialPosts" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_account ON "UGCSocialPosts" ("socialAccountId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_campaign ON "UGCSocialPosts" ("ugcCampaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_identity ON "UGCSocialPosts" ("agentIdentityId");
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_platform ON "UGCSocialPosts" (platform);
CREATE INDEX IF NOT EXISTS idx_ugc_social_posts_status ON "UGCSocialPosts" (status);

-- =============================================================================
-- 5. UGCCreativeVariants — Variantes de creativo para A/B testing
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCreativeVariants" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "ugcCampaignId" INTEGER NOT NULL REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "variantLabel" VARCHAR(10) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  "scriptVariation" TEXT,
  "avatarConfig" JSONB,
  "videoStyle" VARCHAR(255),
  "captionVariation" TEXT,
  "thumbnailUrl" VARCHAR(1024),
  views INTEGER DEFAULT 0,
  likes INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  shares INTEGER DEFAULT 0,
  "engagementRate" DECIMAL(5,2) DEFAULT 0,
  "conversionRate" DECIMAL(5,2) DEFAULT 0,
  "confidenceLevel" DECIMAL(3,2) DEFAULT 0,
  "isWinner" BOOLEAN DEFAULT false,
  "isActive" BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_ugc_creative_variants_company ON "UGCCreativeVariants" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_creative_variants_campaign ON "UGCCreativeVariants" ("ugcCampaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_creative_variants_winner ON "UGCCreativeVariants" ("isWinner");

-- =============================================================================
-- 6. UGCPostComments — Comentarios clasificados por IA en publicaciones
-- Crea la tabla si no existe; si existe, agrega columnas nuevas de FASE 2
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCPostComments" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "socialPostId" INTEGER NOT NULL REFERENCES "UGCSocialPosts"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "assignedAgentIdentityId" INTEGER REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "platformCommentId" VARCHAR(255) NOT NULL,
  "authorUsername" VARCHAR(255) NOT NULL,
  "authorDisplayName" VARCHAR(255),
  "authorProfileImageUrl" VARCHAR(1024),
  content TEXT NOT NULL,
  "parentCommentId" INTEGER REFERENCES "UGCPostComments"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "commentType" VARCHAR(50) DEFAULT 'neutral',
  sentiment VARCHAR(50) DEFAULT 'neutral',
  "purchaseIntentScore" DECIMAL(3,2) DEFAULT 0,
  "autoReplyContent" TEXT,
  "autoReplyStatus" VARCHAR(50) DEFAULT 'pending',
  "autoRepliedAt" TIMESTAMPTZ,
  "whatsappTriggered" BOOLEAN DEFAULT false,
  "classifiedAt" TIMESTAMPTZ,
  "classifiedBy" VARCHAR(100),
  platform VARCHAR(50) NOT NULL,
  "postedAt" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para UGCPostComments
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_company ON "UGCPostComments" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_post ON "UGCPostComments" ("socialPostId");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_agent ON "UGCPostComments" ("assignedAgentIdentityId");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_parent ON "UGCPostComments" ("parentCommentId");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_platform_id ON "UGCPostComments" ("platformCommentId");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_type ON "UGCPostComments" ("commentType");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_sentiment ON "UGCPostComments" (sentiment);
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_reply_status ON "UGCPostComments" ("autoReplyStatus");
CREATE INDEX IF NOT EXISTS idx_ugc_post_comments_platform ON "UGCPostComments" (platform);

-- Si la tabla ya existia (de una fase anterior), agregar columnas nuevas de FASE 2
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='parentCommentId') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "parentCommentId" INTEGER REFERENCES "UGCPostComments"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='classifiedAt') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "classifiedAt" TIMESTAMPTZ;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='classifiedBy') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "classifiedBy" VARCHAR(100);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='autoRepliedAt') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "autoRepliedAt" TIMESTAMPTZ;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='authorProfileImageUrl') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "authorProfileImageUrl" VARCHAR(1024);
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='assignedAgentIdentityId') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "assignedAgentIdentityId" INTEGER REFERENCES "AgentIdentities"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

-- Migrar datos legacy: assignedAgentId -> assignedAgentIdentityId
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='assignedAgentId')
     AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='UGCPostComments' AND column_name='assignedAgentIdentityId') THEN
    UPDATE "UGCPostComments"
    SET "assignedAgentIdentityId" = "assignedAgentId"
    WHERE "assignedAgentId" IS NOT NULL AND "assignedAgentIdentityId" IS NULL;
  END IF;
END$$;

COMMIT;

-- =============================================================================
-- FIN — UGC Phase 2 Tables
-- =============================================================================
