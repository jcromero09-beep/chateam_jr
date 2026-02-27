-- =====================================================
-- SCRIPT DE OPTIMIZACIÓN DE CONTACTOS
-- Ejecutar en pgAdmin
-- =====================================================

-- 1. Eliminar el constraint único global en 'number' (si existe)
ALTER TABLE "Contacts" DROP CONSTRAINT IF EXISTS "Contacts_number_key";

-- 2. Eliminar índice antiguo en 'number' (si existe)
DROP INDEX IF EXISTS contacts_number;

-- 3. Crear índice único compuesto por conexión de WhatsApp
-- Permite que el mismo número exista para diferentes conexiones de WhatsApp
CREATE UNIQUE INDEX IF NOT EXISTS contacts_number_company_whatsapp_unique 
ON "Contacts" ("number", "companyId", "whatsappId") 
WHERE "whatsappId" IS NOT NULL;

-- 4. Crear índice único compuesto para remoteJid por conexión
-- Este es el índice principal para búsquedas de WhatsApp
CREATE UNIQUE INDEX IF NOT EXISTS contacts_remotejid_company_whatsapp_unique 
ON "Contacts" ("remoteJid", "companyId", "whatsappId") 
WHERE "remoteJid" IS NOT NULL AND "whatsappId" IS NOT NULL;

-- 5. Crear índice en remoteJid para búsquedas rápidas
CREATE INDEX IF NOT EXISTS contacts_remotejid_idx 
ON "Contacts" ("remoteJid");

-- 6. Crear índice único para contactos creados manualmente (sin whatsappId)
CREATE UNIQUE INDEX IF NOT EXISTS contacts_number_company_unique 
ON "Contacts" ("number", "companyId") 
WHERE "whatsappId" IS NULL;

-- =====================================================
-- VERIFICAR QUE LOS ÍNDICES SE CREARON CORRECTAMENTE
-- =====================================================
SELECT 
    indexname, 
    indexdef 
FROM pg_indexes 
WHERE tablename = 'Contacts' 
ORDER BY indexname;
