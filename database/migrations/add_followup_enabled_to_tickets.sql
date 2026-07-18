-- Agregar columna followupEnabled a Tickets (default true)
ALTER TABLE "Tickets" ADD COLUMN "followupEnabled" BOOLEAN DEFAULT true;

-- Actualizar registros existentes a true (mantener comportamiento actual)
UPDATE "Tickets" SET "followupEnabled" = true WHERE "followupEnabled" IS NULL;
