-- Agregar columnas de PayPal a la tabla companies
-- Fecha: 2026-03-17

ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "paypalClientId" TEXT;
ALTER TABLE "companies" ADD COLUMN IF NOT EXISTS "paypalSecretKey" TEXT;
