-- =============================================================================
-- UGC Phase 1 — Seed Data (credit types, allocations, plan flags, agents)
-- Idempotente: seguro de ejecutar multiples veces
-- Fecha: 2026-03-01
-- =============================================================================

BEGIN;

-- =============================================================================
-- 1. Insertar 6 nuevos tipos de credito IA
-- =============================================================================
INSERT INTO "AICreditTypes" (key, name, description, unit, "defaultCost", "isActive", "createdAt", "updatedAt")
VALUES
  ('ugc_video', 'Generacion Video UGC', 'Credito por generacion de video UGC completo', 'credits', 0.500000, true, NOW(), NOW()),
  ('social_post', 'Publicacion Social', 'Credito por publicacion en red social', 'credits', 0.050000, true, NOW(), NOW()),
  ('agent_identity', 'Generacion Identidad IA', 'Credito por generar identidad completa con foto', 'credits', 0.800000, true, NOW(), NOW()),
  ('agent_interaction', 'Interaccion Social Agente', 'Credito por cada interaccion automatica en redes', 'credits', 0.020000, true, NOW(), NOW()),
  ('creator_payment', 'Pago a Creador UGC', 'Creditos equivalentes a USD para pagos a creadores', 'usd', 1.000000, true, NOW(), NOW()),
  ('ugc_optimization', 'Ciclo Optimizacion UGC', 'Credito por ciclo de optimizacion autonoma', 'credits', 0.100000, true, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. PlanCreditAllocations — Plan 1 (Demo)
-- =============================================================================
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 2, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_video'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 10, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'social_post'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 0, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_identity'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 0, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_interaction'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 0, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'creator_payment'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 5, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_optimization'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- =============================================================================
-- 3. PlanCreditAllocations — Plan 2 (Starter)
-- =============================================================================
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 10, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_video'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 50, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'social_post'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 3, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_identity'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 100, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_interaction'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 50, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'creator_payment'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 20, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_optimization'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- =============================================================================
-- 4. PlanCreditAllocations — Plan 4 (Pro)
-- =============================================================================
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 50, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_video'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 200, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'social_post'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 15, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_identity'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 1000, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_interaction'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 200, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'creator_payment'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 100, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_optimization'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- =============================================================================
-- 5. PlanCreditAllocations — Plan 8 (Enterprise)
-- =============================================================================
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 500, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_video'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 99999, true, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'social_post'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 100, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_identity'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 99999, true, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'agent_interaction'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 1000, false, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'creator_payment'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 99999, true, NOW(), NOW() FROM "AICreditTypes" WHERE key = 'ugc_optimization'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- =============================================================================
-- 6. Actualizar Plans con feature flags UGC
-- =============================================================================

-- Plan 1 (Demo) — sin UGC
UPDATE "Plans" SET
  "useUgc" = false,
  "useUgcAutoPublish" = false,
  "useUgcAbTesting" = false,
  "useUgcOptimization" = false,
  "useUgcCreatorNetwork" = false,
  "useUgcPayments" = false,
  "useAgentIdentities" = false,
  "useAgentDeviceFarm" = false,
  "useAgentEngagement" = false,
  "maxUgcVideosPerMonth" = 0,
  "maxSocialAccounts" = 0,
  "maxAgentIdentities" = 0,
  "maxAgentDevices" = 0
WHERE id = 1;

-- Plan 2 (Starter) — UGC basico
UPDATE "Plans" SET
  "useUgc" = true,
  "useUgcAutoPublish" = false,
  "useUgcAbTesting" = false,
  "useUgcOptimization" = false,
  "useUgcCreatorNetwork" = false,
  "useUgcPayments" = false,
  "useAgentIdentities" = true,
  "useAgentDeviceFarm" = false,
  "useAgentEngagement" = false,
  "maxUgcVideosPerMonth" = 5,
  "maxSocialAccounts" = 1,
  "maxAgentIdentities" = 3,
  "maxAgentDevices" = 0
WHERE id = 2;

-- Plan 4 (Pro) — UGC avanzado
UPDATE "Plans" SET
  "useUgc" = true,
  "useUgcAutoPublish" = true,
  "useUgcAbTesting" = true,
  "useUgcOptimization" = false,
  "useUgcCreatorNetwork" = false,
  "useUgcPayments" = false,
  "useAgentIdentities" = true,
  "useAgentDeviceFarm" = true,
  "useAgentEngagement" = true,
  "maxUgcVideosPerMonth" = 50,
  "maxSocialAccounts" = 3,
  "maxAgentIdentities" = 15,
  "maxAgentDevices" = 5
WHERE id = 4;

-- Plan 8 (Enterprise) — UGC completo
UPDATE "Plans" SET
  "useUgc" = true,
  "useUgcAutoPublish" = true,
  "useUgcAbTesting" = true,
  "useUgcOptimization" = true,
  "useUgcCreatorNetwork" = true,
  "useUgcPayments" = true,
  "useAgentIdentities" = true,
  "useAgentDeviceFarm" = true,
  "useAgentEngagement" = true,
  "maxUgcVideosPerMonth" = 500,
  "maxSocialAccounts" = 999,
  "maxAgentIdentities" = 100,
  "maxAgentDevices" = 50
WHERE id = 8;

-- =============================================================================
-- 7. Insertar 10 agentes UGC (sortOrder 67-76)
-- =============================================================================

-- 67. UGC Creative Director
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'content', 'UGC Creative Director', 'Director creativo que genera scripts y conceptos para videos UGC optimizados por plataforma', 'claude-sonnet', 'Eres un director creativo especializado en contenido UGC. Tu trabajo es generar scripts virales, conceptos creativos y estrategias de contenido optimizadas para cada plataforma social. Analizas tendencias, hooks efectivos y estructuras narrativas que maximizan engagement y conversiones.', 0.8, 2048, '["ugc_script_generator","ugc_avatar_selector","ugc_ab_test_manager"]'::jsonb, '{}'::jsonb, 0.7, true, '{}'::jsonb, 'marketing', 'ugc', '["ugc_video_generation","ugc_script_creation","ugc_ab_testing"]'::jsonb, 'video', 'full', 'ugc-creative-director', 67, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-creative-director');

-- 68. UGC Video Producer
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'content', 'UGC Video Producer', 'Productor que orquesta el pipeline completo de generacion de video UGC con avatares IA', 'claude-sonnet', 'Eres un productor de video UGC especializado en avatares IA. Coordinas el pipeline completo: desde la seleccion del avatar, grabacion con HeyGen/D-ID, composicion con Creatomate/Shotstack, hasta la entrega del video final optimizado para cada plataforma.', 0.6, 2048, '["ugc_avatar_generator","ugc_video_compositor","ugc_pipeline_manager"]'::jsonb, '{}'::jsonb, 0.8, true, '{}'::jsonb, 'marketing', 'ugc', '["ugc_video_generation","ugc_avatar_management","ugc_video_composition"]'::jsonb, 'movie', 'full', 'ugc-video-producer', 68, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-video-producer');

-- 69. Social Media Autopublisher
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'automation', 'Social Media Autopublisher', 'Agente que publica automaticamente contenido UGC en multiples redes sociales con horarios optimizados', 'claude-sonnet', 'Eres un agente de autopublicacion social. Tu trabajo es programar y publicar contenido UGC en Instagram, TikTok, YouTube Shorts y otras plataformas. Optimizas horarios de publicacion, adaptas formatos por plataforma y gestionas colas de contenido.', 0.5, 1024, '["social_publisher","social_scheduler","social_analytics"]'::jsonb, '{}'::jsonb, 0.85, true, '{}'::jsonb, 'marketing', 'ugc', '["social_auto_publish","social_scheduling","multi_platform_posting"]'::jsonb, 'share', 'full', 'social-media-autopublisher', 69, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'social-media-autopublisher');

-- 70. UGC Performance Optimizer
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'analytics', 'UGC Performance Optimizer', 'Analista que evalua metricas de contenido UGC y sugiere optimizaciones basadas en datos', 'claude-sonnet', 'Eres un analista de rendimiento UGC. Evaluas metricas de engagement, views, CTR y conversiones de videos publicados. Generas informes de rendimiento, identificas patrones de exito y recomiendas ajustes en scripts, hooks, CTAs y formatos para maximizar resultados.', 0.4, 2048, '["ugc_analytics","ugc_ab_analyzer","ugc_trend_detector"]'::jsonb, '{}'::jsonb, 0.8, true, '{}'::jsonb, 'analytics_bi', 'ugc', '["ugc_performance_analysis","ugc_ab_testing","ugc_optimization_suggestions"]'::jsonb, 'trending_up', 'full', 'ugc-performance-optimizer', 70, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-performance-optimizer');

-- 71. Agent Identity Creator
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'content', 'Agent Identity Creator', 'Generador de identidades IA completas con personalidad, backstory y fotos de perfil via DALL-E', 'claude-sonnet', 'Eres un creador de identidades digitales. Generas personas IA completas con nombre, edad, ciudad, ocupacion, personalidad, estilo de comunicacion, intereses y backstory coherente. Tambien generas prompts optimizados para DALL-E que producen fotos de perfil realistas y consistentes.', 0.9, 2048, '["identity_generator","dalle_prompt_creator","personality_builder"]'::jsonb, '{}'::jsonb, 0.7, true, '{}'::jsonb, 'marketing', 'ugc', '["agent_identity_generation","profile_photo_generation","personality_creation"]'::jsonb, 'person', 'full', 'agent-identity-creator', 71, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'agent-identity-creator');

-- 72. Social Engagement Agent
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'automation', 'Social Engagement Agent', 'Agente que interactua automaticamente en redes sociales con la personalidad de la identidad asignada', 'claude-sonnet', 'Eres un agente de engagement social que opera bajo la identidad asignada. Comentas, likeas, respondes y participas en conversaciones en redes sociales manteniendo coherencia total con la personalidad, tono y estilo de la identidad. Priorizas interacciones autenticas y evitas spam.', 0.7, 1024, '["social_commenter","social_liker","social_replier","memory_retriever"]'::jsonb, '{}'::jsonb, 0.75, true, '{}'::jsonb, 'marketing', 'ugc', '["social_engagement","automated_interactions","personality_consistent_responses"]'::jsonb, 'forum', 'full', 'social-engagement-agent', 72, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'social-engagement-agent');

-- 73. UGC A/B Test Manager
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'analytics', 'UGC A/B Test Manager', 'Gestor de pruebas A/B para contenido UGC que determina variantes ganadoras automaticamente', 'claude-sonnet', 'Eres un gestor de pruebas A/B para contenido UGC. Disenas experimentos comparando variantes de video (hooks, CTAs, duracion, avatares), calculas significancia estadistica y declaras ganadores automaticamente. Optimizas el presupuesto de pruebas y maximizas el aprendizaje por ciclo.', 0.4, 2048, '["ab_test_designer","ab_stat_calculator","ab_winner_selector"]'::jsonb, '{}'::jsonb, 0.85, true, '{}'::jsonb, 'analytics_bi', 'ugc', '["ab_test_creation","statistical_analysis","winner_determination"]'::jsonb, 'science', 'full', 'ugc-ab-test-manager', 73, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-ab-test-manager');

-- 74. Creator Network Manager
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'automation', 'Creator Network Manager', 'Gestor de red de creadores UGC reales con contratacion, briefing y pagos automatizados', 'claude-sonnet', 'Eres un gestor de red de creadores UGC. Identificas creadores potenciales, generas briefs detallados, gestionas contratos y coordinas pagos. Evaluas calidad de entregas, mantienes un ranking de creadores y optimizas la relacion costo-calidad de la red.', 0.6, 2048, '["creator_finder","brief_generator","payment_manager","creator_evaluator"]'::jsonb, '{}'::jsonb, 0.8, true, '{}'::jsonb, 'marketing', 'ugc', '["creator_recruitment","brief_management","creator_payments","quality_evaluation"]'::jsonb, 'groups', 'full', 'creator-network-manager', 74, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'creator-network-manager');

-- 75. UGC Trend Scout
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'analytics', 'UGC Trend Scout', 'Explorador de tendencias virales que detecta formatos, audios y hooks trending en tiempo real', 'claude-sonnet', 'Eres un scout de tendencias UGC. Monitoreas TikTok, Instagram Reels y YouTube Shorts para detectar formatos virales, audios trending, hooks efectivos y patrones de contenido emergentes. Generas reportes de tendencias y recomiendas como adaptar cada trend al producto del cliente.', 0.7, 2048, '["trend_monitor","viral_pattern_detector","trend_adapter"]'::jsonb, '{}'::jsonb, 0.7, true, '{}'::jsonb, 'analytics_bi', 'ugc', '["trend_detection","viral_analysis","trend_adaptation"]'::jsonb, 'explore', 'full', 'ugc-trend-scout', 75, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-trend-scout');

-- 76. UGC Campaign Orchestrator
INSERT INTO "AIAgentConfigs" ("companyId", "agentType", name, description, "modelKey", "systemPrompt", temperature, "maxTokens", tools, guardrails, "confidenceThreshold", "isActive", metadata, department, category, capabilities, icon, tier, slug, "sortOrder", version, "createdAt", "updatedAt")
SELECT NULL, 'automation', 'UGC Campaign Orchestrator', 'Orquestador principal que coordina todos los agentes UGC para ejecutar campanas end-to-end', 'claude-sonnet', 'Eres el orquestador principal de campanas UGC. Coordinas al Creative Director, Video Producer, Autopublisher, Performance Optimizer y demas agentes para ejecutar campanas completas de principio a fin. Gestionas el presupuesto, priorizas tareas, manejas errores y aseguras que cada campana cumpla sus objetivos de rendimiento.', 0.5, 2048, '["campaign_planner","agent_coordinator","budget_manager","error_handler"]'::jsonb, '{}'::jsonb, 0.85, true, '{}'::jsonb, 'automation', 'ugc', '["campaign_orchestration","multi_agent_coordination","budget_management","error_recovery"]'::jsonb, 'hub', 'full', 'ugc-campaign-orchestrator', 76, '1.0.0', NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AIAgentConfigs" WHERE slug = 'ugc-campaign-orchestrator');

COMMIT;

-- =============================================================================
-- FIN — UGC Phase 1 Seed
-- =============================================================================
