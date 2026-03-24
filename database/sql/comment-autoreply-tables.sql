-- ============================================================
-- Comment Auto-Reply System — ChatEAM JR
-- Tablas para auto-respondedor de comentarios de publicaciones
-- Fecha: 2026-03-02
-- ============================================================

-- 1. Campañas de auto-respuesta a comentarios
CREATE TABLE IF NOT EXISTS "CommentAutoReplyCampaigns" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id),

  -- Configuración de alcance
  name VARCHAR(255) NOT NULL,
  "campaignType" VARCHAR(20) NOT NULL DEFAULT 'post',     -- 'post' | 'page' | 'all'
  platform VARCHAR(20) NOT NULL DEFAULT 'facebook',        -- 'facebook' | 'instagram'

  -- Conexión con publicación/página
  "pageId" VARCHAR(255),
  "pageName" VARCHAR(255),
  "pageAccessToken" TEXT,
  "postId" VARCHAR(255),
  "postPermalink" VARCHAR(1024),
  "postDescription" TEXT,
  "postThumbnail" VARCHAR(1024),

  -- Configuración de respuesta
  "replyMode" VARCHAR(20) DEFAULT 'keyword',               -- 'keyword' | 'ai' | 'generic' | 'template'

  -- Keyword matching
  "triggerMatchingType" VARCHAR(10) DEFAULT 'contains',     -- 'exact' | 'contains'
  "keywordRules" JSONB DEFAULT '[]'::jsonb,
  -- Ejemplo: [{ "keywords": ["precio","costo"], "publicReply": "Info por DM", "privateReply": "Hola {name}..." }]

  "defaultPublicReply" TEXT,
  "defaultPrivateReply" TEXT,

  -- AI configuration
  "aiEnabled" BOOLEAN DEFAULT false,
  "aiTrainingData" TEXT,
  "aiAgentIdentityId" INTEGER,

  -- Acciones automáticas
  "autoLikeComment" BOOLEAN DEFAULT false,
  "hideCommentAfterReply" BOOLEAN DEFAULT false,
  "sendPrivateReply" BOOLEAN DEFAULT true,
  "sendPublicReply" BOOLEAN DEFAULT true,

  -- Moderación
  "offensiveWordsEnabled" BOOLEAN DEFAULT false,
  "offensiveWords" TEXT,                                    -- CSV de palabras
  "offensiveAction" VARCHAR(10) DEFAULT 'hide',             -- 'hide' | 'delete' | 'block'
  "offensivePrivateMessage" TEXT,

  -- Control
  "multipleReply" BOOLEAN DEFAULT false,
  "delayEnabled" BOOLEAN DEFAULT false,
  "delayMinSeconds" INTEGER DEFAULT 5,
  "delayMaxSeconds" INTEGER DEFAULT 30,

  -- Estado
  status VARCHAR(20) DEFAULT 'active',                      -- 'active' | 'paused' | 'draft' | 'deleted'

  -- Estadísticas denormalizadas
  "totalRepliesSent" INTEGER DEFAULT 0,
  "totalPrivateRepliesSent" INTEGER DEFAULT 0,
  "totalCommentsHidden" INTEGER DEFAULT 0,
  "totalCommentsDeleted" INTEGER DEFAULT 0,
  "totalLikesGiven" INTEGER DEFAULT 0,
  "lastReplyAt" TIMESTAMPTZ,

  -- Auditoría
  "createdAt" TIMESTAMPTZ DEFAULT NOW(),
  "updatedAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_campaigns_company ON "CommentAutoReplyCampaigns" ("companyId");
CREATE INDEX IF NOT EXISTS idx_car_campaigns_post ON "CommentAutoReplyCampaigns" ("postId");
CREATE INDEX IF NOT EXISTS idx_car_campaigns_page ON "CommentAutoReplyCampaigns" ("pageId");
CREATE INDEX IF NOT EXISTS idx_car_campaigns_status ON "CommentAutoReplyCampaigns" (status);

-- 2. Logs de respuestas automáticas
CREATE TABLE IF NOT EXISTS "CommentAutoReplyLogs" (
  id SERIAL PRIMARY KEY,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"(id),
  "campaignId" INTEGER NOT NULL REFERENCES "CommentAutoReplyCampaigns"(id),

  -- Comentario original
  "platformCommentId" VARCHAR(255) NOT NULL,
  "postId" VARCHAR(255),
  "commentText" TEXT NOT NULL,
  "commenterName" VARCHAR(255),
  "commenterId" VARCHAR(255),
  "commenterProfileUrl" VARCHAR(1024),
  "commentedAt" TIMESTAMPTZ,

  -- Respuesta pública
  "publicReplyText" TEXT,
  "publicReplyId" VARCHAR(255),
  "publicReplyStatus" VARCHAR(20) DEFAULT 'pending',        -- pending | sent | failed | skipped

  -- Respuesta privada (DM)
  "privateReplyText" TEXT,
  "privateReplyId" VARCHAR(255),
  "privateReplyStatus" VARCHAR(20) DEFAULT 'pending',

  -- Acciones ejecutadas
  "wasLiked" BOOLEAN DEFAULT false,
  "wasHidden" BOOLEAN DEFAULT false,
  "wasDeleted" BOOLEAN DEFAULT false,
  "wasBlocked" BOOLEAN DEFAULT false,
  "matchedKeyword" VARCHAR(255),
  "replySource" VARCHAR(20) DEFAULT 'keyword',              -- keyword | ai | default | offensive

  -- IA (si aplicó)
  "aiClassification" VARCHAR(50),
  "aiSentiment" VARCHAR(20),
  "aiPurchaseIntentScore" DECIMAL(3,2),

  -- Error tracking
  "errorMessage" TEXT,

  -- Auditoría
  "processedAt" TIMESTAMPTZ DEFAULT NOW(),
  "createdAt" TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_car_logs_company ON "CommentAutoReplyLogs" ("companyId");
CREATE INDEX IF NOT EXISTS idx_car_logs_campaign ON "CommentAutoReplyLogs" ("campaignId");
CREATE INDEX IF NOT EXISTS idx_car_logs_commenter ON "CommentAutoReplyLogs" ("commenterId");
CREATE INDEX IF NOT EXISTS idx_car_logs_status ON "CommentAutoReplyLogs" ("publicReplyStatus");
CREATE INDEX IF NOT EXISTS idx_car_logs_post ON "CommentAutoReplyLogs" ("postId");
