-- Migration: Create contact_memory table
-- Created: 2026-03-24
-- Description: Tabla de memoria semántica persistente por contacto - aprende de conversaciones cerradas

-- 1. Tabla principal
CREATE TABLE IF NOT EXISTS contact_memory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id INTEGER NOT NULL REFERENCES "Contacts"(id) ON DELETE CASCADE,
  company_id INTEGER NOT NULL REFERENCES "Companies"(id) ON DELETE CASCADE,
  memory_type VARCHAR(30) NOT NULL,
  -- Tipos: 'preference' | 'fact' | 'objection' | 'interest' | 'decision'
  content TEXT NOT NULL,
  embedding vector(1536),
  confidence FLOAT DEFAULT 1.0,
  source_ticket_id INTEGER REFERENCES "Tickets"(id) ON DELETE SET NULL,
  verified BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_confirmed_at TIMESTAMP,
  -- Evitar duplicados exactos por contacto (índice único)
  UNIQUE(contact_id, content)
);

-- 2. Índices
-- Índice vectorial para búsqueda semántica por similitud
CREATE INDEX IF NOT EXISTS idx_contact_memory_embedding
  ON contact_memory USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Índice para consulta rápida por contacto + tipo
CREATE INDEX IF NOT EXISTS idx_contact_memory_contact_type
  ON contact_memory(contact_id, memory_type);

-- Índice para búsqueda por company
CREATE INDEX IF NOT EXISTS idx_contact_memory_company
  ON contact_memory(company_id);

-- Índice para memorias verificadas (las no verificadas se ignoran)
CREATE INDEX IF NOT EXISTS idx_contact_memory_verified
  ON contact_memory(contact_id, verified)
  WHERE verified = true;

-- 3. Función para actualizar updated_at
CREATE OR REPLACE FUNCTION update_contact_memory_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 4. Trigger automático de timestamp
DROP TRIGGER IF EXISTS contact_memory_updated_at ON contact_memory;
CREATE TRIGGER contact_memory_updated_at
  BEFORE UPDATE ON contact_memory
  FOR EACH ROW EXECUTE FUNCTION update_contact_memory_timestamp();

-- Verificar
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'contact_memory'
ORDER BY ordinal_position;
