-- =====================================================
-- SISTEMA DE ATRIBUCIÓN MULTI-TOUCH - TABLAS SQL
-- Ejecutar en pgAdmin para crear todas las tablas
-- =====================================================
-- COMENTADO: Estas tablas son para un sistema de atribución futuro
-- Descomentar cuando se necesite implementar el tracking de conversiones

/*
-- 1. TABLA: Products (Catálogo de productos)
-- =====================================================
CREATE TABLE IF NOT EXISTS "Products" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,

    -- Product Information
    name VARCHAR(255) NOT NULL,
    description TEXT,
    sku VARCHAR(100),

    -- Pricing
    price DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BRL' NOT NULL,
    "costPrice" DECIMAL(10, 2),

    -- Categorization
    category VARCHAR(100),
    subcategory VARCHAR(100),
    tags JSONB,

    -- AI Detection Keywords
    "detectionKeywords" JSONB,

    -- Status
    active BOOLEAN DEFAULT true NOT NULL,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for Products
CREATE INDEX IF NOT EXISTS idx_products_company_active ON "Products"("companyId", active);
CREATE INDEX IF NOT EXISTS idx_products_category ON "Products"(category);
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_sku ON "Products"("companyId", sku) WHERE sku IS NOT NULL;

-- 2. TABLA: AttributionTouchpoints (Registro de cada interacción)
-- =====================================================
CREATE TABLE IF NOT EXISTS "AttributionTouchpoints" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "contactId" INTEGER NOT NULL REFERENCES "Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE,

    -- Touchpoint Identification
    channel VARCHAR(50) NOT NULL,
    "touchpointType" VARCHAR(50) NOT NULL,

    -- Campaign & Message References
    "campaignId" INTEGER REFERENCES "Campaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "campaignShippingId" INTEGER REFERENCES "CampaignShipping"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "messageId" INTEGER REFERENCES "Messages"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "ticketId" INTEGER REFERENCES "Tickets"(id) ON UPDATE CASCADE ON DELETE SET NULL,

    -- Facebook Click-to-WhatsApp Attribution
    "ctwaClid" VARCHAR(255),
    fbclid VARCHAR(255),
    "facebookCampaignId" VARCHAR(255),
    "facebookAdsetId" VARCHAR(255),
    "facebookAdId" VARCHAR(255),

    -- UTM Parameters
    "utmSource" VARCHAR(255),
    "utmMedium" VARCHAR(255),
    "utmCampaign" VARCHAR(255),
    "utmTerm" VARCHAR(255),
    "utmContent" VARCHAR(255),

    -- Touchpoint Metadata
    "touchpointTimestamp" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "sessionId" VARCHAR(255),
    "deviceInfo" JSONB,
    metadata JSONB,

    -- Attribution Journey Tracking
    "journeyId" VARCHAR(255) NOT NULL,
    "sequenceNumber" INTEGER DEFAULT 1,

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for AttributionTouchpoints
CREATE INDEX IF NOT EXISTS idx_touchpoints_contact_journey ON "AttributionTouchpoints"("contactId", "journeyId");
CREATE INDEX IF NOT EXISTS idx_touchpoints_ctwa_clid ON "AttributionTouchpoints"("ctwaClid");
CREATE INDEX IF NOT EXISTS idx_touchpoints_campaign ON "AttributionTouchpoints"("campaignId");
CREATE INDEX IF NOT EXISTS idx_touchpoints_timestamp ON "AttributionTouchpoints"("touchpointTimestamp");
CREATE INDEX IF NOT EXISTS idx_touchpoints_company_contact ON "AttributionTouchpoints"("companyId", "contactId");
CREATE INDEX IF NOT EXISTS idx_touchpoints_journey ON "AttributionTouchpoints"("journeyId");

-- 3. TABLA: ConversionDetections (Ventas detectadas por IA - pendientes)
-- =====================================================
CREATE TABLE IF NOT EXISTS "ConversionDetections" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "ticketId" INTEGER NOT NULL REFERENCES "Tickets"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "contactId" INTEGER NOT NULL REFERENCES "Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "messageId" INTEGER REFERENCES "Messages"(id) ON UPDATE CASCADE ON DELETE SET NULL,

    -- AI Detection Data
    "detectionConfidence" DECIMAL(3, 2) NOT NULL,
    "detectedAmount" DECIMAL(10, 2),
    "detectedCurrency" VARCHAR(10) DEFAULT 'BRL',
    "detectedProducts" JSONB,
    "saleKeywords" JSONB,

    -- Status
    status VARCHAR(30) DEFAULT 'pending' NOT NULL,

    -- AI Analysis
    "aiAnalysis" JSONB,
    "messageContext" TEXT,

    -- Agent Review
    "reviewedBy" INTEGER REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "reviewedAt" TIMESTAMP WITH TIME ZONE,
    "reviewNotes" TEXT,

    -- Timestamps
    "detectedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ConversionDetections
CREATE INDEX IF NOT EXISTS idx_detections_company_status ON "ConversionDetections"("companyId", status);
CREATE INDEX IF NOT EXISTS idx_detections_ticket ON "ConversionDetections"("ticketId");
CREATE INDEX IF NOT EXISTS idx_detections_detected_at ON "ConversionDetections"("detectedAt");
CREATE INDEX IF NOT EXISTS idx_detections_confidence ON "ConversionDetections"("detectionConfidence");

-- 4. TABLA: AttributionConversions (Ventas confirmadas finales)
-- =====================================================
CREATE TABLE IF NOT EXISTS "AttributionConversions" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "ticketId" INTEGER REFERENCES "Tickets"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "contactId" INTEGER NOT NULL REFERENCES "Contacts"(id) ON UPDATE CASCADE ON DELETE CASCADE,

    -- Revenue Data
    "totalRevenue" DECIMAL(10, 2) NOT NULL,
    currency VARCHAR(10) DEFAULT 'BRL' NOT NULL,

    -- Order Information
    "orderId" VARCHAR(100),
    "orderDate" TIMESTAMP WITH TIME ZONE,

    -- Source & Attribution
    "conversionSource" VARCHAR(50) DEFAULT 'manual' NOT NULL,
    "detectionId" INTEGER REFERENCES "ConversionDetections"(id) ON UPDATE CASCADE ON DELETE SET NULL,

    -- Journey Reference
    "journeyId" VARCHAR(255),

    -- Status
    status VARCHAR(30) DEFAULT 'confirmed' NOT NULL,

    -- Timing
    "convertedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "firstTouchTimestamp" TIMESTAMP WITH TIME ZONE,
    "lastTouchTimestamp" TIMESTAMP WITH TIME ZONE,
    "conversionDurationHours" DECIMAL(10, 2),

    -- Attribution Status
    "attributionStatus" VARCHAR(30) DEFAULT 'pending',
    "attributionCalculatedAt" TIMESTAMP WITH TIME ZONE,

    -- Agent Information
    "createdBy" INTEGER REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "verifiedBy" INTEGER REFERENCES "Users"(id) ON UPDATE CASCADE ON DELETE SET NULL,

    -- Notes
    notes TEXT,
    "internalNotes" TEXT,

    -- Metadata
    metadata JSONB,

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for AttributionConversions
CREATE INDEX IF NOT EXISTS idx_conversions_journey ON "AttributionConversions"("journeyId");
CREATE INDEX IF NOT EXISTS idx_conversions_contact ON "AttributionConversions"("contactId");
CREATE INDEX IF NOT EXISTS idx_conversions_timestamp ON "AttributionConversions"("convertedAt");
CREATE INDEX IF NOT EXISTS idx_conversions_company ON "AttributionConversions"("companyId");
CREATE INDEX IF NOT EXISTS idx_conversions_company_status ON "AttributionConversions"("companyId", status);

-- 5. TABLA: ConversionItems (Línea de productos vendidos)
-- =====================================================
CREATE TABLE IF NOT EXISTS "ConversionItems" (
    id SERIAL PRIMARY KEY,
    "conversionId" INTEGER NOT NULL REFERENCES "AttributionConversions"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "productId" INTEGER REFERENCES "Products"(id) ON UPDATE CASCADE ON DELETE SET NULL,

    -- Item Details
    "productName" VARCHAR(255) NOT NULL,
    "productSku" VARCHAR(100),

    -- Pricing
    quantity INTEGER DEFAULT 1 NOT NULL,
    "unitPrice" DECIMAL(10, 2) NOT NULL,
    "totalPrice" DECIMAL(10, 2) NOT NULL,
    discount DECIMAL(10, 2) DEFAULT 0,

    -- Notes
    notes TEXT,

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for ConversionItems
CREATE INDEX IF NOT EXISTS idx_conversion_items_conversion ON "ConversionItems"("conversionId");
CREATE INDEX IF NOT EXISTS idx_conversion_items_product ON "ConversionItems"("productId");

-- 6. TABLA: AttributionResults (Resultados pre-calculados por modelo)
-- =====================================================
CREATE TABLE IF NOT EXISTS "AttributionResults" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "conversionId" INTEGER NOT NULL REFERENCES "AttributionConversions"(id) ON UPDATE CASCADE ON DELETE CASCADE,
    "touchpointId" INTEGER NOT NULL REFERENCES "AttributionTouchpoints"(id) ON UPDATE CASCADE ON DELETE CASCADE,

    -- Attribution Model Results
    "attributionModel" VARCHAR(30) NOT NULL,
    "attributionWeight" DECIMAL(5, 4) NOT NULL,
    "attributedRevenue" DECIMAL(10, 2) NOT NULL,

    -- Model-Specific Metadata
    "modelParameters" JSONB,

    -- Aggregation Period
    "periodStart" DATE,
    "periodEnd" DATE,

    -- Calculation Timestamp
    "calculatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for AttributionResults
CREATE UNIQUE INDEX IF NOT EXISTS idx_results_unique ON "AttributionResults"("conversionId", "touchpointId", "attributionModel");
CREATE INDEX IF NOT EXISTS idx_results_company_period ON "AttributionResults"("companyId", "periodStart", "periodEnd");
CREATE INDEX IF NOT EXISTS idx_results_model ON "AttributionResults"("attributionModel");

-- 7. TABLA: AttributionChannelAggregates (Métricas agregadas por canal)
-- =====================================================
CREATE TABLE IF NOT EXISTS "AttributionChannelAggregates" (
    id SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"(id) ON UPDATE CASCADE ON DELETE CASCADE,

    -- Aggregation Dimensions
    channel VARCHAR(100) NOT NULL,
    "campaignId" INTEGER REFERENCES "Campaigns"(id) ON UPDATE CASCADE ON DELETE SET NULL,
    "periodStart" DATE NOT NULL,
    "periodEnd" DATE NOT NULL,
    "attributionModel" VARCHAR(30) NOT NULL,

    -- Metrics
    "totalConversions" INTEGER DEFAULT 0,
    "totalRevenue" DECIMAL(12, 2) DEFAULT 0,
    "attributedConversions" DECIMAL(10, 2) DEFAULT 0,
    "attributedRevenue" DECIMAL(12, 2) DEFAULT 0,

    -- Journey Metrics
    "avgTouchpointsPerJourney" DECIMAL(5, 2) DEFAULT 0,
    "multiTouchPercentage" DECIMAL(5, 2) DEFAULT 0,
    "avgConversionTimeHours" DECIMAL(10, 2) DEFAULT 0,

    -- Touchpoint Distribution
    "firstTouchCount" INTEGER DEFAULT 0,
    "middleTouchCount" INTEGER DEFAULT 0,
    "lastTouchCount" INTEGER DEFAULT 0,

    -- Calculation Timestamp
    "calculatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    -- Timestamps
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for AttributionChannelAggregates
CREATE UNIQUE INDEX IF NOT EXISTS idx_aggregates_unique ON "AttributionChannelAggregates"("companyId", channel, "periodStart", "periodEnd", "attributionModel");
CREATE INDEX IF NOT EXISTS idx_aggregates_period ON "AttributionChannelAggregates"("periodStart", "periodEnd");

-- =====================================================
-- AGREGAR CAMPOS A TABLAS EXISTENTES
-- =====================================================

-- 8. Agregar campos de atribución a Messages
-- =====================================================
DO $$
BEGIN
    -- ctwaClid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Messages' AND column_name = 'ctwaClid') THEN
        ALTER TABLE "Messages" ADD COLUMN "ctwaClid" VARCHAR(255);
    END IF;

    -- fbclid
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Messages' AND column_name = 'fbclid') THEN
        ALTER TABLE "Messages" ADD COLUMN fbclid VARCHAR(255);
    END IF;

    -- journeyId
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Messages' AND column_name = 'journeyId') THEN
        ALTER TABLE "Messages" ADD COLUMN "journeyId" VARCHAR(255);
    END IF;

    -- attributionProcessed
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Messages' AND column_name = 'attributionProcessed') THEN
        ALTER TABLE "Messages" ADD COLUMN "attributionProcessed" BOOLEAN DEFAULT false;
    END IF;
END $$;

-- Index for Messages journeyId
CREATE INDEX IF NOT EXISTS idx_messages_journey_id ON "Messages"("journeyId");

-- 9. Agregar campos de atribución a Tickets
-- =====================================================
DO $$
BEGIN
    -- journeyId
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Tickets' AND column_name = 'journeyId') THEN
        ALTER TABLE "Tickets" ADD COLUMN "journeyId" VARCHAR(255);
    END IF;

    -- conversionId
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Tickets' AND column_name = 'conversionId') THEN
        ALTER TABLE "Tickets" ADD COLUMN "conversionId" INTEGER REFERENCES "AttributionConversions"(id) ON UPDATE CASCADE ON DELETE SET NULL;
    END IF;

    -- has_pending_conversion
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Tickets' AND column_name = 'has_pending_conversion') THEN
        ALTER TABLE "Tickets" ADD COLUMN has_pending_conversion BOOLEAN DEFAULT false;
    END IF;

    -- has_confirmed_conversion
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Tickets' AND column_name = 'has_confirmed_conversion') THEN
        ALTER TABLE "Tickets" ADD COLUMN has_confirmed_conversion BOOLEAN DEFAULT false;
    END IF;

    -- total_conversion_value
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Tickets' AND column_name = 'total_conversion_value') THEN
        ALTER TABLE "Tickets" ADD COLUMN total_conversion_value DECIMAL(10, 2);
    END IF;
END $$;

-- Indexes for Tickets
CREATE INDEX IF NOT EXISTS idx_tickets_journey_id ON "Tickets"("journeyId");
CREATE INDEX IF NOT EXISTS idx_tickets_has_conversion ON "Tickets"(has_confirmed_conversion);

-- 10. Agregar campos de atribución a Contacts
-- =====================================================
DO $$
BEGIN
    -- currentJourneyId
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Contacts' AND column_name = 'currentJourneyId') THEN
        ALTER TABLE "Contacts" ADD COLUMN "currentJourneyId" VARCHAR(255);
    END IF;

    -- lastAttributionTouchpoint
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                   WHERE table_name = 'Contacts' AND column_name = 'lastAttributionTouchpoint') THEN
        ALTER TABLE "Contacts" ADD COLUMN "lastAttributionTouchpoint" TIMESTAMP WITH TIME ZONE;
    END IF;
END $$;

-- Index for Contacts
CREATE INDEX IF NOT EXISTS idx_contacts_current_journey ON "Contacts"("currentJourneyId");

-- 11. Agregar conversion_id a LeadSources (si existe la tabla)
-- =====================================================
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'LeadSources') THEN
        IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                       WHERE table_name = 'LeadSources' AND column_name = 'conversion_id') THEN
            ALTER TABLE "LeadSources" ADD COLUMN conversion_id INTEGER REFERENCES "AttributionConversions"(id) ON UPDATE CASCADE ON DELETE SET NULL;
            CREATE INDEX IF NOT EXISTS idx_lead_sources_conversion ON "LeadSources"(conversion_id);
        END IF;
    END IF;
END $$;

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
SELECT
    'Tablas creadas exitosamente:' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name IN (
        'Products',
        'AttributionTouchpoints',
        'ConversionDetections',
        'AttributionConversions',
        'ConversionItems',
        'AttributionResults',
        'AttributionChannelAggregates'
    )) as tablas_creadas;

-- Mostrar las tablas creadas
SELECT table_name
FROM information_schema.tables
WHERE table_name IN (
    'Products',
    'AttributionTouchpoints',
    'ConversionDetections',
    'AttributionConversions',
    'ConversionItems',
    'AttributionResults',
    'AttributionChannelAggregates'
)
ORDER BY table_name;
*/
