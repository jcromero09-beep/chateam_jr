-- =====================================================
-- MIGRATION: Database Sharding para >1000 Tenants
-- Fecha: 6 de octubre de 2025
-- Fase: 7 - Escalamiento
-- =====================================================

-- ESTRATEGIA DE SHARDING:
-- 1. Sharding por company_id (hash-based)
-- 2. Cada shard maneja ~500 companies
-- 3. Metadata centralizada para routing
-- 4. Rebalanceo automático cuando sea necesario

-- =====================================================
-- TABLA DE METADATA DE SHARDS (En DB central)
-- =====================================================

CREATE TABLE IF NOT EXISTS shard_metadata (
  id BIGSERIAL PRIMARY KEY,
  shard_id VARCHAR(50) NOT NULL UNIQUE,
  shard_name VARCHAR(100) NOT NULL,
  database_host VARCHAR(255) NOT NULL,
  database_port INTEGER NOT NULL DEFAULT 5432,
  database_name VARCHAR(100) NOT NULL,
  database_user VARCHAR(100) NOT NULL,
  database_password_encrypted TEXT NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  is_read_only BOOLEAN DEFAULT FALSE,
  max_companies INTEGER DEFAULT 500,
  current_companies INTEGER DEFAULT 0,
  disk_usage_gb DECIMAL(10,2),
  cpu_usage_percent DECIMAL(5,2),
  memory_usage_percent DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- TABLA DE MAPEO COMPANY -> SHARD
-- =====================================================

CREATE TABLE IF NOT EXISTS company_shard_mapping (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL UNIQUE,
  shard_id VARCHAR(50) NOT NULL REFERENCES shard_metadata(shard_id),
  assigned_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  is_migrating BOOLEAN DEFAULT FALSE,
  migration_started_at TIMESTAMP,
  migration_completed_at TIMESTAMP
);

-- =====================================================
-- TABLA DE HISTORIAL DE REBALANCEO
-- =====================================================

CREATE TABLE IF NOT EXISTS shard_rebalance_history (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  from_shard_id VARCHAR(50),
  to_shard_id VARCHAR(50) NOT NULL,
  reason VARCHAR(255),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'in_progress', -- in_progress, completed, failed
  error_message TEXT,
  data_size_gb DECIMAL(10,2)
);

-- =====================================================
-- CONFIGURACIÓN DE SHARDS INICIAL
-- =====================================================

-- Shard 1 (Principal)
INSERT INTO shard_metadata (
  shard_id, shard_name, database_host, database_port, database_name,
  database_user, database_password_encrypted, max_companies
) VALUES (
  'shard-001',
  'Primary Shard 1',
  'db-shard-1.example.com',
  5432,
  'jrchateam_shard_1',
  'shard_user_1',
  'encrypted_password_here',
  500
);

-- Shard 2
INSERT INTO shard_metadata (
  shard_id, shard_name, database_host, database_port, database_name,
  database_user, database_password_encrypted, max_companies
) VALUES (
  'shard-002',
  'Shard 2',
  'db-shard-2.example.com',
  5432,
  'jrchateam_shard_2',
  'shard_user_2',
  'encrypted_password_here',
  500
);

-- Shard 3
INSERT INTO shard_metadata (
  shard_id, shard_name, database_host, database_port, database_name,
  database_user, database_password_encrypted, max_companies
) VALUES (
  'shard-003',
  'Shard 3',
  'db-shard-3.example.com',
  5432,
  'jrchateam_shard_3',
  'shard_user_3',
  'encrypted_password_here',
  500
);

-- Shard 4
INSERT INTO shard_metadata (
  shard_id, shard_name, database_host, database_port, database_name,
  database_user, database_password_encrypted, max_companies
) VALUES (
  'shard-004',
  'Shard 4 (Read Replica)',
  'db-shard-4.example.com',
  5432,
  'jrchateam_shard_4',
  'shard_user_4',
  'encrypted_password_here',
  500
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_shard_metadata_active ON shard_metadata(is_active);
CREATE INDEX idx_shard_metadata_capacity ON shard_metadata(current_companies, max_companies);
CREATE INDEX idx_company_shard_mapping_company ON company_shard_mapping(company_id);
CREATE INDEX idx_company_shard_mapping_shard ON company_shard_mapping(shard_id);
CREATE INDEX idx_company_shard_mapping_migrating ON company_shard_mapping(is_migrating);
CREATE INDEX idx_rebalance_history_status ON shard_rebalance_history(status);
CREATE INDEX idx_rebalance_history_company ON shard_rebalance_history(company_id);

-- =====================================================
-- FUNCIONES DE SHARDING
-- =====================================================

-- Función para asignar company a shard (hash-based con load balancing)
CREATE OR REPLACE FUNCTION assign_company_to_shard(p_company_id BIGINT)
RETURNS VARCHAR AS $$
DECLARE
  v_shard_id VARCHAR(50);
  v_shard_count INTEGER;
  v_hash_value INTEGER;
BEGIN
  -- Verificar si ya está asignado
  SELECT shard_id INTO v_shard_id
  FROM company_shard_mapping
  WHERE company_id = p_company_id;

  IF v_shard_id IS NOT NULL THEN
    RETURN v_shard_id;
  END IF;

  -- Buscar shard con menor carga
  SELECT sm.shard_id INTO v_shard_id
  FROM shard_metadata sm
  WHERE sm.is_active = TRUE
    AND sm.is_read_only = FALSE
    AND sm.current_companies < sm.max_companies
  ORDER BY (sm.current_companies::FLOAT / sm.max_companies) ASC
  LIMIT 1;

  -- Si no hay shard disponible, usar hash para distribución
  IF v_shard_id IS NULL THEN
    SELECT COUNT(*) INTO v_shard_count FROM shard_metadata WHERE is_active = TRUE;
    v_hash_value := (p_company_id % v_shard_count) + 1;

    SELECT shard_id INTO v_shard_id
    FROM shard_metadata
    WHERE is_active = TRUE
    ORDER BY id
    OFFSET v_hash_value - 1
    LIMIT 1;
  END IF;

  -- Crear mapeo
  INSERT INTO company_shard_mapping (company_id, shard_id)
  VALUES (p_company_id, v_shard_id);

  -- Actualizar contador
  UPDATE shard_metadata
  SET current_companies = current_companies + 1
  WHERE shard_id = v_shard_id;

  RETURN v_shard_id;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener shard de una company
CREATE OR REPLACE FUNCTION get_company_shard(p_company_id BIGINT)
RETURNS TABLE (
  shard_id VARCHAR,
  database_host VARCHAR,
  database_port INTEGER,
  database_name VARCHAR,
  database_user VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.shard_id,
    sm.database_host,
    sm.database_port,
    sm.database_name,
    sm.database_user
  FROM company_shard_mapping csm
  INNER JOIN shard_metadata sm ON sm.shard_id = csm.shard_id
  WHERE csm.company_id = p_company_id;
END;
$$ LANGUAGE plpgsql;

-- Función para iniciar migración de company a otro shard
CREATE OR REPLACE FUNCTION start_shard_migration(
  p_company_id BIGINT,
  p_target_shard_id VARCHAR,
  p_reason VARCHAR DEFAULT 'manual'
) RETURNS BIGINT AS $$
DECLARE
  v_current_shard_id VARCHAR;
  v_migration_id BIGINT;
BEGIN
  -- Obtener shard actual
  SELECT shard_id INTO v_current_shard_id
  FROM company_shard_mapping
  WHERE company_id = p_company_id;

  IF v_current_shard_id IS NULL THEN
    RAISE EXCEPTION 'Company % not mapped to any shard', p_company_id;
  END IF;

  IF v_current_shard_id = p_target_shard_id THEN
    RAISE EXCEPTION 'Company % is already in shard %', p_company_id, p_target_shard_id;
  END IF;

  -- Marcar como en migración
  UPDATE company_shard_mapping
  SET is_migrating = TRUE, migration_started_at = CURRENT_TIMESTAMP
  WHERE company_id = p_company_id;

  -- Crear registro de historial
  INSERT INTO shard_rebalance_history (
    company_id, from_shard_id, to_shard_id, reason, status
  ) VALUES (
    p_company_id, v_current_shard_id, p_target_shard_id, p_reason, 'in_progress'
  ) RETURNING id INTO v_migration_id;

  RETURN v_migration_id;
END;
$$ LANGUAGE plpgsql;

-- Función para completar migración
CREATE OR REPLACE FUNCTION complete_shard_migration(p_migration_id BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
  v_migration RECORD;
BEGIN
  -- Obtener datos de migración
  SELECT * INTO v_migration
  FROM shard_rebalance_history
  WHERE id = p_migration_id;

  IF v_migration IS NULL THEN
    RAISE EXCEPTION 'Migration % not found', p_migration_id;
  END IF;

  -- Actualizar mapeo
  UPDATE company_shard_mapping
  SET
    shard_id = v_migration.to_shard_id,
    is_migrating = FALSE,
    migration_completed_at = CURRENT_TIMESTAMP
  WHERE company_id = v_migration.company_id;

  -- Actualizar contadores de shards
  UPDATE shard_metadata
  SET current_companies = current_companies - 1
  WHERE shard_id = v_migration.from_shard_id;

  UPDATE shard_metadata
  SET current_companies = current_companies + 1
  WHERE shard_id = v_migration.to_shard_id;

  -- Marcar migración como completada
  UPDATE shard_rebalance_history
  SET status = 'completed', completed_at = CURRENT_TIMESTAMP
  WHERE id = p_migration_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener estadísticas de shards
CREATE OR REPLACE FUNCTION get_shard_statistics()
RETURNS TABLE (
  shard_id VARCHAR,
  shard_name VARCHAR,
  current_companies INTEGER,
  max_companies INTEGER,
  utilization_percent DECIMAL,
  disk_usage_gb DECIMAL,
  is_active BOOLEAN,
  status VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sm.shard_id,
    sm.shard_name,
    sm.current_companies,
    sm.max_companies,
    ROUND((sm.current_companies::DECIMAL / NULLIF(sm.max_companies, 0)) * 100, 2) AS utilization_percent,
    sm.disk_usage_gb,
    sm.is_active,
    CASE
      WHEN sm.current_companies >= sm.max_companies THEN 'FULL'
      WHEN sm.current_companies::DECIMAL / NULLIF(sm.max_companies, 0) > 0.8 THEN 'HIGH'
      WHEN sm.current_companies::DECIMAL / NULLIF(sm.max_companies, 0) > 0.5 THEN 'MEDIUM'
      ELSE 'LOW'
    END AS status
  FROM shard_metadata sm
  ORDER BY sm.id;
END;
$$ LANGUAGE plpgsql;

-- Función para auto-rebalanceo (detecta shards sobrecargados)
CREATE OR REPLACE FUNCTION auto_rebalance_shards()
RETURNS TABLE (
  company_id BIGINT,
  from_shard VARCHAR,
  to_shard VARCHAR,
  reason VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  WITH overloaded_shards AS (
    SELECT shard_id
    FROM shard_metadata
    WHERE (current_companies::DECIMAL / max_companies) > 0.9
      AND is_active = TRUE
  ),
  underloaded_shards AS (
    SELECT shard_id
    FROM shard_metadata
    WHERE (current_companies::DECIMAL / max_companies) < 0.5
      AND is_active = TRUE
      AND is_read_only = FALSE
  ),
  companies_to_move AS (
    SELECT
      csm.company_id,
      csm.shard_id as current_shard,
      (SELECT shard_id FROM underloaded_shards LIMIT 1) as target_shard
    FROM company_shard_mapping csm
    WHERE csm.shard_id IN (SELECT shard_id FROM overloaded_shards)
      AND csm.is_migrating = FALSE
    ORDER BY csm.assigned_at DESC
    LIMIT 10
  )
  SELECT
    ctm.company_id,
    ctm.current_shard,
    ctm.target_shard,
    'auto_rebalance' as reason
  FROM companies_to_move ctm
  WHERE ctm.target_shard IS NOT NULL;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE OR REPLACE FUNCTION update_shard_metadata_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_shard_metadata_timestamp
  BEFORE UPDATE ON shard_metadata
  FOR EACH ROW EXECUTE FUNCTION update_shard_metadata_timestamp();

COMMENT ON TABLE shard_metadata IS 'Metadata de shards de base de datos';
COMMENT ON TABLE company_shard_mapping IS 'Mapeo de companies a shards';
COMMENT ON TABLE shard_rebalance_history IS 'Historial de rebalanceo de shards';
COMMENT ON FUNCTION assign_company_to_shard IS 'Asigna automáticamente una company a un shard con menor carga';
COMMENT ON FUNCTION get_company_shard IS 'Obtiene información del shard de una company';
COMMENT ON FUNCTION start_shard_migration IS 'Inicia proceso de migración de company entre shards';
COMMENT ON FUNCTION complete_shard_migration IS 'Completa proceso de migración de company';
COMMENT ON FUNCTION get_shard_statistics IS 'Obtiene estadísticas de utilización de shards';
COMMENT ON FUNCTION auto_rebalance_shards IS 'Detecta y sugiere migraciones para rebalancear carga';
