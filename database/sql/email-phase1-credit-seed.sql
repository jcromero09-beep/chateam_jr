-- ============================================================================
-- EMAIL MARKETING PHASE 1 — Seed de Creditos de Email
-- ============================================================================
-- Inserta tipos de credito, asignaciones por plan y paquetes de compra.
-- SQL idempotente: usa ON CONFLICT DO NOTHING en todos los INSERTs.
--
-- Ejecutar con:
--   PGPASSWORD='...' psql -h localhost -U atendimento -d chateamjr -f email-phase1-credit-seed.sql
-- ============================================================================

-- ============================================================================
-- 1. TIPOS DE CREDITO DE EMAIL (AICreditTypes)
-- ============================================================================
-- Columnas: id, key, name, description, unit, defaultCost, isActive, createdAt, updatedAt
-- Constraint: key es UNIQUE

INSERT INTO "AICreditTypes" (key, name, description, unit, "defaultCost", "isActive", "createdAt", "updatedAt")
VALUES
  ('email_send', 'Envio de Email', 'Credito por cada email enviado via campana o individual', 'credits', 0.001000, true, NOW(), NOW()),
  ('email_campaign', 'Campana de Email', 'Credito por ejecucion de campana de email marketing', 'credits', 0.050000, true, NOW(), NOW()),
  ('email_verification', 'Verificacion de Email', 'Credito por verificacion/validacion de direccion de email', 'credits', 0.005000, true, NOW(), NOW())
ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- 2. ASIGNACIONES POR PLAN (PlanCreditAllocations)
-- ============================================================================
-- Columnas: id, planId, creditTypeId, creditsPerCycle, isUnlimited, createdAt, updatedAt
-- Constraint: UNIQUE (planId, creditTypeId)
-- Necesitamos el creditTypeId dinamico, usamos subquery.

-- -----------------------------------------------
-- Plan ID 1 (Demo)
-- -----------------------------------------------

-- Demo: email_send = 100
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 100.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_send'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Demo: email_campaign = 2
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 2.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_campaign'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Demo: email_verification = 0
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id, 0.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_verification'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- -----------------------------------------------
-- Plan ID 2 (Starter)
-- -----------------------------------------------

-- Starter: email_send = 5000
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 5000.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_send'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Starter: email_campaign = 20
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 20.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_campaign'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Starter: email_verification = 500
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id, 500.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_verification'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- -----------------------------------------------
-- Plan ID 4 (Pro)
-- -----------------------------------------------

-- Pro: email_send = 25000
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 25000.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_send'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Pro: email_campaign = 100
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 100.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_campaign'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Pro: email_verification = 5000
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id, 5000.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_verification'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- -----------------------------------------------
-- Plan ID 8 (Enterprise)
-- -----------------------------------------------

-- Enterprise: email_send = 200000
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 200000.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_send'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Enterprise: email_campaign = 999999 (unlimited)
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 999999.0000, true, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_campaign'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;

-- Enterprise: email_verification = 50000
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id, 50000.0000, false, NOW(), NOW()
FROM "AICreditTypes" WHERE key = 'email_verification'
ON CONFLICT ("planId", "creditTypeId") DO NOTHING;


-- ============================================================================
-- 3. PAQUETES DE COMPRA DE EMAILS (AiTokenPlans)
-- ============================================================================
-- Columnas: id, code, name, priceUsd, tokens, isRecurring, isActive, createdAt, updatedAt, planFeatures
-- Constraint: code es UNIQUE

INSERT INTO "AiTokenPlans" (code, name, "priceUsd", tokens, "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
VALUES
  (
    'email_pack_1000',
    'Pack 1.000 Emails',
    1.99,
    1000,
    false,
    true,
    '{"type": "email_pack", "creditTypeKey": "email_send", "description": "1.000 creditos de envio de email"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'email_pack_5000',
    'Pack 5.000 Emails',
    7.99,
    5000,
    false,
    true,
    '{"type": "email_pack", "creditTypeKey": "email_send", "description": "5.000 creditos de envio de email"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'email_pack_25000',
    'Pack 25.000 Emails',
    29.99,
    25000,
    false,
    true,
    '{"type": "email_pack", "creditTypeKey": "email_send", "description": "25.000 creditos de envio de email"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'email_pack_100000',
    'Pack 100.000 Emails',
    89.99,
    100000,
    false,
    true,
    '{"type": "email_pack", "creditTypeKey": "email_send", "description": "100.000 creditos de envio de email"}'::jsonb,
    NOW(),
    NOW()
  ),
  (
    'email_pack_500000',
    'Pack 500.000 Emails',
    349.99,
    500000,
    false,
    true,
    '{"type": "email_pack", "creditTypeKey": "email_send", "description": "500.000 creditos de envio de email"}'::jsonb,
    NOW(),
    NOW()
  )
ON CONFLICT (code) DO NOTHING;


-- ============================================================================
-- 4. VERIFICACION
-- ============================================================================

-- Verificar tipos de credito insertados
SELECT id, key, name, "defaultCost", "isActive"
FROM "AICreditTypes"
WHERE key IN ('email_send', 'email_campaign', 'email_verification')
ORDER BY id;

-- Verificar asignaciones por plan
SELECT
  pca.id,
  p.name AS plan_name,
  act.key AS credit_type,
  pca."creditsPerCycle",
  pca."isUnlimited"
FROM "PlanCreditAllocations" pca
JOIN "Plans" p ON p.id = pca."planId"
JOIN "AICreditTypes" act ON act.id = pca."creditTypeId"
WHERE act.key IN ('email_send', 'email_campaign', 'email_verification')
ORDER BY pca."planId", act.key;

-- Verificar paquetes de compra
SELECT id, code, name, "priceUsd", tokens, "isActive"
FROM "AiTokenPlans"
WHERE code LIKE 'email_pack_%'
ORDER BY tokens;
