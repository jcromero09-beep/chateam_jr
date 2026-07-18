-- Script para agregar la columna paymentMethod a la tabla Invoices
-- Fecha: 2025-12-19

-- Verificar si la columna ya existe antes de agregarla
DO $$
BEGIN
    -- Agregar columna paymentMethod si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='invoices' AND column_name='paymentMethod'
    ) THEN
        ALTER TABLE "Invoices" ADD COLUMN "paymentMethod" VARCHAR(255) DEFAULT NULL;
        RAISE NOTICE 'Columna paymentMethod agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna paymentMethod ya existe';
    END IF;

    -- Agregar columna paypalOrderId si no existe
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name='invoices' AND column_name='paypalOrderId'
    ) THEN
        ALTER TABLE "Invoices" ADD COLUMN "paypalOrderId" VARCHAR(255) DEFAULT NULL;
        RAISE NOTICE 'Columna paypalOrderId agregada exitosamente';
    ELSE
        RAISE NOTICE 'La columna paypalOrderId ya existe';
    END IF;
END $$;

-- Verificar las columnas creadas
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'invoices'
AND column_name IN ('paymentMethod', 'paypalOrderId');
