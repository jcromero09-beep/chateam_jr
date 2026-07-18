-- =====================================================
-- MIGRATION: Sistema de Internacionalización (i18n)
-- Fecha: 6 de octubre de 2025
-- Fase: 6 - Expansión
-- =====================================================

-- 1. Tabla de Idiomas Disponibles
CREATE TABLE IF NOT EXISTS supported_languages (
  id BIGSERIAL PRIMARY KEY,
  language_code VARCHAR(10) NOT NULL UNIQUE, -- es, en, pt, fr, de, it
  language_name VARCHAR(100) NOT NULL,
  native_name VARCHAR(100) NOT NULL, -- Español, English, Português
  flag_emoji VARCHAR(10),
  is_rtl BOOLEAN DEFAULT FALSE, -- Right-to-left (Arabic, Hebrew)
  is_active BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Traducciones de Interfaz
CREATE TABLE IF NOT EXISTS ui_translations (
  id BIGSERIAL PRIMARY KEY,
  language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code) ON DELETE CASCADE,
  translation_key VARCHAR(255) NOT NULL, -- user.welcome_message, button.save, etc.
  translation_value TEXT NOT NULL,
  context VARCHAR(255), -- Contexto donde se usa la traducción
  is_verified BOOLEAN DEFAULT FALSE,
  verified_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  verified_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(language_code, translation_key)
);

-- 3. Tabla de Configuración de Idioma por Empresa
CREATE TABLE IF NOT EXISTS company_language_settings (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE UNIQUE,
  default_language VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  enabled_languages VARCHAR(10)[] DEFAULT '{es}',
  auto_detect BOOLEAN DEFAULT TRUE, -- Detectar idioma del navegador
  fallback_language VARCHAR(10) DEFAULT 'en',
  translate_customer_messages BOOLEAN DEFAULT FALSE, -- Traducir mensajes de clientes
  translate_chatbot_responses BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Preferencias de Idioma de Usuario
CREATE TABLE IF NOT EXISTS user_language_preferences (
  id BIGSERIAL PRIMARY KEY,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  preferred_language VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  timezone VARCHAR(100) DEFAULT 'UTC',
  date_format VARCHAR(50) DEFAULT 'DD/MM/YYYY',
  time_format VARCHAR(50) DEFAULT '24h', -- 24h, 12h
  number_format VARCHAR(50) DEFAULT 'decimal', -- decimal, comma
  currency_code VARCHAR(10) DEFAULT 'USD',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 5. Tabla de Contenido Traducible (Templates, Mensajes Rápidos, etc.)
CREATE TABLE IF NOT EXISTS translatable_content (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  content_type VARCHAR(50) NOT NULL, -- quick_reply, greeting_message, chatbot_response, email_template
  content_id BIGINT NOT NULL, -- ID del contenido original
  original_language VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  original_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, content_type, content_id)
);

-- 6. Tabla de Traducciones de Contenido
CREATE TABLE IF NOT EXISTS content_translations (
  id BIGSERIAL PRIMARY KEY,
  translatable_content_id BIGINT NOT NULL REFERENCES translatable_content(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  translated_text TEXT NOT NULL,
  translation_method VARCHAR(50) DEFAULT 'manual', -- manual, ai_auto, ai_assisted
  translated_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  is_approved BOOLEAN DEFAULT FALSE,
  approved_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  approved_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(translatable_content_id, language_code)
);

-- 7. Tabla de Glosario de Términos
CREATE TABLE IF NOT EXISTS translation_glossary (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE, -- NULL = global
  term VARCHAR(255) NOT NULL,
  language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  translation VARCHAR(255) NOT NULL,
  context TEXT,
  is_global BOOLEAN DEFAULT FALSE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, term, language_code)
);

-- 8. Tabla de Estadísticas de Traducción
CREATE TABLE IF NOT EXISTS translation_stats (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  language_code VARCHAR(10) NOT NULL REFERENCES supported_languages(language_code),
  total_strings INTEGER DEFAULT 0,
  translated_strings INTEGER DEFAULT 0,
  verified_strings INTEGER DEFAULT 0,
  auto_translated_strings INTEGER DEFAULT 0,
  completion_percentage DECIMAL(5,2),
  last_updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, language_code)
);

-- =====================================================
-- SEED DATA: Idiomas Soportados
-- =====================================================

INSERT INTO supported_languages (language_code, language_name, native_name, flag_emoji, is_rtl, display_order) VALUES
('es', 'Spanish', 'Español', '🇪🇸', FALSE, 1),
('en', 'English', 'English', '🇬🇧', FALSE, 2),
('pt', 'Portuguese', 'Português', '🇵🇹', FALSE, 3),
('fr', 'French', 'Français', '🇫🇷', FALSE, 4),
('de', 'German', 'Deutsch', '🇩🇪', FALSE, 5),
('it', 'Italian', 'Italiano', '🇮🇹', FALSE, 6),
('ru', 'Russian', 'Русский', '🇷🇺', FALSE, 7),
('zh', 'Chinese', '中文', '🇨🇳', FALSE, 8),
('ja', 'Japanese', '日本語', '🇯🇵', FALSE, 9),
('ar', 'Arabic', 'العربية', '🇸🇦', TRUE, 10);

-- =====================================================
-- SEED DATA: Traducciones de Interfaz Base
-- =====================================================

-- Traducciones comunes (ES)
INSERT INTO ui_translations (language_code, translation_key, translation_value, context) VALUES
('es', 'common.save', 'Guardar', 'Botón general'),
('es', 'common.cancel', 'Cancelar', 'Botón general'),
('es', 'common.delete', 'Eliminar', 'Botón general'),
('es', 'common.edit', 'Editar', 'Botón general'),
('es', 'common.search', 'Buscar', 'Campo de búsqueda'),
('es', 'common.loading', 'Cargando...', 'Estado de carga'),
('es', 'common.error', 'Error', 'Mensaje de error'),
('es', 'common.success', 'Éxito', 'Mensaje de éxito'),
('es', 'user.welcome_message', 'Bienvenido, {{name}}!', 'Mensaje de bienvenida'),
('es', 'tickets.new_ticket', 'Nuevo Ticket', 'Crear ticket'),
('es', 'tickets.open', 'Abierto', 'Estado de ticket'),
('es', 'tickets.closed', 'Cerrado', 'Estado de ticket'),
('es', 'messages.send', 'Enviar mensaje', 'Botón enviar'),
('es', 'campaigns.create', 'Crear campaña', 'Crear campaña'),
('es', 'settings.general', 'Configuración general', 'Menú configuración');

-- Traducciones comunes (EN)
INSERT INTO ui_translations (language_code, translation_key, translation_value, context) VALUES
('en', 'common.save', 'Save', 'General button'),
('en', 'common.cancel', 'Cancel', 'General button'),
('en', 'common.delete', 'Delete', 'General button'),
('en', 'common.edit', 'Edit', 'General button'),
('en', 'common.search', 'Search', 'Search field'),
('en', 'common.loading', 'Loading...', 'Loading state'),
('en', 'common.error', 'Error', 'Error message'),
('en', 'common.success', 'Success', 'Success message'),
('en', 'user.welcome_message', 'Welcome, {{name}}!', 'Welcome message'),
('en', 'tickets.new_ticket', 'New Ticket', 'Create ticket'),
('en', 'tickets.open', 'Open', 'Ticket status'),
('en', 'tickets.closed', 'Closed', 'Ticket status'),
('en', 'messages.send', 'Send message', 'Send button'),
('en', 'campaigns.create', 'Create campaign', 'Create campaign'),
('en', 'settings.general', 'General settings', 'Settings menu');

-- Traducciones comunes (PT)
INSERT INTO ui_translations (language_code, translation_key, translation_value, context) VALUES
('pt', 'common.save', 'Salvar', 'Botão geral'),
('pt', 'common.cancel', 'Cancelar', 'Botão geral'),
('pt', 'common.delete', 'Excluir', 'Botão geral'),
('pt', 'common.edit', 'Editar', 'Botão geral'),
('pt', 'common.search', 'Buscar', 'Campo de busca'),
('pt', 'common.loading', 'Carregando...', 'Estado de carregamento'),
('pt', 'common.error', 'Erro', 'Mensagem de erro'),
('pt', 'common.success', 'Sucesso', 'Mensagem de sucesso'),
('pt', 'user.welcome_message', 'Bem-vindo, {{name}}!', 'Mensagem de boas-vindas'),
('pt', 'tickets.new_ticket', 'Novo Ticket', 'Criar ticket'),
('pt', 'tickets.open', 'Aberto', 'Status do ticket'),
('pt', 'tickets.closed', 'Fechado', 'Status do ticket'),
('pt', 'messages.send', 'Enviar mensagem', 'Botão enviar'),
('pt', 'campaigns.create', 'Criar campanha', 'Criar campanha'),
('pt', 'settings.general', 'Configurações gerais', 'Menu configurações');

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_ui_translations_language ON ui_translations(language_code);
CREATE INDEX idx_ui_translations_key ON ui_translations(translation_key);
CREATE INDEX idx_company_lang_settings ON company_language_settings(company_id);
CREATE INDEX idx_user_lang_prefs ON user_language_preferences(user_id);
CREATE INDEX idx_translatable_content_company ON translatable_content(company_id, content_type);
CREATE INDEX idx_content_translations_content ON content_translations(translatable_content_id);
CREATE INDEX idx_content_translations_lang ON content_translations(language_code);
CREATE INDEX idx_glossary_company ON translation_glossary(company_id, language_code);
CREATE INDEX idx_translation_stats_company ON translation_stats(company_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

CREATE TRIGGER trigger_update_company_lang_settings
  BEFORE UPDATE ON company_language_settings
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

CREATE TRIGGER trigger_update_user_lang_prefs
  BEFORE UPDATE ON user_language_preferences
  FOR EACH ROW EXECUTE FUNCTION update_permission_timestamp();

-- Actualizar estadísticas al crear/actualizar traducción
CREATE OR REPLACE FUNCTION update_translation_stats()
RETURNS TRIGGER AS $$
DECLARE
  v_company_id BIGINT;
  v_language_code VARCHAR(10);
BEGIN
  -- Obtener company_id y language_code
  SELECT tc.company_id, NEW.language_code
  INTO v_company_id, v_language_code
  FROM translatable_content tc
  WHERE tc.id = NEW.translatable_content_id;

  -- Actualizar estadísticas
  INSERT INTO translation_stats (company_id, language_code, translated_strings, last_updated_at)
  VALUES (v_company_id, v_language_code, 1, CURRENT_TIMESTAMP)
  ON CONFLICT (company_id, language_code) DO UPDATE SET
    translated_strings = (
      SELECT COUNT(*) FROM content_translations ct
      INNER JOIN translatable_content tc ON tc.id = ct.translatable_content_id
      WHERE tc.company_id = v_company_id AND ct.language_code = v_language_code
    ),
    verified_strings = (
      SELECT COUNT(*) FROM content_translations ct
      INNER JOIN translatable_content tc ON tc.id = ct.translatable_content_id
      WHERE tc.company_id = v_company_id AND ct.language_code = v_language_code AND ct.is_approved = TRUE
    ),
    auto_translated_strings = (
      SELECT COUNT(*) FROM content_translations ct
      INNER JOIN translatable_content tc ON tc.id = ct.translatable_content_id
      WHERE tc.company_id = v_company_id AND ct.language_code = v_language_code AND ct.translation_method LIKE 'ai%'
    ),
    completion_percentage = (
      (SELECT COUNT(*) FROM content_translations ct
       INNER JOIN translatable_content tc ON tc.id = ct.translatable_content_id
       WHERE tc.company_id = v_company_id AND ct.language_code = v_language_code)::DECIMAL /
      NULLIF((SELECT COUNT(*) FROM translatable_content WHERE company_id = v_company_id), 0) * 100
    ),
    last_updated_at = CURRENT_TIMESTAMP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_translation_stats
  AFTER INSERT OR UPDATE ON content_translations
  FOR EACH ROW EXECUTE FUNCTION update_translation_stats();

-- =====================================================
-- FUNCIONES
-- =====================================================

-- Función para obtener traducción
CREATE OR REPLACE FUNCTION get_translation(
  p_key VARCHAR,
  p_language_code VARCHAR DEFAULT 'en',
  p_fallback_language VARCHAR DEFAULT 'en',
  p_variables JSONB DEFAULT '{}'
) RETURNS TEXT AS $$
DECLARE
  v_translation TEXT;
  v_key VARCHAR;
  v_value TEXT;
BEGIN
  -- Buscar traducción en idioma solicitado
  SELECT translation_value INTO v_translation
  FROM ui_translations
  WHERE translation_key = p_key AND language_code = p_language_code;

  -- Si no existe, buscar en idioma fallback
  IF v_translation IS NULL THEN
    SELECT translation_value INTO v_translation
    FROM ui_translations
    WHERE translation_key = p_key AND language_code = p_fallback_language;
  END IF;

  -- Si aún no existe, devolver la key
  IF v_translation IS NULL THEN
    RETURN p_key;
  END IF;

  -- Reemplazar variables {{variable}}
  FOR v_key, v_value IN SELECT * FROM jsonb_each_text(p_variables) LOOP
    v_translation := REPLACE(v_translation, '{{' || v_key || '}}', v_value);
  END LOOP;

  RETURN v_translation;
END;
$$ LANGUAGE plpgsql;

-- Función para auto-traducir con IA
CREATE OR REPLACE FUNCTION auto_translate_content(
  p_translatable_content_id BIGINT,
  p_target_language VARCHAR
) RETURNS BIGINT AS $$
DECLARE
  v_content RECORD;
  v_translation_id BIGINT;
BEGIN
  -- Obtener contenido original
  SELECT * INTO v_content FROM translatable_content WHERE id = p_translatable_content_id;

  -- Aquí se integraría con servicio de traducción de IA (GPT-4, DeepL, etc.)
  -- Por ahora, creamos un placeholder
  INSERT INTO content_translations (
    translatable_content_id,
    language_code,
    translated_text,
    translation_method,
    is_approved
  ) VALUES (
    p_translatable_content_id,
    p_target_language,
    '[AI Translation Pending] ' || v_content.original_text,
    'ai_auto',
    FALSE
  )
  ON CONFLICT (translatable_content_id, language_code) DO NOTHING
  RETURNING id INTO v_translation_id;

  RETURN v_translation_id;
END;
$$ LANGUAGE plpgsql;

-- Función para obtener progreso de traducción
CREATE OR REPLACE FUNCTION get_translation_progress(p_company_id BIGINT)
RETURNS TABLE (
  language_code VARCHAR,
  language_name VARCHAR,
  total_strings INTEGER,
  translated_strings INTEGER,
  completion_percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    sl.language_code,
    sl.language_name,
    COALESCE(ts.total_strings, (SELECT COUNT(*) FROM translatable_content WHERE company_id = p_company_id)::INTEGER),
    COALESCE(ts.translated_strings, 0),
    COALESCE(ts.completion_percentage, 0.00)
  FROM supported_languages sl
  LEFT JOIN translation_stats ts ON ts.language_code = sl.language_code AND ts.company_id = p_company_id
  WHERE sl.is_active = TRUE
  ORDER BY sl.display_order;
END;
$$ LANGUAGE plpgsql;

COMMENT ON TABLE supported_languages IS 'Idiomas soportados por la plataforma';
COMMENT ON TABLE ui_translations IS 'Traducciones de interfaz de usuario';
COMMENT ON TABLE company_language_settings IS 'Configuración de idiomas por empresa';
COMMENT ON TABLE user_language_preferences IS 'Preferencias de idioma por usuario';
COMMENT ON TABLE translatable_content IS 'Contenido traducible (templates, mensajes rápidos)';
COMMENT ON TABLE content_translations IS 'Traducciones de contenido personalizado';
COMMENT ON TABLE translation_glossary IS 'Glosario de términos técnicos';
COMMENT ON TABLE translation_stats IS 'Estadísticas de progreso de traducción';
