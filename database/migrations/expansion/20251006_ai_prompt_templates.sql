-- =====================================================
-- MIGRATION: Sistema de Templates de IA para Prompts
-- Fecha: 6 de octubre de 2025
-- Fase: 6 - Expansión
-- =====================================================

-- 1. Tabla de Categorías de Templates
CREATE TABLE IF NOT EXISTS ai_template_categories (
  id BIGSERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  display_name VARCHAR(255) NOT NULL,
  description TEXT,
  icon VARCHAR(50),
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. Tabla de Templates de IA
CREATE TABLE IF NOT EXISTS ai_prompt_templates (
  id BIGSERIAL PRIMARY KEY,
  company_id BIGINT REFERENCES companies(id) ON DELETE CASCADE, -- NULL = template global
  category_id BIGINT NOT NULL REFERENCES ai_template_categories(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  prompt_template TEXT NOT NULL,
  variables JSONB DEFAULT '[]', -- [{name: "customer_name", type: "string", required: true}]
  model_provider VARCHAR(50) DEFAULT 'openai', -- openai, gemini, deepseek
  model_name VARCHAR(100) DEFAULT 'gpt-4',
  temperature DECIMAL(3,2) DEFAULT 0.7,
  max_tokens INTEGER DEFAULT 500,
  system_message TEXT,
  example_input JSONB, -- Ejemplo de entrada
  example_output TEXT, -- Ejemplo de salida esperada
  use_count INTEGER DEFAULT 0,
  avg_rating DECIMAL(3,2),
  is_public BOOLEAN DEFAULT FALSE, -- Si otros pueden usar este template
  is_active BOOLEAN DEFAULT TRUE,
  created_by BIGINT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(company_id, name)
);

-- 3. Tabla de Ejecuciones de Templates
CREATE TABLE IF NOT EXISTS ai_template_executions (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES ai_prompt_templates(id) ON DELETE CASCADE,
  company_id BIGINT NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  user_id BIGINT REFERENCES users(id) ON DELETE SET NULL,
  input_variables JSONB NOT NULL,
  final_prompt TEXT NOT NULL,
  response_text TEXT,
  tokens_used INTEGER,
  execution_time_ms INTEGER,
  status VARCHAR(50) DEFAULT 'pending', -- pending, completed, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 4. Tabla de Ratings de Templates
CREATE TABLE IF NOT EXISTS ai_template_ratings (
  id BIGSERIAL PRIMARY KEY,
  template_id BIGINT NOT NULL REFERENCES ai_prompt_templates(id) ON DELETE CASCADE,
  user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  rating INTEGER CHECK (rating >= 1 AND rating <= 5),
  feedback TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(template_id, user_id)
);

-- =====================================================
-- SEED DATA: Categorías de Templates
-- =====================================================

INSERT INTO ai_template_categories (name, display_name, description, icon, display_order) VALUES
('customer_service', 'Atención al Cliente', 'Templates para respuestas de soporte', 'support', 1),
('marketing', 'Marketing', 'Templates para campañas y contenido marketing', 'campaign', 2),
('email_generation', 'Generación de Emails', 'Templates para emails personalizados', 'email', 3),
('content_creation', 'Creación de Contenido', 'Templates para blogs, posts, artículos', 'edit', 4),
('data_analysis', 'Análisis de Datos', 'Templates para análisis y reportes', 'analytics', 5),
('translation', 'Traducción', 'Templates para traducción multiidioma', 'translate', 6),
('summarization', 'Resumen', 'Templates para resumir textos largos', 'summarize', 7),
('sentiment_analysis', 'Análisis de Sentimiento', 'Templates para analizar emociones', 'sentiment', 8);

-- =====================================================
-- SEED DATA: Templates Globales de IA
-- =====================================================

-- Customer Service Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'customer_service'),
  'Respuesta Empática a Queja',
  'Genera una respuesta empática y profesional a una queja de cliente',
  'El cliente {{customer_name}} ha presentado la siguiente queja: "{{complaint_text}}".

Por favor genera una respuesta que:
- Muestre empatía y comprensión
- Reconozca el problema
- Ofrezca una solución concreta
- Mantenga un tono profesional pero cercano
- No supere 150 palabras',
  '[
    {"name": "customer_name", "type": "string", "required": true, "description": "Nombre del cliente"},
    {"name": "complaint_text", "type": "text", "required": true, "description": "Texto de la queja"}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.7,
  300,
  'Eres un agente de atención al cliente experto en resolver quejas con empatía y profesionalismo.',
  '{"customer_name": "Juan Pérez", "complaint_text": "El producto llegó dañado y nadie me responde"}'::jsonb
),
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'customer_service'),
  'FAQ - Respuesta Automática',
  'Genera respuesta basada en FAQ existente',
  'Pregunta del cliente: {{customer_question}}

Basándote en nuestra base de conocimiento, proporciona una respuesta clara, concisa y útil. Si la pregunta no está en tu conocimiento, indícalo cortésmente y ofrece contactar con un agente.',
  '[
    {"name": "customer_question", "type": "text", "required": true, "description": "Pregunta del cliente"}
  ]'::jsonb,
  'openai',
  'gpt-3.5-turbo',
  0.5,
  200,
  'Eres un asistente virtual que ayuda a clientes con preguntas frecuentes. Sé preciso y útil.',
  '{"customer_question": "¿Cuál es el tiempo de entrega?"}'::jsonb
);

-- Marketing Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'marketing'),
  'Generador de Subject Lines',
  'Crea 5 subject lines llamativos para email marketing',
  'Producto/Servicio: {{product_name}}
Oferta/Promoción: {{offer_description}}
Público objetivo: {{target_audience}}

Genera 5 subject lines de email marketing que:
- Sean llamativos y generen curiosidad
- Tengan máximo 50 caracteres
- Usen emojis estratégicamente (1-2 por línea)
- Incluyan urgencia o valor
- Sean adecuados para {{target_audience}}',
  '[
    {"name": "product_name", "type": "string", "required": true},
    {"name": "offer_description", "type": "text", "required": true},
    {"name": "target_audience", "type": "string", "required": true}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.9,
  300,
  'Eres un experto en copywriting y email marketing. Tus subject lines tienen tasas de apertura superiores al 40%.',
  '{"product_name": "Curso de IA", "offer_description": "50% descuento por 48 horas", "target_audience": "emprendedores tech"}'::jsonb
),
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'marketing'),
  'Post para Redes Sociales',
  'Genera contenido optimizado para redes sociales',
  'Tema: {{topic}}
Plataforma: {{platform}}
Tono: {{tone}}
Objetivo: {{goal}}

Crea un post para {{platform}} que:
- Sea atractivo y genere engagement
- Use el tono {{tone}}
- Incluya hashtags relevantes
- Tenga call-to-action claro
- Se adapte a la longitud óptima de {{platform}}',
  '[
    {"name": "topic", "type": "string", "required": true},
    {"name": "platform", "type": "select", "options": ["Instagram", "LinkedIn", "Twitter", "Facebook"], "required": true},
    {"name": "tone", "type": "select", "options": ["profesional", "casual", "inspirador", "humorístico"], "required": true},
    {"name": "goal", "type": "string", "required": true}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.8,
  500,
  'Eres un social media manager experto que crea contenido viral y efectivo.',
  '{"topic": "Productividad con IA", "platform": "LinkedIn", "tone": "profesional", "goal": "generar leads"}'::jsonb
);

-- Email Generation Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'email_generation'),
  'Email de Bienvenida Personalizado',
  'Genera email de bienvenida para nuevos clientes',
  'Cliente: {{customer_name}}
Producto adquirido: {{product_name}}
Información adicional: {{additional_info}}

Crea un email de bienvenida que:
- Sea cálido y personalizado
- Explique los próximos pasos
- Incluya recursos útiles
- Tenga un tono amigable pero profesional
- Máximo 200 palabras',
  '[
    {"name": "customer_name", "type": "string", "required": true},
    {"name": "product_name", "type": "string", "required": true},
    {"name": "additional_info", "type": "text", "required": false}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.7,
  400,
  'Eres un especialista en customer onboarding que crea emails de bienvenida efectivos.',
  '{"customer_name": "María González", "product_name": "Plan Premium", "additional_info": "Interesada en automatización"}'::jsonb
);

-- Content Creation Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'content_creation'),
  'Artículo de Blog SEO',
  'Genera artículo optimizado para SEO',
  'Keyword principal: {{main_keyword}}
Keywords secundarias: {{secondary_keywords}}
Longitud: {{word_count}} palabras
Tono: {{tone}}

Crea un artículo de blog que:
- Esté optimizado para SEO
- Use {{main_keyword}} naturalmente 5-7 veces
- Incluya {{secondary_keywords}} estratégicamente
- Tenga estructura clara (intro, desarrollo, conclusión)
- Incluya subtítulos H2 y H3
- Sea informativo y valioso',
  '[
    {"name": "main_keyword", "type": "string", "required": true},
    {"name": "secondary_keywords", "type": "text", "required": true},
    {"name": "word_count", "type": "number", "required": true},
    {"name": "tone", "type": "select", "options": ["educativo", "conversacional", "técnico"], "required": true}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.7,
  2000,
  'Eres un redactor SEO experto que crea contenido que rankea en primeras posiciones de Google.',
  '{"main_keyword": "automatización con IA", "secondary_keywords": "chatbots, GPT-4, machine learning", "word_count": 800, "tone": "educativo"}'::jsonb
);

-- Data Analysis Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'data_analysis'),
  'Análisis de Métricas de Campaña',
  'Analiza resultados de campaña y genera insights',
  'Datos de la campaña:
- Nombre: {{campaign_name}}
- Emails enviados: {{emails_sent}}
- Tasa de apertura: {{open_rate}}%
- Tasa de clics: {{click_rate}}%
- Conversiones: {{conversions}}
- Revenue: ${{revenue}}

Analiza estos datos y proporciona:
1. Evaluación general del performance
2. Comparación con benchmarks de industria
3. 3 insights clave
4. 3 recomendaciones accionables para mejorar',
  '[
    {"name": "campaign_name", "type": "string", "required": true},
    {"name": "emails_sent", "type": "number", "required": true},
    {"name": "open_rate", "type": "number", "required": true},
    {"name": "click_rate", "type": "number", "required": true},
    {"name": "conversions", "type": "number", "required": true},
    {"name": "revenue", "type": "number", "required": true}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.3,
  800,
  'Eres un analista de marketing digital experto en interpretar métricas y generar insights accionables.',
  '{"campaign_name": "Promo Black Friday", "emails_sent": 10000, "open_rate": 25, "click_rate": 3.5, "conversions": 120, "revenue": 15000}'::jsonb
);

-- Translation Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'translation'),
  'Traducción Profesional Multiidioma',
  'Traduce texto manteniendo contexto y tono',
  'Idioma origen: {{source_language}}
Idioma destino: {{target_language}}
Tipo de texto: {{text_type}}
Tono: {{tone}}

Texto a traducir:
{{source_text}}

Por favor traduce manteniendo:
- El tono {{tone}} original
- Expresiones idiomáticas apropiadas para {{target_language}}
- Formato y estructura
- Contexto cultural',
  '[
    {"name": "source_language", "type": "string", "required": true},
    {"name": "target_language", "type": "string", "required": true},
    {"name": "text_type", "type": "select", "options": ["marketing", "técnico", "legal", "casual"], "required": true},
    {"name": "tone", "type": "string", "required": true},
    {"name": "source_text", "type": "text", "required": true}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.3,
  1000,
  'Eres un traductor profesional nativo que mantiene el contexto cultural y tono del mensaje original.',
  '{"source_language": "Español", "target_language": "Inglés", "text_type": "marketing", "tone": "entusiasta", "source_text": "¡Aprovecha nuestra oferta increíble!"}'::jsonb
);

-- Sentiment Analysis Templates
INSERT INTO ai_prompt_templates (
  company_id, category_id, name, description, prompt_template, variables,
  model_provider, model_name, temperature, max_tokens, system_message, example_input
) VALUES
(
  NULL,
  (SELECT id FROM ai_template_categories WHERE name = 'sentiment_analysis'),
  'Análisis de Sentimiento de Reviews',
  'Analiza sentimiento y extrae insights de reviews',
  'Review del cliente:
"{{review_text}}"

Analiza este review y proporciona:
1. Sentimiento general (Positivo/Neutral/Negativo con % de confianza)
2. Aspectos mencionados (producto, servicio, precio, etc.)
3. Sentimiento por aspecto
4. Palabras clave emocionales
5. Prioridad de respuesta (Alta/Media/Baja)
6. Sugerencia de respuesta (si es negativo)',
  '[
    {"name": "review_text", "type": "text", "required": true, "description": "Texto del review a analizar"}
  ]'::jsonb,
  'openai',
  'gpt-4',
  0.2,
  600,
  'Eres un experto en análisis de sentimiento que identifica emociones sutiles y proporciona insights accionables.',
  '{"review_text": "El producto es bueno pero el envío tardó demasiado. Esperaba mejor servicio."}'::jsonb
);

-- =====================================================
-- ÍNDICES
-- =====================================================

CREATE INDEX idx_ai_templates_category ON ai_prompt_templates(category_id);
CREATE INDEX idx_ai_templates_company ON ai_prompt_templates(company_id);
CREATE INDEX idx_ai_templates_public ON ai_prompt_templates(is_public, is_active);
CREATE INDEX idx_ai_executions_template ON ai_template_executions(template_id);
CREATE INDEX idx_ai_executions_company_date ON ai_template_executions(company_id, created_at);
CREATE INDEX idx_ai_ratings_template ON ai_template_ratings(template_id);

-- =====================================================
-- TRIGGERS
-- =====================================================

-- Actualizar contador de uso
CREATE OR REPLACE FUNCTION increment_template_usage()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_prompt_templates
  SET use_count = use_count + 1
  WHERE id = NEW.template_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_increment_template_usage
  AFTER INSERT ON ai_template_executions
  FOR EACH ROW EXECUTE FUNCTION increment_template_usage();

-- Actualizar rating promedio
CREATE OR REPLACE FUNCTION update_template_avg_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE ai_prompt_templates
  SET avg_rating = (
    SELECT AVG(rating)
    FROM ai_template_ratings
    WHERE template_id = COALESCE(NEW.template_id, OLD.template_id)
  )
  WHERE id = COALESCE(NEW.template_id, OLD.template_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_avg_rating_insert
  AFTER INSERT ON ai_template_ratings
  FOR EACH ROW EXECUTE FUNCTION update_template_avg_rating();

CREATE TRIGGER trigger_update_avg_rating_update
  AFTER UPDATE ON ai_template_ratings
  FOR EACH ROW EXECUTE FUNCTION update_template_avg_rating();

CREATE TRIGGER trigger_update_avg_rating_delete
  AFTER DELETE ON ai_template_ratings
  FOR EACH ROW EXECUTE FUNCTION update_template_avg_rating();

COMMENT ON TABLE ai_template_categories IS 'Categorías de templates de IA';
COMMENT ON TABLE ai_prompt_templates IS 'Templates de prompts reutilizables para IA';
COMMENT ON TABLE ai_template_executions IS 'Historial de ejecuciones de templates';
COMMENT ON TABLE ai_template_ratings IS 'Ratings y feedback de templates';
