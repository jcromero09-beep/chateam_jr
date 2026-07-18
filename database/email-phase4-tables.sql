-- ============================================================================
-- Email Marketing Phase 4 — Automatizacion + A/B Testing + Segmentacion
-- ChatEAM JR v6.0.0
-- Fecha: 2026-03-02
-- BD SAGRADA: Nunca DROP, siempre IF NOT EXISTS
-- ============================================================================

-- ============================================================================
-- Tabla: email_automations
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_automations (
    id BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    "triggerType" VARCHAR(50) NOT NULL,
    -- Valores: 'contact_added', 'contact_tag_added', 'campaign_opened',
    --          'campaign_not_opened', 'link_clicked', 'date_trigger', 'inactivity'
    "triggerConfig" JSONB DEFAULT '{}',
    status VARCHAR(50) DEFAULT 'draft',
    -- Valores: 'draft', 'active', 'paused', 'completed'
    "emailTemplateId" BIGINT REFERENCES email_templates(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "emailSubject" VARCHAR(500),
    "emailContent" TEXT,
    "delaySeconds" INTEGER DEFAULT 0,
    "contactListId" INTEGER REFERENCES "ContactLists"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "totalTriggered" INTEGER DEFAULT 0,
    "totalSent" INTEGER DEFAULT 0,
    "totalOpened" INTEGER DEFAULT 0,
    "totalClicked" INTEGER DEFAULT 0,
    "lastTriggeredAt" TIMESTAMPTZ,
    "createdBy" BIGINT REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para email_automations
CREATE INDEX IF NOT EXISTS idx_email_automations_company ON email_automations("companyId");
CREATE INDEX IF NOT EXISTS idx_email_automations_status ON email_automations(status);
CREATE INDEX IF NOT EXISTS idx_email_automations_trigger_type ON email_automations("triggerType");
CREATE INDEX IF NOT EXISTS idx_email_automations_active ON email_automations("isActive");
CREATE INDEX IF NOT EXISTS idx_email_automations_company_active ON email_automations("companyId", "isActive", status);

-- ============================================================================
-- Tabla: email_ab_tests
-- ============================================================================
CREATE TABLE IF NOT EXISTS email_ab_tests (
    id BIGSERIAL PRIMARY KEY,
    "companyId" BIGINT NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    "campaignId" BIGINT NOT NULL REFERENCES email_campaigns(id) ON UPDATE CASCADE ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    "testType" VARCHAR(50) DEFAULT 'subject',
    -- Valores: 'subject', 'content', 'send_time'
    status VARCHAR(50) DEFAULT 'draft',
    -- Valores: 'draft', 'running', 'completed', 'cancelled'
    variants JSONB NOT NULL,
    -- Formato: [{ id: 'A', subject: '...', content: '...', percentage: 50 }, ...]
    "winnerCriteria" VARCHAR(50) DEFAULT 'open_rate',
    -- Valores: 'open_rate', 'click_rate'
    "winnerVariantId" VARCHAR(10),
    "testPercentage" INTEGER DEFAULT 20,
    "testDurationHours" INTEGER DEFAULT 4,
    results JSONB,
    -- Formato: { A: { sent: 100, opened: 30, clicked: 10 }, B: { ... } }
    "decidedAt" TIMESTAMPTZ,
    "createdBy" BIGINT REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "isActive" BOOLEAN DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indices para email_ab_tests
CREATE INDEX IF NOT EXISTS idx_email_ab_tests_company ON email_ab_tests("companyId");
CREATE INDEX IF NOT EXISTS idx_email_ab_tests_campaign ON email_ab_tests("campaignId");
CREATE INDEX IF NOT EXISTS idx_email_ab_tests_status ON email_ab_tests(status);
CREATE INDEX IF NOT EXISTS idx_email_ab_tests_active ON email_ab_tests("isActive");
CREATE INDEX IF NOT EXISTS idx_email_ab_tests_company_active ON email_ab_tests("companyId", "isActive");

-- ============================================================================
-- Indice adicional en email_campaign_recipients para segmentacion
-- (Optimiza queries de SegmentationService)
-- ============================================================================
CREATE INDEX IF NOT EXISTS idx_ecr_company_contact_opens
    ON email_campaign_recipients("companyId", "contactId", "openedAt");
CREATE INDEX IF NOT EXISTS idx_ecr_company_contact_clicks
    ON email_campaign_recipients("companyId", "contactId", "clickedAt");
CREATE INDEX IF NOT EXISTS idx_ecr_company_contact_bounces
    ON email_campaign_recipients("companyId", "contactId", "bouncedAt");
CREATE INDEX IF NOT EXISTS idx_ecr_personalization_data
    ON email_campaign_recipients USING GIN ("personalizationData");

-- ============================================================================
-- FIN
-- ============================================================================
