-- =====================================================
-- INTEGRACIÓN TIKTOK COMMENTS — Modelos UGC + Business API
-- =====================================================
-- Ejecutar en pgAdmin para agregar columnas necesarias
-- para la integración de comentarios TikTok con modelos UGC,
-- credenciales por company, y soporte Business API.
--
-- ESCENARIO:
-- Los comentarios de TikTok se almacenan en UGCPostComments
-- (no en Messages/Tickets). Cada company puede tener sus
-- propias credenciales TikTok. Business API permite responder.
-- =====================================================

-- =====================================================
-- 1. UGCPOSTCOMMENTS — Campos adicionales para TikTok
-- =====================================================

-- 1.1 Campo fromMe: Distinguir replies propios (IA o manual)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='UGCPostComments' AND column_name='fromMe') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "fromMe" BOOLEAN DEFAULT false;
  END IF;
END$$;

COMMENT ON COLUMN "UGCPostComments"."fromMe" IS
'true si el comentario fue enviado por nosotros (reply manual o IA)';

-- 1.2 Campo whatsappId: Referencia a la conexión TikTok en Whatsapps
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='UGCPostComments' AND column_name='whatsappId') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "whatsappId" INTEGER
      REFERENCES "Whatsapps"(id) ON UPDATE CASCADE ON DELETE SET NULL;
  END IF;
END$$;

COMMENT ON COLUMN "UGCPostComments"."whatsappId" IS
'FK a Whatsapps — conexión TikTok que originó este comentario';

-- 1.3 Campo likeCount: Cantidad de likes del comentario
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='UGCPostComments' AND column_name='likeCount') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "likeCount" INTEGER DEFAULT 0;
  END IF;
END$$;

COMMENT ON COLUMN "UGCPostComments"."likeCount" IS
'Cantidad de likes que tiene el comentario en TikTok';

-- 1.4 Campo replyCount: Cantidad de respuestas al comentario
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='UGCPostComments' AND column_name='replyCount') THEN
    ALTER TABLE "UGCPostComments" ADD COLUMN "replyCount" INTEGER DEFAULT 0;
  END IF;
END$$;

COMMENT ON COLUMN "UGCPostComments"."replyCount" IS
'Cantidad de respuestas que tiene el comentario en TikTok';

-- 1.5 Índices para búsqueda eficiente
CREATE INDEX IF NOT EXISTS "idx_ugc_post_comments_whatsapp"
ON "UGCPostComments" ("whatsappId");

CREATE INDEX IF NOT EXISTS "idx_ugc_post_comments_from_me"
ON "UGCPostComments" ("fromMe");

-- =====================================================
-- 2. COMPANIESSETTINGS — Credenciales TikTok por empresa
-- =====================================================

-- 2.1 TikTok Login Kit: Client Key (App ID)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='CompaniesSettings' AND column_name='tiktokClientKey') THEN
    ALTER TABLE "CompaniesSettings" ADD COLUMN "tiktokClientKey" VARCHAR(255);
  END IF;
END$$;

COMMENT ON COLUMN "CompaniesSettings"."tiktokClientKey" IS
'TikTok Login Kit App ID (Client Key) — obtenido de developers.tiktok.com';

-- 2.2 TikTok Login Kit: Client Secret
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='CompaniesSettings' AND column_name='tiktokClientSecret') THEN
    ALTER TABLE "CompaniesSettings" ADD COLUMN "tiktokClientSecret" VARCHAR(255);
  END IF;
END$$;

COMMENT ON COLUMN "CompaniesSettings"."tiktokClientSecret" IS
'TikTok Login Kit App Secret — obtenido de developers.tiktok.com';

-- 2.3 TikTok Business API: App ID
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='CompaniesSettings' AND column_name='tiktokBusinessAppId') THEN
    ALTER TABLE "CompaniesSettings" ADD COLUMN "tiktokBusinessAppId" VARCHAR(255);
  END IF;
END$$;

COMMENT ON COLUMN "CompaniesSettings"."tiktokBusinessAppId" IS
'TikTok Business API App ID — obtenido de business-api.tiktok.com';

-- 2.4 TikTok Business API: Secret
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='CompaniesSettings' AND column_name='tiktokBusinessSecret') THEN
    ALTER TABLE "CompaniesSettings" ADD COLUMN "tiktokBusinessSecret" VARCHAR(255);
  END IF;
END$$;

COMMENT ON COLUMN "CompaniesSettings"."tiktokBusinessSecret" IS
'TikTok Business API Secret — obtenido de business-api.tiktok.com';

-- Índice para búsqueda por credenciales TikTok
CREATE INDEX IF NOT EXISTS "idx_companies_settings_tiktok_client"
ON "CompaniesSettings" ("tiktokClientKey");

-- =====================================================
-- 3. WHATSAPPS — Campos Business API por conexión
-- =====================================================

-- 3.1 Intervalo de polling configurable (segundos)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokPollingInterval') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokPollingInterval" INTEGER DEFAULT 120;
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokPollingInterval" IS
'Intervalo de polling en segundos: 30, 60, 120, 300, 600';

-- 3.2 Business API Access Token
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokBusinessAccessToken') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokBusinessAccessToken" TEXT;
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokBusinessAccessToken" IS
'Access Token de TikTok Business API para responder comentarios';

-- 3.3 Business API Refresh Token
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokBusinessRefreshToken') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokBusinessRefreshToken" TEXT;
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokBusinessRefreshToken" IS
'Refresh Token de TikTok Business API';

-- 3.4 Business API Advertiser ID
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokBusinessAdvertiserId') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokBusinessAdvertiserId" VARCHAR(255);
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokBusinessAdvertiserId" IS
'Advertiser ID de TikTok Business API';

-- 3.5 Business Token Expiration
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokBusinessTokenExpiresAt') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokBusinessTokenExpiresAt" TIMESTAMPTZ;
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokBusinessTokenExpiresAt" IS
'Fecha de expiración del token Business API';

-- 3.6 Business API Connected Flag
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
    WHERE table_name='Whatsapps' AND column_name='tiktokBusinessConnected') THEN
    ALTER TABLE "Whatsapps" ADD COLUMN "tiktokBusinessConnected" BOOLEAN DEFAULT false;
  END IF;
END$$;

COMMENT ON COLUMN "Whatsapps"."tiktokBusinessConnected" IS
'true si la conexión tiene Business API activa (permite responder comentarios)';

-- =====================================================
-- VERIFICACIÓN
-- =====================================================

-- Verificar columnas en UGCPostComments
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'UGCPostComments'
AND column_name IN ('fromMe', 'whatsappId', 'likeCount', 'replyCount')
ORDER BY column_name;

-- Verificar columnas en CompaniesSettings
SELECT column_name, data_type, character_maximum_length
FROM information_schema.columns
WHERE table_name = 'CompaniesSettings'
AND column_name IN ('tiktokClientKey', 'tiktokClientSecret', 'tiktokBusinessAppId', 'tiktokBusinessSecret')
ORDER BY column_name;

-- Verificar columnas en Whatsapps
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'Whatsapps'
AND column_name IN ('tiktokPollingInterval', 'tiktokBusinessAccessToken', 'tiktokBusinessRefreshToken',
                     'tiktokBusinessAdvertiserId', 'tiktokBusinessTokenExpiresAt', 'tiktokBusinessConnected')
ORDER BY column_name;
