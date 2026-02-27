-- =====================================================
-- MIGRATION: Sistema de Analytics Avanzado
-- Fecha: 6 de octubre de 2025
-- Fase: 6 - Expansión
-- =====================================================

-- 1. Tabla de Eventos de Usuario (Event Tracking)
CREATE TABLE IF NOT EXISTS user_events (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  session_id UUID,
  event_name VARCHAR(100) NOT NULL,
  event_category VARCHAR(50), -- page_view, button_click, form_submit, feature_usage
  event_action VARCHAR(100),
  event_label VARCHAR(255),
  event_value DECIMAL(12,2),
  page_url VARCHAR(500),
  referrer_url VARCHAR(500),
  user_agent TEXT,
  ip_address VARCHAR(45),
  device_type VARCHAR(50), -- desktop, mobile, tablet
  browser VARCHAR(100),
  os VARCHAR(100),
  country VARCHAR(100),
  city VARCHAR(100),
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Sesiones de Usuario
CREATE TABLE IF NOT EXISTS user_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  session_start TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  session_end TIMESTAMP,
  duration_seconds INTEGER,
  page_views INTEGER DEFAULT 0,
  events_count INTEGER DEFAULT 0,
  entry_page VARCHAR(500),
  exit_page VARCHAR(500),
  device_type VARCHAR(50),
  browser VARCHAR(100),
  os VARCHAR(100),
  country VARCHAR(100),
  is_bounce BOOLEAN DEFAULT FALSE, -- Si solo visitó 1 página
  metadata JSONB DEFAULT '{}'
);

-- 3. Tabla de Métricas Agregadas por Día
CREATE TABLE IF NOT EXISTS daily_metrics (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  metric_date DATE NOT NULL,
  metric_type VARCHAR(100) NOT NULL, -- tickets, messages, campaigns, revenue, etc.
  metric_name VARCHAR(100) NOT NULL,
  metric_value DECIMAL(15,2) NOT NULL,
  dimensions JSONB DEFAULT '{}', -- Ej: {queue_id: 1, channel: 'whatsapp'}
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, metric_date, metric_type, metric_name, dimensions)
);

-- 4. Tabla de KPIs Personalizados
CREATE TABLE IF NOT EXISTS custom_kpis (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  kpi_name VARCHAR(255) NOT NULL,
  kpi_description TEXT,
  calculation_query TEXT NOT NULL, -- SQL query para calcular el KPI
  target_value DECIMAL(15,2),
  alert_threshold DECIMAL(15,2),
  display_format VARCHAR(50) DEFAULT 'number', -- number, percentage, currency, duration
  refresh_interval INTEGER DEFAULT 3600, -- Segundos entre actualizaciones
  is_active BOOLEAN DEFAULT TRUE,
  last_calculated_at TIMESTAMP,
  last_value DECIMAL(15,2),
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Dashboards Personalizados
CREATE TABLE IF NOT EXISTS custom_dashboards (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  dashboard_name VARCHAR(255) NOT NULL,
  description TEXT,
  layout JSONB NOT NULL, -- Configuración de widgets y posiciones
  filters JSONB DEFAULT '{}',
  is_default BOOLEAN DEFAULT FALSE,
  is_public BOOLEAN DEFAULT FALSE, -- Visible para todos los usuarios
  allowed_roles TEXT[], -- Roles que pueden ver este dashboard
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. Tabla de Widgets para Dashboards
CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id BIGSERIAL PRIMARY KEY,
  dashboard_id BIGINT NOT NULL REFERENCES custom_dashboards(id) ON DELETE CASCADE,
  widget_type VARCHAR(50) NOT NULL, -- chart, metric, table, funnel, heatmap
  widget_title VARCHAR(255) NOT NULL,
  data_source VARCHAR(100), -- tickets, messages, campaigns, custom_query
  query_config JSONB NOT NULL, -- Configuración de la query
  chart_type VARCHAR(50), -- line, bar, pie, donut, area
  position_x INTEGER DEFAULT 0,
  position_y INTEGER DEFAULT 0,
  width INTEGER DEFAULT 6,
  height INTEGER DEFAULT 4,
  refresh_interval INTEGER DEFAULT 300,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 7. Tabla de Reportes Programados
CREATE TABLE IF NOT EXISTS scheduled_reports (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  report_name VARCHAR(255) NOT NULL,
  report_type VARCHAR(50), -- daily, weekly, monthly, custom
  dashboard_id BIGINT REFERENCES custom_dashboards(id) ON DELETE SET NULL,
  recipients JSONB NOT NULL, -- Array de emails
  schedule_cron VARCHAR(100), -- Expresión cron
  format VARCHAR(50) DEFAULT 'pdf', -- pdf, excel, csv
  filters JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_sent_at TIMESTAMP,
  next_run_at TIMESTAMP,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Funnels de Conversión
CREATE TABLE IF NOT EXISTS conversion_funnels (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  funnel_name VARCHAR(255) NOT NULL,
  description TEXT,
  steps JSONB NOT NULL, -- [{name: "Step 1", event: "page_view", condition: {...}}]
  is_active BOOLEAN DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 9. Tabla de Análisis de Funnel
CREATE TABLE IF NOT EXISTS funnel_analytics (
  id BIGSERIAL PRIMARY KEY,
  funnel_id BIGINT NOT NULL REFERENCES conversion_funnels(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  analysis_date DATE NOT NULL,
  step_number INTEGER NOT NULL,
  step_name VARCHAR(255) NOT NULL,
  users_count INTEGER DEFAULT 0,
  conversion_rate DECIMAL(5,2), -- Porcentaje
  drop_off_rate DECIMAL(5,2),
  avg_time_to_next_step_seconds INTEGER,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(funnel_id, analysis_date, step_number)
);

-- 10. Tabla de Cohorts de Usuarios
CREATE TABLE IF NOT EXISTS user_cohorts (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cohort_name VARCHAR(255) NOT NULL,
  description TEXT,
  cohort_type VARCHAR(50), -- acquisition, behavior, value
  definition_rules JSONB NOT NULL, -- Reglas para pertenecer al cohort
  users_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 11. Tabla de Retención de Usuarios
CREATE TABLE IF NOT EXISTS user_retention (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  cohort_id BIGINT REFERENCES user_cohorts(id) ON DELETE CASCADE,
  cohort_period DATE NOT NULL, -- Fecha de inicio del cohort
  retention_period INTEGER NOT NULL, -- Días desde inicio
  users_active INTEGER DEFAULT 0,
  retention_rate DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, cohort_id, cohort_period, retention_period)
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_user_events_company_date ON user_events(company_id, created_at);
CREATE INDEX idx_user_events_name ON user_events(event_name);
CREATE INDEX idx_user_events_category ON user_events(event_category);
CREATE INDEX idx_user_events_session ON user_events(session_id);
CREATE INDEX idx_user_sessions_company ON user_sessions(company_id);
CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_dates ON user_sessions(session_start, session_end);
CREATE INDEX idx_daily_metrics_company_date ON daily_metrics(company_id, metric_date);
CREATE INDEX idx_daily_metrics_type ON daily_metrics(metric_type, metric_name);
CREATE INDEX idx_custom_kpis_company ON custom_kpis(company_id, is_active);
CREATE INDEX idx_dashboards_company ON custom_dashboards(company_id);
CREATE INDEX idx_dashboards_public ON custom_dashboards(is_public, is_default);
CREATE INDEX idx_widgets_dashboard ON dashboard_widgets(dashboard_id);
CREATE INDEX idx_scheduled_reports_company ON scheduled_reports(company_id, is_active);
CREATE INDEX idx_scheduled_reports_next_run ON scheduled_reports(next_run_at) WHERE is_active = TRUE;
CREATE INDEX idx_funnel_analytics_funnel_date ON funnel_analytics(funnel_id, analysis_date);
CREATE INDEX idx_user_retention_cohort ON user_retention(cohort_id, cohort_period);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Actualizar contador de eventos en sesión
CREATE OR REPLACE FUNCTION update_session_events()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE user_sessions
  SET
    events_count = events_count + 1,
    page_views = CASE WHEN NEW.event_category = 'page_view' THEN page_views + 1 ELSE page_views END,
    session_end = NEW.created_at,
    duration_seconds = EXTRACT(EPOCH FROM (NEW.created_at - session_start))::INTEGER,
    exit_page = CASE WHEN NEW.event_category = 'page_view' THEN NEW.page_url ELSE exit_page END
  WHERE id = NEW.session_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_session_events
  AFTER INSERT ON user_events
  FOR EACH ROW
  WHEN (NEW.session_id IS NOT NULL)
  EXECUTE FUNCTION update_session_events();

-- =====================================================
-- VISTAS MATERIALIZADAS
-- =====================================================

-- Vista de Métricas en Tiempo Real
CREATE MATERIALIZED VIEW IF NOT EXISTS realtime_metrics AS
SELECT
  company_id,
  COUNT(*) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') AS events_last_hour,
  COUNT(DISTINCT user_id) FILTER (WHERE created_at >= NOW() - INTERVAL '1 hour') AS active_users_last_hour,
  COUNT(*) FILTER (WHERE created_at >= CURRENT_DATE) AS events_today,
  COUNT(DISTINCT session_id) FILTER (WHERE created_at >= CURRENT_DATE) AS sessions_today,
  AVG(CASE WHEN event_value IS NOT NULL THEN event_value END) AS avg_event_value,
  MAX(created_at) AS last_event_at
FROM user_events
GROUP BY company_id;

CREATE UNIQUE INDEX idx_realtime_metrics_company ON realtime_metrics(company_id);

-- Vista de Top Eventos
CREATE MATERIALIZED VIEW IF NOT EXISTS top_events AS
SELECT
  company_id,
  event_name,
  event_category,
  COUNT(*) AS event_count,
  COUNT(DISTINCT user_id) AS unique_users,
  COUNT(DISTINCT session_id) AS unique_sessions,
  AVG(event_value) AS avg_value,
  DATE_TRUNC('day', created_at) AS event_date
FROM user_events
WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY company_id, event_name, event_category, DATE_TRUNC('day', created_at);

CREATE INDEX idx_top_events_company_date ON top_events(company_id, event_date);

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para calcular métricas diarias
CREATE OR REPLACE FUNCTION calculate_daily_metrics(p_date DATE)
RETURNS VOID AS $$
BEGIN
  -- Tickets creados por día
  INSERT INTO daily_metrics (company_id, metric_date, metric_type, metric_name, metric_value)
  SELECT
    company_id,
    p_date,
    'tickets',
    'created_count',
    COUNT(*)
  FROM tickets
  WHERE DATE(created_at) = p_date
  GROUP BY company_id
  ON CONFLICT (company_id, metric_date, metric_type, metric_name, dimensions) DO UPDATE
  SET metric_value = EXCLUDED.metric_value;

  -- Mensajes enviados por día
  INSERT INTO daily_metrics (company_id, metric_date, metric_type, metric_name, metric_value)
  SELECT
    company_id,
    p_date,
    'messages',
    'sent_count',
    COUNT(*)
  FROM messages
  WHERE DATE(created_at) = p_date AND from_me = TRUE
  GROUP BY company_id
  ON CONFLICT (company_id, metric_date, metric_type, metric_name, dimensions) DO UPDATE
  SET metric_value = EXCLUDED.metric_value;

  -- Tiempo promedio de primera respuesta
  INSERT INTO daily_metrics (company_id, metric_date, metric_type, metric_name, metric_value)
  SELECT
    t.company_id,
    p_date,
    'performance',
    'avg_first_response_time_minutes',
    AVG(EXTRACT(EPOCH FROM (m.created_at - t.created_at))/60)
  FROM tickets t
  INNER JOIN messages m ON m.ticket_id = t.id AND m.from_me = TRUE
  WHERE DATE(t.created_at) = p_date
    AND m.id = (SELECT MIN(id) FROM messages WHERE ticket_id = t.id AND from_me = TRUE)
  GROUP BY t.company_id
  ON CONFLICT (company_id, metric_date, metric_type, metric_name, dimensions) DO UPDATE
  SET metric_value = EXCLUDED.metric_value;

  -- Refrescar vistas materializadas
  REFRESH MATERIALIZED VIEW CONCURRENTLY realtime_metrics;
  REFRESH MATERIALIZED VIEW CONCURRENTLY top_events;
END;
$$ LANGUAGE plpgsql;

-- Función para tracking de eventos
CREATE OR REPLACE FUNCTION track_event(
  p_company_id BIGINT,
  p_user_id BIGINT,
  p_session_id UUID,
  p_event_name VARCHAR,
  p_event_category VARCHAR DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'
) RETURNS BIGINT AS $$
DECLARE
  v_event_id BIGINT;
BEGIN
  INSERT INTO user_events (
    company_id, user_id, session_id, event_name, event_category,
    event_action, event_label, page_url, metadata
  ) VALUES (
    p_company_id, p_user_id, p_session_id, p_event_name, p_event_category,
    p_metadata->>'action', p_metadata->>'label', p_metadata->>'page_url', p_metadata
  ) RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener dashboard de analíticas
CREATE OR REPLACE FUNCTION get_analytics_dashboard(
  p_company_id BIGINT,
  p_start_date DATE,
  p_end_date DATE
) RETURNS TABLE (
  metric_category VARCHAR,
  metric_name VARCHAR,
  current_value DECIMAL,
  previous_value DECIMAL,
  change_percentage DECIMAL,
  trend VARCHAR
) AS $$
BEGIN
  RETURN QUERY
  WITH current_period AS (
    SELECT metric_type, metric_name, SUM(metric_value) AS value
    FROM daily_metrics
    WHERE company_id = p_company_id
      AND metric_date BETWEEN p_start_date AND p_end_date
    GROUP BY metric_type, metric_name
  ),
  previous_period AS (
    SELECT metric_type, metric_name, SUM(metric_value) AS value
    FROM daily_metrics
    WHERE company_id = p_company_id
      AND metric_date BETWEEN (p_start_date - (p_end_date - p_start_date)) AND (p_start_date - INTERVAL '1 day')
    GROUP BY metric_type, metric_name
  )
  SELECT
    c.metric_type,
    c.metric_name,
    c.value,
    COALESCE(p.value, 0),
    CASE
      WHEN p.value IS NULL OR p.value = 0 THEN 100
      ELSE ((c.value - p.value) / p.value * 100)
    END AS change_pct,
    CASE
      WHEN c.value > COALESCE(p.value, 0) THEN 'up'
      WHEN c.value < COALESCE(p.value, 0) THEN 'down'
      ELSE 'stable'
    END AS trend
  FROM current_period c
  LEFT JOIN previous_period p ON c.metric_type = p.metric_type AND c.metric_name = p.metric_name;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE user_events IS 'Tracking de eventos de usuario para analytics';
COMMENT ON TABLE user_sessions IS 'Sesiones de usuario con métricas de engagement';
COMMENT ON TABLE daily_metrics IS 'Métricas agregadas por día para reportes';
COMMENT ON TABLE custom_kpis IS 'KPIs personalizados definidos por usuario';
COMMENT ON TABLE custom_dashboards IS 'Dashboards personalizados';
COMMENT ON TABLE conversion_funnels IS 'Funnels de conversión configurables';
COMMENT ON TABLE user_cohorts IS 'Cohorts de usuarios para análisis de retención';
