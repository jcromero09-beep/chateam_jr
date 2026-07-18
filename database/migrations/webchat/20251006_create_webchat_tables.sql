-- Migration: Create WebChat Tables
-- Date: 2025-10-06
-- Description: Tables for WebChat channel functionality

-- Table: webchat_channels
CREATE TABLE IF NOT EXISTS webchat_channels (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  channel_id VARCHAR(100) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  webhook_secret VARCHAR(255) NOT NULL,
  allowed_domains TEXT,
  theme_config JSONB DEFAULT '{}',
  auto_assign_queue_id BIGINT,
  session_timeout INT DEFAULT 86400,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (auto_assign_queue_id) REFERENCES queues(id) ON DELETE SET NULL
);

CREATE INDEX idx_webchat_channels_company ON webchat_channels(company_id);
CREATE INDEX idx_webchat_channels_channel_id ON webchat_channels(channel_id);

-- Table: webchat_sessions
CREATE TABLE IF NOT EXISTS webchat_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_id VARCHAR(100) UNIQUE NOT NULL,
  channel_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  contact_id BIGINT,
  ticket_id BIGINT,
  status VARCHAR(50) DEFAULT 'active',
  metadata JSONB DEFAULT '{}',
  user_agent TEXT,
  ip_address VARCHAR(45),
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  last_message_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  closed_at TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES webchat_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL
);

CREATE INDEX idx_webchat_sessions_session_id ON webchat_sessions(session_id);
CREATE INDEX idx_webchat_sessions_channel ON webchat_sessions(channel_id);
CREATE INDEX idx_webchat_sessions_company ON webchat_sessions(company_id);
CREATE INDEX idx_webchat_sessions_contact ON webchat_sessions(contact_id);
CREATE INDEX idx_webchat_sessions_status ON webchat_sessions(status);

-- Table: webchat_messages
CREATE TABLE IF NOT EXISTS webchat_messages (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL,
  ticket_id BIGINT,
  company_id BIGINT NOT NULL,
  direction VARCHAR(20) NOT NULL,
  type VARCHAR(50) DEFAULT 'text',
  content TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  read_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES webchat_sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_webchat_messages_session ON webchat_messages(session_id);
CREATE INDEX idx_webchat_messages_ticket ON webchat_messages(ticket_id);
CREATE INDEX idx_webchat_messages_company ON webchat_messages(company_id);
CREATE INDEX idx_webchat_messages_direction ON webchat_messages(direction);
CREATE INDEX idx_webchat_messages_created ON webchat_messages(created_at DESC);

-- Table: webchat_analytics
CREATE TABLE IF NOT EXISTS webchat_analytics (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  date DATE NOT NULL,
  total_sessions INT DEFAULT 0,
  active_sessions INT DEFAULT 0,
  completed_sessions INT DEFAULT 0,
  abandoned_sessions INT DEFAULT 0,
  total_messages INT DEFAULT 0,
  avg_response_time FLOAT DEFAULT 0,
  avg_session_duration FLOAT DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (channel_id) REFERENCES webchat_channels(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(channel_id, date)
);

CREATE INDEX idx_webchat_analytics_channel ON webchat_analytics(channel_id);
CREATE INDEX idx_webchat_analytics_date ON webchat_analytics(date DESC);

-- Add trigger to update updated_at
CREATE OR REPLACE FUNCTION update_webchat_channels_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_webchat_channels_updated_at
  BEFORE UPDATE ON webchat_channels
  FOR EACH ROW
  EXECUTE FUNCTION update_webchat_channels_updated_at();

