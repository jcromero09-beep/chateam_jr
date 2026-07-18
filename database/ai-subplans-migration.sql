-- =====================================================
-- MIGRACION: Crear tabla AISubplans
-- Fecha: 2026-01-12
-- Descripcion: Crea la tabla para gestionar subplanes de IA
--              (paquetes de tokens para compra por usuarios)
-- =====================================================

-- Ejecutar en pgAdmin o psql

-- 1. Crear tabla AISubplans
CREATE TABLE IF NOT EXISTS "AISubplans" (
    "id" SERIAL PRIMARY KEY,
    "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
    "aiProviderConfigId" INTEGER NOT NULL REFERENCES "AIProviderConfigs"("id") ON DELETE CASCADE,
    "name" VARCHAR(100) NOT NULL,
    "description" TEXT,
    "tokens" BIGINT NOT NULL DEFAULT 0,
    "priceUsd" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "stripeProductId" VARCHAR(255),
    "stripePriceId" VARCHAR(255),
    "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- =====================================================
-- INDICES (mejoran rendimiento en consultas)
-- =====================================================

-- Indice por empresa
CREATE INDEX IF NOT EXISTS idx_ai_subplans_company
ON "AISubplans"("companyId");

-- Indice por proveedor
CREATE INDEX IF NOT EXISTS idx_ai_subplans_provider
ON "AISubplans"("aiProviderConfigId");

-- Indice parcial para subplanes activos
CREATE INDEX IF NOT EXISTS idx_ai_subplans_active
ON "AISubplans"("isActive")
WHERE "isActive" = true;

-- Indice parcial para subplanes publicos
CREATE INDEX IF NOT EXISTS idx_ai_subplans_public
ON "AISubplans"("isPublic")
WHERE "isPublic" = true;

-- Indice compuesto para busquedas de subplanes activos y publicos por empresa
CREATE INDEX IF NOT EXISTS idx_ai_subplans_company_active_public
ON "AISubplans"("companyId", "isActive", "isPublic");

-- =====================================================
-- COMENTARIOS (Documentacion en BD)
-- =====================================================

COMMENT ON TABLE "AISubplans" IS 'Subplanes de IA - paquetes de tokens para compra por usuarios finales';

COMMENT ON COLUMN "AISubplans"."id" IS 'Identificador unico del subplan';
COMMENT ON COLUMN "AISubplans"."companyId" IS 'ID de la empresa (multi-tenant)';
COMMENT ON COLUMN "AISubplans"."aiProviderConfigId" IS 'ID del proveedor de IA asociado';
COMMENT ON COLUMN "AISubplans"."name" IS 'Nombre del subplan (ej: Plan Basico, Plan Pro)';
COMMENT ON COLUMN "AISubplans"."description" IS 'Descripcion del subplan';
COMMENT ON COLUMN "AISubplans"."tokens" IS 'Cantidad de tokens incluidos en el subplan';
COMMENT ON COLUMN "AISubplans"."priceUsd" IS 'Precio del subplan en dolares USD';
COMMENT ON COLUMN "AISubplans"."isActive" IS 'Si el subplan esta activo y disponible';
COMMENT ON COLUMN "AISubplans"."isPublic" IS 'Si el subplan es visible para compra por usuarios finales';
COMMENT ON COLUMN "AISubplans"."stripeProductId" IS 'ID del producto en Stripe (opcional)';
COMMENT ON COLUMN "AISubplans"."stripePriceId" IS 'ID del precio en Stripe (opcional)';
COMMENT ON COLUMN "AISubplans"."createdAt" IS 'Fecha de creacion';
COMMENT ON COLUMN "AISubplans"."updatedAt" IS 'Fecha de ultima actualizacion';

-- =====================================================
-- VERIFICACION
-- =====================================================

-- Verificar que la tabla fue creada
SELECT
    table_name,
    column_name,
    data_type,
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'AISubplans'
ORDER BY ordinal_position;

-- Ver indices creados
SELECT
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'AISubplans';

-- Ver restricciones
SELECT
    conname AS constraint_name,
    contype AS constraint_type,
    pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = '"AISubplans"'::regclass;

-- =====================================================
-- DATOS DE EJEMPLO (opcional - descomentar para insertar)
-- =====================================================

/*
-- Insertar subplanes de ejemplo
INSERT INTO "AISubplans" ("companyId", "aiProviderConfigId", "name", "description", "tokens", "priceUsd", "isActive", "isPublic")
VALUES
    (1, 1, 'Plan Basico', 'Ideal para pequeños proyectos', 10000, 5.00, true, true),
    (1, 1, 'Plan Pro', 'Para usuarios frecuentes', 50000, 20.00, true, true),
    (1, 1, 'Plan Empresa', 'Para grandes equipos', 200000, 75.00, true, true);
*/
