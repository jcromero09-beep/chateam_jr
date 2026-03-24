-- =====================================================
-- MIGRACION: Catalogo de Agentes IA por Departamentos
-- Fecha: 2026-02-28
-- Descripcion: Agrega department, category, capabilities,
--              icon, tier, slug, sortOrder, version a AIAgentConfigs
-- =====================================================

-- 1. Departamento del agente
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "department" VARCHAR(50) DEFAULT NULL;

-- 2. Categoria dentro del departamento
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "category" VARCHAR(50) DEFAULT NULL;

-- 3. Capabilities del agente (poderes/habilidades)
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "capabilities" JSONB DEFAULT '[]'::jsonb;

-- 4. Icono del agente (nombre del icono lucide-react)
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "icon" VARCHAR(50) DEFAULT 'bot';

-- 5. Tier de complejidad del modelo requerido
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "tier" VARCHAR(20) DEFAULT 'mini';

-- 6. Slug unico para identificacion URL-friendly
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "slug" VARCHAR(100) DEFAULT NULL;

-- 7. Orden de visualizacion dentro del departamento
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "sortOrder" INTEGER DEFAULT 0;

-- 8. Version del agente
ALTER TABLE "AIAgentConfigs"
  ADD COLUMN IF NOT EXISTS "version" VARCHAR(20) DEFAULT '1.0.0';

-- =====================================================
-- INDICES
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_aiagent_department
  ON "AIAgentConfigs"("department");

CREATE INDEX IF NOT EXISTS idx_aiagent_department_active
  ON "AIAgentConfigs"("department", "isActive")
  WHERE "isActive" = true;

CREATE INDEX IF NOT EXISTS idx_aiagent_slug
  ON "AIAgentConfigs"("slug");

CREATE INDEX IF NOT EXISTS idx_aiagent_global_catalog
  ON "AIAgentConfigs"("companyId", "department", "isActive")
  WHERE "companyId" IS NULL AND "isActive" = true;

-- =====================================================
-- COMENTARIOS
-- =====================================================

COMMENT ON COLUMN "AIAgentConfigs"."department"
IS 'Departamento: customer_service, sales_crm, marketing, knowledge_rag, automation, analytics_bi, multimedia, security';

COMMENT ON COLUMN "AIAgentConfigs"."capabilities"
IS 'Array JSONB de capabilities: ["memory","rag","web_search","sentiment_analysis",...]';

COMMENT ON COLUMN "AIAgentConfigs"."icon"
IS 'Nombre del icono lucide-react (ej: headphones, trending-up, shield)';

COMMENT ON COLUMN "AIAgentConfigs"."tier"
IS 'Tier de modelo requerido: nano, mini, full, premium';

COMMENT ON COLUMN "AIAgentConfigs"."slug"
IS 'Identificador URL-friendly unico del agente';

-- =====================================================
-- VERIFICACION
-- =====================================================

SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'AIAgentConfigs'
AND column_name IN ('department','category','capabilities','icon','tier','slug','sortOrder','version')
ORDER BY column_name;
