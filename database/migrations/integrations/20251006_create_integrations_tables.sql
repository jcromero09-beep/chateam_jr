-- Migration: Create Internal Integrations System Tables
-- Date: 2025-10-06
-- Description: Sistema unificado de integraciones con sistemas internos

-- Table: integration_providers
-- Define los proveedores de integración disponibles
CREATE TABLE IF NOT EXISTS integration_providers (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  provider_type VARCHAR(50) NOT NULL, -- billing, crm, tracking, resource_management
  base_url VARCHAR(500),
  auth_type VARCHAR(50) NOT NULL, -- api_key, oauth2, basic, custom
  status VARCHAR(50) DEFAULT 'active',
  capabilities JSONB DEFAULT '{}',
  default_config JSONB DEFAULT '{}',
  webhook_support BOOLEAN DEFAULT FALSE,
  icon_url VARCHAR(500),
  documentation_url VARCHAR(500),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_integration_providers_type ON integration_providers(provider_type);
CREATE INDEX idx_integration_providers_status ON integration_providers(status);

-- Table: integration_connections
-- Conexiones activas de empresas con proveedores
CREATE TABLE IF NOT EXISTS integration_connections (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  provider_id BIGINT NOT NULL,
  connection_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,

  -- Autenticación
  auth_credentials JSONB NOT NULL, -- Encrypted credentials
  auth_expires_at TIMESTAMP,

  -- Configuración
  config JSONB DEFAULT '{}',
  field_mappings JSONB DEFAULT '{}', -- Campo a campo mappings
  sync_settings JSONB DEFAULT '{}',

  -- Estado
  last_sync_at TIMESTAMP,
  last_error TEXT,
  sync_status VARCHAR(50) DEFAULT 'never_synced',

  -- Webhooks
  webhook_url VARCHAR(500),
  webhook_secret VARCHAR(255),
  webhook_events JSONB DEFAULT '[]',

  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (provider_id) REFERENCES integration_providers(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  UNIQUE(company_id, provider_id)
);

CREATE INDEX idx_integration_connections_company ON integration_connections(company_id);
CREATE INDEX idx_integration_connections_provider ON integration_connections(provider_id);
CREATE INDEX idx_integration_connections_active ON integration_connections(is_active);

-- Table: integration_sync_logs
-- Registro de sincronizaciones
CREATE TABLE IF NOT EXISTS integration_sync_logs (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,

  sync_type VARCHAR(50) NOT NULL, -- full, incremental, realtime
  direction VARCHAR(50) NOT NULL, -- inbound, outbound, bidirectional
  entity_type VARCHAR(100), -- customer, invoice, shipment, resource

  started_at TIMESTAMP NOT NULL,
  completed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'running',

  records_processed INT DEFAULT 0,
  records_created INT DEFAULT 0,
  records_updated INT DEFAULT 0,
  records_failed INT DEFAULT 0,

  error_message TEXT,
  error_details JSONB,

  metadata JSONB DEFAULT '{}',

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_sync_logs_connection ON integration_sync_logs(connection_id);
CREATE INDEX idx_sync_logs_company ON integration_sync_logs(company_id);
CREATE INDEX idx_sync_logs_status ON integration_sync_logs(status);
CREATE INDEX idx_sync_logs_started ON integration_sync_logs(started_at DESC);

-- Table: integration_webhook_events
-- Eventos de webhooks recibidos
CREATE TABLE IF NOT EXISTS integration_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,

  event_type VARCHAR(100) NOT NULL,
  event_id VARCHAR(255), -- ID del evento en el sistema externo
  payload JSONB NOT NULL,
  headers JSONB,

  received_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'pending',

  processing_attempts INT DEFAULT 0,
  error_message TEXT,

  response_sent JSONB,

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_webhook_events_connection ON integration_webhook_events(connection_id);
CREATE INDEX idx_webhook_events_company ON integration_webhook_events(company_id);
CREATE INDEX idx_webhook_events_status ON integration_webhook_events(status);
CREATE INDEX idx_webhook_events_type ON integration_webhook_events(event_type);
CREATE INDEX idx_webhook_events_received ON integration_webhook_events(received_at DESC);

-- Table: integration_entity_mappings
-- Mapeo de entidades entre JR CHATEAM y sistemas externos
CREATE TABLE IF NOT EXISTS integration_entity_mappings (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,

  entity_type VARCHAR(100) NOT NULL, -- contact, company, ticket, invoice
  local_entity_id BIGINT NOT NULL,
  external_entity_id VARCHAR(255) NOT NULL,
  external_entity_type VARCHAR(100),

  sync_direction VARCHAR(50) DEFAULT 'bidirectional',
  last_synced_at TIMESTAMP,

  local_data JSONB,
  external_data JSONB,

  metadata JSONB DEFAULT '{}',

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(connection_id, entity_type, local_entity_id),
  UNIQUE(connection_id, entity_type, external_entity_id)
);

CREATE INDEX idx_entity_mappings_connection ON integration_entity_mappings(connection_id);
CREATE INDEX idx_entity_mappings_company ON integration_entity_mappings(company_id);
CREATE INDEX idx_entity_mappings_type ON integration_entity_mappings(entity_type);
CREATE INDEX idx_entity_mappings_local ON integration_entity_mappings(local_entity_id);
CREATE INDEX idx_entity_mappings_external ON integration_entity_mappings(external_entity_id);

-- Table: integration_queue
-- Cola de trabajos de sincronización
CREATE TABLE IF NOT EXISTS integration_queue (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,

  job_type VARCHAR(100) NOT NULL, -- sync_entity, webhook_process, full_sync
  entity_type VARCHAR(100),
  entity_id BIGINT,

  priority INT DEFAULT 5, -- 1 = highest, 10 = lowest
  scheduled_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,

  status VARCHAR(50) DEFAULT 'pending',
  attempts INT DEFAULT 0,
  max_attempts INT DEFAULT 3,

  payload JSONB NOT NULL,
  result JSONB,
  error_message TEXT,

  next_retry_at TIMESTAMP,

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_integration_queue_connection ON integration_queue(connection_id);
CREATE INDEX idx_integration_queue_company ON integration_queue(company_id);
CREATE INDEX idx_integration_queue_status ON integration_queue(status);
CREATE INDEX idx_integration_queue_scheduled ON integration_queue(scheduled_at);
CREATE INDEX idx_integration_queue_priority ON integration_queue(priority, scheduled_at);

-- Table: integration_api_requests
-- Log de todas las peticiones API a sistemas externos
CREATE TABLE IF NOT EXISTS integration_api_requests (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,

  method VARCHAR(10) NOT NULL,
  endpoint VARCHAR(500) NOT NULL,
  request_headers JSONB,
  request_body JSONB,

  response_status INT,
  response_headers JSONB,
  response_body JSONB,

  duration_ms INT,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_api_requests_connection ON integration_api_requests(connection_id);
CREATE INDEX idx_api_requests_company ON integration_api_requests(company_id);
CREATE INDEX idx_api_requests_created ON integration_api_requests(created_at DESC);

-- Table: integration_analytics
-- Métricas agregadas de integraciones
CREATE TABLE IF NOT EXISTS integration_analytics (
  id BIGSERIAL PRIMARY KEY,
  connection_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  date DATE NOT NULL,

  total_syncs INT DEFAULT 0,
  successful_syncs INT DEFAULT 0,
  failed_syncs INT DEFAULT 0,

  total_records_synced INT DEFAULT 0,
  total_webhooks_received INT DEFAULT 0,
  total_webhooks_processed INT DEFAULT 0,

  total_api_calls INT DEFAULT 0,
  failed_api_calls INT DEFAULT 0,
  avg_response_time_ms FLOAT DEFAULT 0,

  uptime_percentage FLOAT DEFAULT 100,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY (connection_id) REFERENCES integration_connections(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(connection_id, date)
);

CREATE INDEX idx_integration_analytics_connection ON integration_analytics(connection_id);
CREATE INDEX idx_integration_analytics_company ON integration_analytics(company_id);
CREATE INDEX idx_integration_analytics_date ON integration_analytics(date DESC);

-- Add triggers to update updated_at
CREATE OR REPLACE FUNCTION update_integration_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_integration_providers_updated_at
  BEFORE UPDATE ON integration_providers
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_tables_updated_at();

CREATE TRIGGER trigger_integration_connections_updated_at
  BEFORE UPDATE ON integration_connections
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_tables_updated_at();

CREATE TRIGGER trigger_integration_entity_mappings_updated_at
  BEFORE UPDATE ON integration_entity_mappings
  FOR EACH ROW
  EXECUTE FUNCTION update_integration_tables_updated_at();

-- Insert default providers
INSERT INTO integration_providers (name, display_name, description, provider_type, auth_type, capabilities, webhook_support) VALUES
('billie', 'Billie', 'Sistema de facturación y pagos', 'billing', 'api_key', '{"invoicing": true, "payments": true, "customers": true, "subscriptions": true}', true),
('aria_lite', 'Aria Lite', 'Sistema CRM empresarial', 'crm', 'oauth2', '{"contacts": true, "companies": true, "deals": true, "activities": true}', true),
('smarttrack', 'SmartTrack', 'Sistema de tracking de envíos', 'tracking', 'api_key', '{"shipments": true, "tracking": true, "notifications": true}', true),
('sgr', 'SGR', 'Sistema de gestión de recursos', 'resource_management', 'basic', '{"resources": true, "assignments": true, "scheduling": true, "availability": true}', false);
