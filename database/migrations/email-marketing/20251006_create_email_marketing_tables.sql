-- Migration: Create Email Marketing Tables
-- Date: 2025-10-06
-- Description: Complete email marketing system with AI integration

-- Table: email_templates
CREATE TABLE IF NOT EXISTS email_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  preview_text VARCHAR(255),
  html_content TEXT NOT NULL,
  text_content TEXT,
  design_json JSONB DEFAULT '{}',
  category VARCHAR(100) DEFAULT 'general',
  is_ai_generated BOOLEAN DEFAULT FALSE,
  ai_prompt TEXT,
  tags TEXT[],
  thumbnail_url TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_templates_company ON email_templates(company_id);
CREATE INDEX idx_email_templates_status ON email_templates(status);
CREATE INDEX idx_email_templates_category ON email_templates(category);

-- Table: email_campaigns
CREATE TABLE IF NOT EXISTS email_campaigns (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  preview_text VARCHAR(255),
  from_name VARCHAR(255) NOT NULL,
  from_email VARCHAR(255) NOT NULL,
  reply_to_email VARCHAR(255),
  template_id BIGINT,
  html_content TEXT NOT NULL,
  text_content TEXT,
  status VARCHAR(50) DEFAULT 'draft',
  type VARCHAR(50) DEFAULT 'standard',
  send_at TIMESTAMP,
  completed_at TIMESTAMP,
  total_recipients INT DEFAULT 0,
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_clicked INT DEFAULT 0,
  total_bounced INT DEFAULT 0,
  total_unsubscribed INT DEFAULT 0,
  total_spam_complaints INT DEFAULT 0,
  provider VARCHAR(50) DEFAULT 'sendgrid',
  provider_campaign_id VARCHAR(255),
  settings JSONB DEFAULT '{}',
  ai_optimized BOOLEAN DEFAULT FALSE,
  ai_optimization_data JSONB,
  tags TEXT[],
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_campaigns_company ON email_campaigns(company_id);
CREATE INDEX idx_email_campaigns_status ON email_campaigns(status);
CREATE INDEX idx_email_campaigns_send_at ON email_campaigns(send_at);
CREATE INDEX idx_email_campaigns_type ON email_campaigns(type);

-- Table: email_campaign_recipients
CREATE TABLE IF NOT EXISTS email_campaign_recipients (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  contact_id BIGINT,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255),
  personalization_data JSONB DEFAULT '{}',
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  delivered_at TIMESTAMP,
  opened_at TIMESTAMP,
  first_opened_at TIMESTAMP,
  clicked_at TIMESTAMP,
  first_clicked_at TIMESTAMP,
  bounced_at TIMESTAMP,
  bounce_type VARCHAR(50),
  bounce_reason TEXT,
  unsubscribed_at TIMESTAMP,
  spam_complaint_at TIMESTAMP,
  provider_message_id VARCHAR(255),
  open_count INT DEFAULT 0,
  click_count INT DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_recipients_campaign ON email_campaign_recipients(campaign_id);
CREATE INDEX idx_email_recipients_company ON email_campaign_recipients(company_id);
CREATE INDEX idx_email_recipients_contact ON email_campaign_recipients(contact_id);
CREATE INDEX idx_email_recipients_status ON email_campaign_recipients(status);
CREATE INDEX idx_email_recipients_email ON email_campaign_recipients(email);

-- Table: email_tracking_events
CREATE TABLE IF NOT EXISTS email_tracking_events (
  id BIGSERIAL PRIMARY KEY,
  recipient_id BIGINT NOT NULL,
  campaign_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB DEFAULT '{}',
  ip_address VARCHAR(45),
  user_agent TEXT,
  location JSONB,
  device_type VARCHAR(50),
  email_client VARCHAR(100),
  link_url TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient_id) REFERENCES email_campaign_recipients(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_events_recipient ON email_tracking_events(recipient_id);
CREATE INDEX idx_email_events_campaign ON email_tracking_events(campaign_id);
CREATE INDEX idx_email_events_type ON email_tracking_events(event_type);
CREATE INDEX idx_email_events_timestamp ON email_tracking_events(timestamp DESC);

-- Table: email_unsubscribes
CREATE TABLE IF NOT EXISTS email_unsubscribes (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  email VARCHAR(255) NOT NULL,
  contact_id BIGINT,
  campaign_id BIGINT,
  reason VARCHAR(255),
  feedback TEXT,
  unsubscribed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE SET NULL,
  UNIQUE(company_id, email)
);

CREATE INDEX idx_email_unsubscribes_company ON email_unsubscribes(company_id);
CREATE INDEX idx_email_unsubscribes_email ON email_unsubscribes(email);

-- Table: email_provider_configs
CREATE TABLE IF NOT EXISTS email_provider_configs (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  provider VARCHAR(50) NOT NULL,
  api_key TEXT NOT NULL,
  api_secret TEXT,
  domain VARCHAR(255),
  region VARCHAR(50),
  verified_sender_email VARCHAR(255),
  verified_sender_name VARCHAR(255),
  is_active BOOLEAN DEFAULT TRUE,
  daily_limit INT DEFAULT 10000,
  hourly_limit INT DEFAULT 1000,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id, provider)
);

CREATE INDEX idx_email_provider_configs_company ON email_provider_configs(company_id);
CREATE INDEX idx_email_provider_configs_active ON email_provider_configs(is_active);

-- Table: email_ai_suggestions
CREATE TABLE IF NOT EXISTS email_ai_suggestions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  campaign_id BIGINT,
  template_id BIGINT,
  suggestion_type VARCHAR(50) NOT NULL,
  original_content TEXT,
  suggested_content TEXT NOT NULL,
  reasoning TEXT,
  confidence_score FLOAT,
  ai_model VARCHAR(50),
  ai_tokens_used INT,
  status VARCHAR(50) DEFAULT 'pending',
  applied_at TIMESTAMP,
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE,
  FOREIGN KEY (template_id) REFERENCES email_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_email_ai_suggestions_company ON email_ai_suggestions(company_id);
CREATE INDEX idx_email_ai_suggestions_campaign ON email_ai_suggestions(campaign_id);
CREATE INDEX idx_email_ai_suggestions_template ON email_ai_suggestions(template_id);
CREATE INDEX idx_email_ai_suggestions_status ON email_ai_suggestions(status);

-- Table: email_ab_tests
CREATE TABLE IF NOT EXISTS email_ab_tests (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  campaign_id BIGINT NOT NULL,
  test_name VARCHAR(255) NOT NULL,
  test_type VARCHAR(50) NOT NULL,
  variant_a_data JSONB NOT NULL,
  variant_b_data JSONB NOT NULL,
  variant_a_recipients INT DEFAULT 0,
  variant_b_recipients INT DEFAULT 0,
  variant_a_opens INT DEFAULT 0,
  variant_b_opens INT DEFAULT 0,
  variant_a_clicks INT DEFAULT 0,
  variant_b_clicks INT DEFAULT 0,
  winner VARCHAR(10),
  confidence_level FLOAT,
  status VARCHAR(50) DEFAULT 'running',
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (campaign_id) REFERENCES email_campaigns(id) ON DELETE CASCADE
);

CREATE INDEX idx_email_ab_tests_company ON email_ab_tests(company_id);
CREATE INDEX idx_email_ab_tests_campaign ON email_ab_tests(campaign_id);
CREATE INDEX idx_email_ab_tests_status ON email_ab_tests(status);

-- Table: email_analytics_daily
CREATE TABLE IF NOT EXISTS email_analytics_daily (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  date DATE NOT NULL,
  total_sent INT DEFAULT 0,
  total_delivered INT DEFAULT 0,
  total_opened INT DEFAULT 0,
  total_clicked INT DEFAULT 0,
  total_bounced INT DEFAULT 0,
  total_unsubscribed INT DEFAULT 0,
  total_spam_complaints INT DEFAULT 0,
  unique_opens INT DEFAULT 0,
  unique_clicks INT DEFAULT 0,
  delivery_rate FLOAT DEFAULT 0,
  open_rate FLOAT DEFAULT 0,
  click_rate FLOAT DEFAULT 0,
  bounce_rate FLOAT DEFAULT 0,
  unsubscribe_rate FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id, date)
);

CREATE INDEX idx_email_analytics_company ON email_analytics_daily(company_id);
CREATE INDEX idx_email_analytics_date ON email_analytics_daily(date DESC);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_email_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_email_templates_updated_at
  BEFORE UPDATE ON email_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_email_tables_updated_at();

CREATE TRIGGER trigger_email_campaigns_updated_at
  BEFORE UPDATE ON email_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION update_email_tables_updated_at();

CREATE TRIGGER trigger_email_recipients_updated_at
  BEFORE UPDATE ON email_campaign_recipients
  FOR EACH ROW
  EXECUTE FUNCTION update_email_tables_updated_at();

CREATE TRIGGER trigger_email_provider_configs_updated_at
  BEFORE UPDATE ON email_provider_configs
  FOR EACH ROW
  EXECUTE FUNCTION update_email_tables_updated_at();
