-- ============================================
-- Script: Crear tabla CustomerOrigins
-- Módulo: Origen de Cliente
-- ============================================

-- Crear tabla CustomerOrigins
CREATE TABLE IF NOT EXISTS "CustomerOrigins" (
  "id" SERIAL PRIMARY KEY,
  "name" VARCHAR(255) NOT NULL,
  "description" TEXT,
  "color" VARCHAR(7) DEFAULT '#6366F1',
  "isActive" BOOLEAN DEFAULT true,
  "companyId" INTEGER NOT NULL REFERENCES "Companies"("id") ON DELETE CASCADE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Índice para búsquedas por empresa
CREATE INDEX IF NOT EXISTS "idx_customer_origins_company" ON "CustomerOrigins"("companyId");

-- Índice para filtrar activos/inactivos
CREATE INDEX IF NOT EXISTS "idx_customer_origins_active" ON "CustomerOrigins"("isActive");

-- Índice compuesto para queries comunes
CREATE INDEX IF NOT EXISTS "idx_customer_origins_company_active" ON "CustomerOrigins"("companyId", "isActive");

-- ============================================
-- Agregar columna customerOriginId a Tickets
-- ============================================

ALTER TABLE "Tickets"
ADD COLUMN IF NOT EXISTS "customerOriginId" INTEGER
REFERENCES "CustomerOrigins"("id") ON DELETE SET NULL;

-- Índice para reportes y joins
CREATE INDEX IF NOT EXISTS "idx_tickets_customer_origin" ON "Tickets"("customerOriginId");

-- Índice compuesto para reportes por empresa y origen
CREATE INDEX IF NOT EXISTS "idx_tickets_company_origin" ON "Tickets"("companyId", "customerOriginId");

-- ============================================
-- NOTAS:
-- - No se insertan datos iniciales
-- - Los orígenes se crean desde la interfaz CRUD
-- - isActive permite desactivar sin eliminar
-- ============================================
