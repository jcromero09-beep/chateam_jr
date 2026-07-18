-- =====================================================
-- MIGRATION: Canales Instagram y Facebook Messenger
-- Fecha: 6 de octubre de 2025
-- Fase: 6 - Expansión
-- =====================================================

-- 1. Tabla de Canales de Redes Sociales
CREATE TABLE IF NOT EXISTS social_channels (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- instagram, facebook_messenger
  account_name VARCHAR(255) NOT NULL,
  account_id VARCHAR(255) NOT NULL, -- Instagram User ID / Facebook Page ID
  access_token TEXT NOT NULL,
  token_expires_at TIMESTAMP,
  refresh_token TEXT,
  webhook_verify_token VARCHAR(255),
  page_access_token TEXT, -- For Facebook Pages
  instagram_business_account_id VARCHAR(255),
  configuration JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  last_sync_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, platform, account_id)
);

-- 2. Tabla de Mensajes de Redes Sociales
CREATE TABLE IF NOT EXISTS social_messages (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  contact_id BIGINT REFERENCES contacts(id) ON DELETE SET NULL,
  platform_message_id VARCHAR(255) NOT NULL UNIQUE,
  sender_id VARCHAR(255) NOT NULL, -- Instagram IGSID / Facebook PSID
  sender_username VARCHAR(255),
  recipient_id VARCHAR(255) NOT NULL,
  message_type VARCHAR(50) NOT NULL, -- text, image, video, story_mention, story_reply
  message_text TEXT,
  media_url TEXT,
  media_type VARCHAR(50), -- image, video, audio
  attachments JSONB DEFAULT '[]',
  reaction VARCHAR(50), -- emoji reaction
  is_from_me BOOLEAN DEFAULT FALSE,
  is_deleted BOOLEAN DEFAULT FALSE,
  replied_to_message_id VARCHAR(255),
  metadata JSONB DEFAULT '{}',
  raw_data JSONB,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. Tabla de Stories
CREATE TABLE IF NOT EXISTS social_stories (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform_story_id VARCHAR(255) NOT NULL UNIQUE,
  story_type VARCHAR(50), -- image, video
  media_url TEXT NOT NULL,
  caption TEXT,
  mentions JSONB DEFAULT '[]', -- Usuarios mencionados
  reply_count INTEGER DEFAULT 0,
  view_count INTEGER DEFAULT 0,
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Menciones y Comentarios
CREATE TABLE IF NOT EXISTS social_mentions (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  ticket_id BIGINT REFERENCES tickets(id) ON DELETE SET NULL,
  platform_mention_id VARCHAR(255) NOT NULL UNIQUE,
  mention_type VARCHAR(50), -- story_mention, comment, tag
  post_id VARCHAR(255), -- ID del post original
  post_url TEXT,
  from_user_id VARCHAR(255) NOT NULL,
  from_username VARCHAR(255),
  text TEXT,
  media_url TEXT,
  sentiment VARCHAR(50), -- positive, neutral, negative
  is_replied BOOLEAN DEFAULT FALSE,
  replied_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Templates de Respuesta para Instagram
CREATE TABLE IF NOT EXISTS instagram_quick_replies (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  message_text TEXT NOT NULL,
  media_url TEXT,
  media_type VARCHAR(50),
  buttons JSONB DEFAULT '[]', -- Quick reply buttons
  use_count INTEGER DEFAULT 0,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name)
);

-- 6. Tabla de Audiencia y Segmentación
CREATE TABLE IF NOT EXISTS social_audience (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT NOT NULL REFERENCES social_channels(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  platform_user_id VARCHAR(255) NOT NULL,
  username VARCHAR(255),
  full_name VARCHAR(255),
  profile_pic_url TEXT,
  follower_count INTEGER,
  following_count INTEGER,
  is_follower BOOLEAN DEFAULT FALSE,
  is_following BOOLEAN DEFAULT FALSE,
  last_interaction_at TIMESTAMP,
  interaction_count INTEGER DEFAULT 0,
  tags JSONB DEFAULT '[]',
  custom_fields JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(channel_id, platform_user_id)
);

-- 7. Tabla de Campañas de Redes Sociales
CREATE TABLE IF NOT EXISTS social_campaigns (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  channel_id BIGINT REFERENCES social_channels(id) ON DELETE SET NULL,
  campaign_name VARCHAR(255) NOT NULL,
  campaign_type VARCHAR(50), -- dm_blast, story_engagement, comment_automation
  target_audience JSONB DEFAULT '{}', -- Filtros de segmentación
  message_template_id BIGINT REFERENCES instagram_quick_replies(id) ON DELETE SET NULL,
  schedule_type VARCHAR(50) DEFAULT 'immediate', -- immediate, scheduled
  scheduled_at TIMESTAMP,
  status VARCHAR(50) DEFAULT 'draft', -- draft, scheduled, running, completed, cancelled
  sent_count INTEGER DEFAULT 0,
  delivered_count INTEGER DEFAULT 0,
  read_count INTEGER DEFAULT 0,
  reply_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. Tabla de Webhooks de Redes Sociales
CREATE TABLE IF NOT EXISTS social_webhook_events (
  id BIGSERIAL PRIMARY KEY,
  channel_id BIGINT REFERENCES social_channels(id) ON DELETE SET NULL,
  platform VARCHAR(50) NOT NULL,
  event_type VARCHAR(100) NOT NULL, -- messages, messaging_postbacks, messaging_optins, etc.
  event_id VARCHAR(255),
  payload JSONB NOT NULL,
  processing_status VARCHAR(50) DEFAULT 'pending', -- pending, processed, failed
  error_message TEXT,
  processed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_social_channels_company ON social_channels(company_id);
CREATE INDEX idx_social_channels_platform ON social_channels(platform, is_active);
CREATE INDEX idx_social_messages_channel ON social_messages(channel_id);
CREATE INDEX idx_social_messages_ticket ON social_messages(ticket_id);
CREATE INDEX idx_social_messages_contact ON social_messages(contact_id);
CREATE INDEX idx_social_messages_sender ON social_messages(sender_id);
CREATE INDEX idx_social_messages_date ON social_messages(created_at);
CREATE INDEX idx_social_stories_channel ON social_stories(channel_id);
CREATE INDEX idx_social_mentions_channel ON social_mentions(channel_id);
CREATE INDEX idx_social_mentions_replied ON social_mentions(is_replied);
CREATE INDEX idx_social_audience_channel ON social_audience(channel_id);
CREATE INDEX idx_social_audience_user ON social_audience(platform_user_id);
CREATE INDEX idx_social_campaigns_company ON social_campaigns(company_id);
CREATE INDEX idx_social_campaigns_status ON social_campaigns(status);
CREATE INDEX idx_social_webhooks_status ON social_webhook_events(processing_status);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER trigger_update_social_channels_timestamp
  BEFORE UPDATE ON social_channels
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

CREATE TRIGGER trigger_update_social_audience_timestamp
  BEFORE UPDATE ON social_audience
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

CREATE TRIGGER trigger_update_social_campaigns_timestamp
  BEFORE UPDATE ON social_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para obtener estadísticas de canal
CREATE OR REPLACE FUNCTION get_social_channel_stats(p_channel_id BIGINT)
RETURNS TABLE (
  total_messages BIGINT,
  messages_today BIGINT,
  pending_mentions BIGINT,
  avg_response_time_minutes INTEGER,
  active_conversations BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    (SELECT COUNT(*) FROM social_messages WHERE channel_id = p_channel_id) AS total_messages,
    (SELECT COUNT(*) FROM social_messages WHERE channel_id = p_channel_id AND created_at >= CURRENT_DATE) AS messages_today,
    (SELECT COUNT(*) FROM social_mentions WHERE channel_id = p_channel_id AND is_replied = FALSE) AS pending_mentions,
    (SELECT AVG(EXTRACT(EPOCH FROM (replied_at - created_at))/60)::INTEGER
     FROM social_mentions WHERE channel_id = p_channel_id AND is_replied = TRUE) AS avg_response_time_minutes,
    (SELECT COUNT(DISTINCT ticket_id) FROM social_messages WHERE channel_id = p_channel_id
     AND ticket_id IN (SELECT id FROM tickets WHERE status = 'open')) AS active_conversations;
END;
$$ LANGUAGE plpgsql;

-- Función para crear ticket desde mensaje de redes sociales
CREATE OR REPLACE FUNCTION create_ticket_from_social_message(
  p_message_id BIGINT
) RETURNS BIGINT AS $$
DECLARE
  v_ticket_id BIGINT;
  v_message RECORD;
  v_contact_id BIGINT;
  v_queue_id BIGINT;
BEGIN
  -- Obtener datos del mensaje
  SELECT * INTO v_message FROM social_messages WHERE id = p_message_id;

  -- Buscar o crear contacto
  SELECT id INTO v_contact_id FROM contacts
  WHERE company_id = v_message.company_id
    AND (
      number = v_message.sender_id
      OR profile_pic_url = (SELECT profile_pic_url FROM social_audience
                            WHERE platform_user_id = v_message.sender_id LIMIT 1)
    );

  IF v_contact_id IS NULL THEN
    -- Crear nuevo contacto
    INSERT INTO contacts (company_id, name, number, profile_pic_url, is_group)
    VALUES (
      v_message.company_id,
      COALESCE(v_message.sender_username, 'Usuario ' || v_message.sender_id),
      v_message.sender_id,
      (SELECT profile_pic_url FROM social_audience WHERE platform_user_id = v_message.sender_id LIMIT 1),
      FALSE
    )
    RETURNING id INTO v_contact_id;
  END IF;

  -- Obtener cola predeterminada
  SELECT id INTO v_queue_id FROM queues
  WHERE company_id = v_message.company_id
  ORDER BY id LIMIT 1;

  -- Crear ticket
  INSERT INTO tickets (company_id, contact_id, queue_id, status, channel, whatsapp_id)
  VALUES (
    v_message.company_id,
    v_contact_id,
    v_queue_id,
    'open',
    (SELECT platform FROM social_channels WHERE id = v_message.channel_id),
    v_message.channel_id
  )
  RETURNING id INTO v_ticket_id;

  -- Actualizar mensaje con ticket_id
  UPDATE social_messages SET ticket_id = v_ticket_id WHERE id = p_message_id;

  RETURN v_ticket_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE social_channels IS 'Canales de Instagram y Facebook Messenger';
COMMENT ON TABLE social_messages IS 'Mensajes de redes sociales (DMs)';
COMMENT ON TABLE social_stories IS 'Stories de Instagram';
COMMENT ON TABLE social_mentions IS 'Menciones, comentarios y tags';
COMMENT ON TABLE social_audience IS 'Audiencia y segmentación de usuarios';
COMMENT ON TABLE social_campaigns IS 'Campañas de engagement en redes sociales';
