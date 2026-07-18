-- =====================================================
-- AGREGAR CAMPOS DE FACEBOOK ADS ACCOUNT A CompaniesSettings
-- =====================================================
-- Ejecutar en pgAdmin para agregar columnas de configuración
-- de cuenta publicitaria de Facebook por Company
--
-- ESCENARIO:
-- Un cliente con 1 App de Facebook y 1 Business Portfolio
-- puede tener múltiples cuentas publicitarias.
-- Cada Company de Chateam puede conectarse a una cuenta diferente.
-- =====================================================

-- 1. Agregar columna facebookAdAccountId
-- Formato: act_123456789 (ID de la cuenta publicitaria)
ALTER TABLE "CompaniesSettings"
ADD COLUMN IF NOT EXISTS "facebookAdAccountId" VARCHAR(255);

COMMENT ON COLUMN "CompaniesSettings"."facebookAdAccountId" IS
'ID de la cuenta publicitaria de Facebook (formato: act_XXXXXXXXX)';

-- 2. Agregar columna facebookBusinessId
-- ID del Business Manager / Portfolio
ALTER TABLE "CompaniesSettings"
ADD COLUMN IF NOT EXISTS "facebookBusinessId" VARCHAR(255);

COMMENT ON COLUMN "CompaniesSettings"."facebookBusinessId" IS
'ID del Business Manager de Facebook (Portfolio)';

-- 3. Agregar columna facebookSystemUserToken
-- Token con permisos sobre la cuenta publicitaria
ALTER TABLE "CompaniesSettings"
ADD COLUMN IF NOT EXISTS "facebookSystemUserToken" TEXT;

COMMENT ON COLUMN "CompaniesSettings"."facebookSystemUserToken" IS
'Token de System User con permisos: ads_read, ads_management, business_management';

-- 4. Crear índice para búsqueda rápida por Ad Account
CREATE INDEX IF NOT EXISTS "idx_companies_settings_fb_ad_account"
ON "CompaniesSettings" ("facebookAdAccountId");

-- 5. Crear índice para búsqueda por Business Manager
CREATE INDEX IF NOT EXISTS "idx_companies_settings_fb_business"
ON "CompaniesSettings" ("facebookBusinessId");

-- =====================================================
-- VERIFICACIÓN
-- =====================================================
-- Verificar que las columnas fueron creadas correctamente
SELECT
    column_name,
    data_type,
    character_maximum_length,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'CompaniesSettings'
AND column_name IN (
    'facebookAdAccountId',
    'facebookBusinessId',
    'facebookSystemUserToken'
)
ORDER BY column_name;

-- =====================================================
-- EJEMPLO DE USO
-- =====================================================
-- Después de ejecutar este SQL, puedes configurar cada Company:
--
-- UPDATE "CompaniesSettings"
-- SET
--     "facebookAdAccountId" = 'act_123456789',
--     "facebookBusinessId" = '987654321',
--     "facebookSystemUserToken" = 'EAAxxxxxxx...'
-- WHERE "companyId" = 1;
--
-- Esto permite que Company 1 use Ad Account 1,
-- y Company 2 use Ad Account 2 del mismo Business Portfolio.
-- =====================================================
