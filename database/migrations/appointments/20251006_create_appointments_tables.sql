-- Migration: Create Appointments System Tables
-- Date: 2025-10-06
-- Description: Complete appointment scheduling system with AI integration

-- Table: appointment_services
CREATE TABLE IF NOT EXISTS appointment_services (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration INT NOT NULL, -- in minutes
  buffer_time INT DEFAULT 0, -- minutes before/after
  price DECIMAL(10,2),
  currency VARCHAR(3) DEFAULT 'USD',
  color VARCHAR(7) DEFAULT '#007bff',
  is_active BOOLEAN DEFAULT TRUE,
  max_attendees INT DEFAULT 1,
  requires_confirmation BOOLEAN DEFAULT FALSE,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_appointment_services_company ON appointment_services(company_id);
CREATE INDEX idx_appointment_services_active ON appointment_services(is_active);

-- Table: appointment_availability
CREATE TABLE IF NOT EXISTS appointment_availability (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  user_id BIGINT,
  service_id BIGINT,
  day_of_week INT NOT NULL, -- 0=Sunday, 6=Saturday
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_available BOOLEAN DEFAULT TRUE,
  timezone VARCHAR(50) DEFAULT 'UTC',
  effective_from DATE,
  effective_until DATE,
  recurrence_rule TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES appointment_services(id) ON DELETE CASCADE
);

CREATE INDEX idx_appointment_availability_company ON appointment_availability(company_id);
CREATE INDEX idx_appointment_availability_user ON appointment_availability(user_id);
CREATE INDEX idx_appointment_availability_service ON appointment_availability(service_id);
CREATE INDEX idx_appointment_availability_dow ON appointment_availability(day_of_week);

-- Table: appointments
CREATE TABLE IF NOT EXISTS appointments (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  service_id BIGINT,
  user_id BIGINT, -- assigned agent/staff
  contact_id BIGINT,
  ticket_id BIGINT,
  title VARCHAR(255) NOT NULL,
  description TEXT,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  duration INT NOT NULL, -- in minutes
  timezone VARCHAR(50) DEFAULT 'UTC',
  status VARCHAR(50) DEFAULT 'scheduled',
  attendee_name VARCHAR(255),
  attendee_email VARCHAR(255),
  attendee_phone VARCHAR(50),
  attendee_count INT DEFAULT 1,
  location VARCHAR(255),
  location_type VARCHAR(50) DEFAULT 'in_person',
  meeting_url TEXT,
  meeting_platform VARCHAR(50),
  notes TEXT,
  internal_notes TEXT,
  cancellation_reason TEXT,
  rescheduled_from BIGINT,
  rescheduled_to BIGINT,
  google_calendar_event_id VARCHAR(255),
  outlook_calendar_event_id VARCHAR(255),
  reminder_sent BOOLEAN DEFAULT FALSE,
  confirmation_sent BOOLEAN DEFAULT FALSE,
  ai_suggested BOOLEAN DEFAULT FALSE,
  ai_optimization_data JSONB,
  metadata JSONB DEFAULT '{}',
  created_by BIGINT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  cancelled_at TIMESTAMP,
  confirmed_at TIMESTAMP,
  completed_at TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES appointment_services(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE SET NULL,
  FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (rescheduled_from) REFERENCES appointments(id) ON DELETE SET NULL,
  FOREIGN KEY (rescheduled_to) REFERENCES appointments(id) ON DELETE SET NULL
);

CREATE INDEX idx_appointments_company ON appointments(company_id);
CREATE INDEX idx_appointments_service ON appointments(service_id);
CREATE INDEX idx_appointments_user ON appointments(user_id);
CREATE INDEX idx_appointments_contact ON appointments(contact_id);
CREATE INDEX idx_appointments_ticket ON appointments(ticket_id);
CREATE INDEX idx_appointments_status ON appointments(status);
CREATE INDEX idx_appointments_start_time ON appointments(start_time);
CREATE INDEX idx_appointments_end_time ON appointments(end_time);

-- Table: appointment_reminders
CREATE TABLE IF NOT EXISTS appointment_reminders (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT NOT NULL,
  company_id BIGINT NOT NULL,
  reminder_type VARCHAR(50) NOT NULL, -- email, whatsapp, sms, push
  remind_at TIMESTAMP NOT NULL,
  minutes_before INT NOT NULL,
  status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (appointment_id) REFERENCES appointments(id) ON DELETE CASCADE,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
);

CREATE INDEX idx_appointment_reminders_appointment ON appointment_reminders(appointment_id);
CREATE INDEX idx_appointment_reminders_status ON appointment_reminders(status);
CREATE INDEX idx_appointment_reminders_remind_at ON appointment_reminders(remind_at);

-- Table: appointment_blocks
CREATE TABLE IF NOT EXISTS appointment_blocks (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  user_id BIGINT,
  title VARCHAR(255) NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  reason TEXT,
  is_recurring BOOLEAN DEFAULT FALSE,
  recurrence_rule TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_appointment_blocks_company ON appointment_blocks(company_id);
CREATE INDEX idx_appointment_blocks_user ON appointment_blocks(user_id);
CREATE INDEX idx_appointment_blocks_time ON appointment_blocks(start_time, end_time);

-- Table: appointment_calendar_sync
CREATE TABLE IF NOT EXISTS appointment_calendar_sync (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  user_id BIGINT NOT NULL,
  provider VARCHAR(50) NOT NULL, -- google, outlook, apple
  calendar_id VARCHAR(255) NOT NULL,
  calendar_name VARCHAR(255),
  access_token TEXT NOT NULL,
  refresh_token TEXT,
  token_expires_at TIMESTAMP,
  sync_enabled BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  sync_direction VARCHAR(50) DEFAULT 'bidirectional',
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, provider, calendar_id)
);

CREATE INDEX idx_calendar_sync_company ON appointment_calendar_sync(company_id);
CREATE INDEX idx_calendar_sync_user ON appointment_calendar_sync(user_id);
CREATE INDEX idx_calendar_sync_provider ON appointment_calendar_sync(provider);

-- Table: appointment_ai_suggestions
CREATE TABLE IF NOT EXISTS appointment_ai_suggestions (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  contact_id BIGINT,
  suggestion_type VARCHAR(50) NOT NULL,
  suggested_time TIMESTAMP NOT NULL,
  confidence_score FLOAT,
  reasoning TEXT,
  alternative_times JSONB,
  service_id BIGINT,
  user_id BIGINT,
  status VARCHAR(50) DEFAULT 'pending',
  applied_at TIMESTAMP,
  ai_model VARCHAR(50),
  ai_tokens_used INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  FOREIGN KEY (contact_id) REFERENCES contacts(id) ON DELETE CASCADE,
  FOREIGN KEY (service_id) REFERENCES appointment_services(id) ON DELETE SET NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX idx_appointment_ai_suggestions_company ON appointment_ai_suggestions(company_id);
CREATE INDEX idx_appointment_ai_suggestions_contact ON appointment_ai_suggestions(contact_id);
CREATE INDEX idx_appointment_ai_suggestions_status ON appointment_ai_suggestions(status);

-- Table: appointment_analytics
CREATE TABLE IF NOT EXISTS appointment_analytics (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL,
  date DATE NOT NULL,
  total_scheduled INT DEFAULT 0,
  total_confirmed INT DEFAULT 0,
  total_completed INT DEFAULT 0,
  total_cancelled INT DEFAULT 0,
  total_no_show INT DEFAULT 0,
  total_rescheduled INT DEFAULT 0,
  avg_booking_lead_time FLOAT DEFAULT 0,
  avg_duration FLOAT DEFAULT 0,
  peak_hour INT,
  busiest_day_of_week INT,
  revenue_generated DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE,
  UNIQUE(company_id, date)
);

CREATE INDEX idx_appointment_analytics_company ON appointment_analytics(company_id);
CREATE INDEX idx_appointment_analytics_date ON appointment_analytics(date DESC);

-- Add triggers to update updated_at
CREATE OR REPLACE FUNCTION update_appointment_tables_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_appointment_services_updated_at
  BEFORE UPDATE ON appointment_services
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_tables_updated_at();

CREATE TRIGGER trigger_appointment_availability_updated_at
  BEFORE UPDATE ON appointment_availability
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_tables_updated_at();

CREATE TRIGGER trigger_appointments_updated_at
  BEFORE UPDATE ON appointments
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_tables_updated_at();

CREATE TRIGGER trigger_calendar_sync_updated_at
  BEFORE UPDATE ON appointment_calendar_sync
  FOR EACH ROW
  EXECUTE FUNCTION update_appointment_tables_updated_at();
