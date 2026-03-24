-- Agregar columnas PayPal a AISubplans
-- Fecha: 2026-03-17

ALTER TABLE "AISubplans"
ADD COLUMN IF NOT EXISTS "paypalProductId" VARCHAR(255),
ADD COLUMN IF NOT EXISTS "paypalPriceId" VARCHAR(255);
