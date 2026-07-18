-- =============================================================================
-- UGC Phase 3 — Creator Network, Payments & Feedback Loop (5 tablas)
-- Idempotente: seguro de ejecutar multiples veces
-- BD SAGRADA: Solo CREATE TABLE IF NOT EXISTS, nunca DROP ni DELETE
-- Fecha: 2026-03-01
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. UGCCreators — Creadores de contenido humanos en la red de creadores
-- (DEBE ir ANTES de UGCCreatorAssignments y UGCCreatorPayments por FK)
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCreators" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50),
  "profileImageUrl" VARCHAR(1024),
  bio TEXT,
  niche VARCHAR(255) NOT NULL,
  platforms JSONB DEFAULT '[]',
  "followerCount" INTEGER DEFAULT 0,
  "engagementRate" DECIMAL(5,2) DEFAULT 0,
  "averageViews" INTEGER DEFAULT 0,
  "completedCampaigns" INTEGER DEFAULT 0,
  rating DECIMAL(3,2) DEFAULT 0,
  "baseRate" DECIMAL(10,2) DEFAULT 0,
  currency VARCHAR(10) DEFAULT 'USD',
  "paymentMethod" VARCHAR(50) DEFAULT 'stripe',
  "stripeAccountId" VARCHAR(255),
  "paypalEmail" VARCHAR(255),
  "bankDetails" JSONB,
  portfolio JSONB DEFAULT '[]',
  tags JSONB DEFAULT '[]',
  status VARCHAR(50) DEFAULT 'pending',
  "verifiedAt" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creators_company ON "UGCCreators" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_creators_niche ON "UGCCreators" (niche);
CREATE INDEX IF NOT EXISTS idx_ugc_creators_status ON "UGCCreators" (status);
CREATE INDEX IF NOT EXISTS idx_ugc_creators_email ON "UGCCreators" (email);

-- =============================================================================
-- 2. UGCCreatorAssignments — Asignaciones creador-campana con brief y entregas
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCreatorAssignments" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "creatorId" INTEGER NOT NULL REFERENCES "UGCCreators"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "campaignId" INTEGER NOT NULL REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  brief TEXT NOT NULL,
  requirements JSONB DEFAULT '{}',
  deadline TIMESTAMPTZ NOT NULL,
  "agreedRate" DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  deliverables JSONB DEFAULT '[]',
  "revisionCount" INTEGER DEFAULT 0,
  "maxRevisions" INTEGER DEFAULT 2,
  feedback TEXT,
  "creatorNotes" TEXT,
  status VARCHAR(50) DEFAULT 'invited',
  "invitedAt" TIMESTAMPTZ,
  "acceptedAt" TIMESTAMPTZ,
  "submittedAt" TIMESTAMPTZ,
  "approvedAt" TIMESTAMPTZ,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creator_assignments_company ON "UGCCreatorAssignments" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_assignments_creator ON "UGCCreatorAssignments" ("creatorId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_assignments_campaign ON "UGCCreatorAssignments" ("campaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_assignments_status ON "UGCCreatorAssignments" (status);

-- =============================================================================
-- 3. UGCCreatorPayments — Pagos a creadores via Stripe Connect / PayPal
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCreatorPayments" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "creatorId" INTEGER NOT NULL REFERENCES "UGCCreators"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "assignmentId" INTEGER REFERENCES "UGCCreatorAssignments"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(10) DEFAULT 'USD',
  "platformFee" DECIMAL(10,2) DEFAULT 0,
  "netAmount" DECIMAL(10,2) NOT NULL,
  "paymentMethod" VARCHAR(50) NOT NULL,
  "stripeTransferId" VARCHAR(255),
  "stripePayoutId" VARCHAR(255),
  "paypalPayoutId" VARCHAR(255),
  "transactionReference" VARCHAR(255),
  "invoiceUrl" VARCHAR(1024),
  description TEXT,
  status VARCHAR(50) DEFAULT 'pending',
  "paidAt" TIMESTAMPTZ,
  "failureReason" TEXT,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creator_payments_company ON "UGCCreatorPayments" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_payments_creator ON "UGCCreatorPayments" ("creatorId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_payments_assignment ON "UGCCreatorPayments" ("assignmentId");
CREATE INDEX IF NOT EXISTS idx_ugc_creator_payments_status ON "UGCCreatorPayments" (status);

-- =============================================================================
-- 4. UGCCampaignMetrics — Snapshots horarios para feedback loop autonomo
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCampaignMetrics" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "campaignId" INTEGER NOT NULL REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "snapshotAt" TIMESTAMPTZ NOT NULL,
  -- Metricas de alcance
  "totalViews" INTEGER DEFAULT 0,
  "totalLikes" INTEGER DEFAULT 0,
  "totalComments" INTEGER DEFAULT 0,
  "totalShares" INTEGER DEFAULT 0,
  "totalEngagement" DECIMAL(5,2) DEFAULT 0,
  "totalReach" INTEGER DEFAULT 0,
  "totalImpressions" INTEGER DEFAULT 0,
  -- Metricas de conversion
  "purchaseIntents" INTEGER DEFAULT 0,
  "whatsappTriggers" INTEGER DEFAULT 0,
  "newFollowers" INTEGER DEFAULT 0,
  -- Metricas de costo
  "costPerView" DECIMAL(8,4) DEFAULT 0,
  "costPerEngagement" DECIMAL(8,4) DEFAULT 0,
  roas DECIMAL(8,2) DEFAULT 0,
  -- Metricas de campana
  "videoCount" INTEGER DEFAULT 0,
  "activeAgentCount" INTEGER DEFAULT 0,
  "commentResponseRate" DECIMAL(5,2) DEFAULT 0,
  "avgConsistencyScore" DECIMAL(3,2) DEFAULT 0,
  -- Desglose y top content
  "platformBreakdown" JSONB DEFAULT '{}',
  "topPerformingContent" JSONB DEFAULT '[]',
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_campaign_metrics_company ON "UGCCampaignMetrics" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_metrics_campaign ON "UGCCampaignMetrics" ("campaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_metrics_snapshot ON "UGCCampaignMetrics" ("snapshotAt");
CREATE INDEX IF NOT EXISTS idx_ugc_campaign_metrics_campaign_snapshot ON "UGCCampaignMetrics" ("campaignId", "snapshotAt");

-- =============================================================================
-- 5. UGCCreativeLearnings — Insights del feedback loop autonomo
-- =============================================================================
CREATE TABLE IF NOT EXISTS "UGCCreativeLearnings" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
  "campaignId" INTEGER REFERENCES "UGCCampaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL,
  "learningType" VARCHAR(50) NOT NULL,
  title VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  evidence JSONB DEFAULT '{}',
  impact VARCHAR(50) DEFAULT 'medium',
  confidence DECIMAL(3,2) DEFAULT 0,
  recommendation TEXT,
  "appliedAt" TIMESTAMPTZ,
  "appliedResult" JSONB,
  source VARCHAR(50) DEFAULT 'feedback_loop',
  "extractedBy" VARCHAR(255),
  "isActive" BOOLEAN DEFAULT true,
  metadata JSONB DEFAULT '{}',
  "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_company ON "UGCCreativeLearnings" ("companyId");
CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_campaign ON "UGCCreativeLearnings" ("campaignId");
CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_type ON "UGCCreativeLearnings" ("learningType");
CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_impact ON "UGCCreativeLearnings" (impact);
CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_source ON "UGCCreativeLearnings" (source);
CREATE INDEX IF NOT EXISTS idx_ugc_creative_learnings_active ON "UGCCreativeLearnings" ("isActive");

COMMIT;

-- =============================================================================
-- FIN — UGC Phase 3 Tables (5 tablas, 24 indices)
-- =============================================================================
