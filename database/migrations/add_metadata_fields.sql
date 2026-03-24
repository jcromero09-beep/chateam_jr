-- =====================================================
-- Agregar campos metadata y subject/title a los modelos
-- ChatEAM JR - 2026-03-11
-- =====================================================

-- 1. Agregar metadata JSON a Users
ALTER TABLE "Users" ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 2. Agregar metadata JSON y title a Tickets
ALTER TABLE "Tickets" ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
ALTER TABLE "Tickets" ADD COLUMN IF NOT EXISTS title VARCHAR(255);

-- 3. Agregar metadata JSON a Contacts
ALTER TABLE "Contacts" ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';

-- 4. Agregar useUgc a Plans (si no existe)
ALTER TABLE "Plans" ADD COLUMN IF NOT EXISTS "useUgc" BOOLEAN DEFAULT false;

-- Verificar columnas agregadas
SELECT
    'Users.metadata' as column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Users' AND column_name = 'metadata'
UNION ALL
SELECT
    'Tickets.metadata' as column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Tickets' AND column_name = 'metadata'
UNION ALL
SELECT
    'Tickets.title' as column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Tickets' AND column_name = 'title'
UNION ALL
SELECT
    'Contacts.metadata' as column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Contacts' AND column_name = 'metadata'
UNION ALL
SELECT
    'Plans.useUgc' as column_name, data_type
FROM information_schema.columns
WHERE table_name = 'Plans' AND column_name = 'useUgc';
