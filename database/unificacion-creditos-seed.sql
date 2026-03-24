-- ============================================================================
-- SEED: Unificacion Integral de Suscripciones y Creditos IA
-- Fecha: 2026-02-28
-- Descripcion: Conecta Plans (Gen1) con AICreditTypes (Gen3) via
--              PlanCreditAllocations. Inicializa balances para 7 companies.
--              Pobla AiTokenPlans con 5 packs de compra adicional.
-- IDEMPOTENTE: Todo con WHERE NOT EXISTS / WHERE condicion.
-- BD SAGRADA: Solo INSERTs y UPDATEs, nunca DELETEs.
-- ============================================================================

BEGIN;

-- ============================================================================
-- PARTE A: Actualizar Plans con limites IA reales
-- Plans IDs: 1 (Demo), 2 (Starter), 4 (Pro), 8 (Enterprise)
-- Solo actualiza si aiCreditsPerCycle = 0 (no re-ejecutar)
-- ============================================================================

-- Plan id=1: Plan Ilimitado ($0) → Demo/Gratuito
UPDATE "Plans" SET
  "aiTokenQuota" = 100,
  "aiCreditsPerCycle" = 100,
  "maxAgents" = 1,
  "maxImageGenerations" = 5,
  "maxVideoGenerations" = 0,
  "excessTokenPrice" = 0.000000
WHERE id = 1 AND "aiCreditsPerCycle" = 0;

-- Plan id=2: plan prueba ($19.99) → Starter
UPDATE "Plans" SET
  "aiTokenQuota" = 500,
  "aiCreditsPerCycle" = 500,
  "maxAgents" = 3,
  "maxImageGenerations" = 10,
  "maxVideoGenerations" = 1,
  "excessTokenPrice" = 0.020000
WHERE id = 2 AND "aiCreditsPerCycle" = 0;

-- Plan id=4: paypall ($20) → Pro
UPDATE "Plans" SET
  "aiTokenQuota" = 2000,
  "aiCreditsPerCycle" = 2000,
  "maxAgents" = 5,
  "maxImageGenerations" = 25,
  "maxVideoGenerations" = 3,
  "excessTokenPrice" = 0.015000
WHERE id = 4 AND "aiCreditsPerCycle" = 0;

-- Plan id=8: plan stripe ($12234) → Enterprise
UPDATE "Plans" SET
  "aiTokenQuota" = 50000,
  "aiCreditsPerCycle" = 50000,
  "maxAgents" = 10,
  "maxImageGenerations" = 100,
  "maxVideoGenerations" = 10,
  "excessTokenPrice" = 0.010000
WHERE id = 8 AND "aiCreditsPerCycle" = 0;

-- ============================================================================
-- PARTE B: Poblar PlanCreditAllocations (4 planes x 11 tipos = 44 filas)
-- Distribucion de creditos por tipo para cada plan
-- ============================================================================

-- ---- PLAN 1: Demo ($0) — 100 creditos totales ----
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 1, id,
  CASE key
    WHEN 'message'         THEN 50
    WHEN 'image'           THEN 5
    WHEN 'video'           THEN 0
    WHEN 'audio_minute'    THEN 5
    WHEN 'tts_character'   THEN 5000
    WHEN 'rag_query'       THEN 10
    WHEN 'embedding_token' THEN 10000
    WHEN 'agent_execution' THEN 5
    WHEN 'kb_document'     THEN 2
    WHEN 'vision_analysis' THEN 5
    WHEN 'pdf_processing'  THEN 3
    ELSE 0
  END,
  false, NOW(), NOW()
FROM "AICreditTypes" WHERE "isActive" = true
AND NOT EXISTS (
  SELECT 1 FROM "PlanCreditAllocations"
  WHERE "planId" = 1 AND "creditTypeId" = "AICreditTypes".id
);

-- ---- PLAN 2: Starter ($19.99) — 500 creditos totales ----
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 2, id,
  CASE key
    WHEN 'message'         THEN 500
    WHEN 'image'           THEN 10
    WHEN 'video'           THEN 1
    WHEN 'audio_minute'    THEN 15
    WHEN 'tts_character'   THEN 20000
    WHEN 'rag_query'       THEN 50
    WHEN 'embedding_token' THEN 50000
    WHEN 'agent_execution' THEN 20
    WHEN 'kb_document'     THEN 5
    WHEN 'vision_analysis' THEN 15
    WHEN 'pdf_processing'  THEN 10
    ELSE 0
  END,
  false, NOW(), NOW()
FROM "AICreditTypes" WHERE "isActive" = true
AND NOT EXISTS (
  SELECT 1 FROM "PlanCreditAllocations"
  WHERE "planId" = 2 AND "creditTypeId" = "AICreditTypes".id
);

-- ---- PLAN 4: Pro ($20) — 2000 creditos totales ----
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 4, id,
  CASE key
    WHEN 'message'         THEN 2000
    WHEN 'image'           THEN 25
    WHEN 'video'           THEN 3
    WHEN 'audio_minute'    THEN 60
    WHEN 'tts_character'   THEN 100000
    WHEN 'rag_query'       THEN 200
    WHEN 'embedding_token' THEN 200000
    WHEN 'agent_execution' THEN 50
    WHEN 'kb_document'     THEN 20
    WHEN 'vision_analysis' THEN 50
    WHEN 'pdf_processing'  THEN 30
    ELSE 0
  END,
  false, NOW(), NOW()
FROM "AICreditTypes" WHERE "isActive" = true
AND NOT EXISTS (
  SELECT 1 FROM "PlanCreditAllocations"
  WHERE "planId" = 4 AND "creditTypeId" = "AICreditTypes".id
);

-- ---- PLAN 8: Enterprise ($12234) — 50000 creditos totales ----
INSERT INTO "PlanCreditAllocations" ("planId", "creditTypeId", "creditsPerCycle", "isUnlimited", "createdAt", "updatedAt")
SELECT 8, id,
  CASE key
    WHEN 'message'         THEN 50000
    WHEN 'image'           THEN 100
    WHEN 'video'           THEN 10
    WHEN 'audio_minute'    THEN 300
    WHEN 'tts_character'   THEN 500000
    WHEN 'rag_query'       THEN 1000
    WHEN 'embedding_token' THEN 1000000
    WHEN 'agent_execution' THEN 200
    WHEN 'kb_document'     THEN 100
    WHEN 'vision_analysis' THEN 200
    WHEN 'pdf_processing'  THEN 100
    ELSE 0
  END,
  false, NOW(), NOW()
FROM "AICreditTypes" WHERE "isActive" = true
AND NOT EXISTS (
  SELECT 1 FROM "PlanCreditAllocations"
  WHERE "planId" = 8 AND "creditTypeId" = "AICreditTypes".id
);

-- ============================================================================
-- PARTE C: Inicializar AICreditBalances para las 7 companies activas
-- Cada company recibe creditos segun su plan via PlanCreditAllocations
-- Company 6 (Smarttrack): +24970 tokens legacy al tipo 'message'
-- ============================================================================

-- Funcion auxiliar: insertar balances para una company segun su plan
-- Company 1 (Demo Company, planId=1)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 1, pca."creditTypeId", pca."creditsPerCycle", 0, NULL, NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 1)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 1 AND "creditTypeId" = pca."creditTypeId"
);

-- Company 4 (prueba, planId=2)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 4, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 4),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 4)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 4 AND "creditTypeId" = pca."creditTypeId"
);

-- Company 6 (Smarttrack, planId=8)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 6, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 6),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 6)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 6 AND "creditTypeId" = pca."creditTypeId"
);

-- Smarttrack: sumar 24970 tokens legacy al tipo 'message'
UPDATE "AICreditBalances"
SET "totalCredits" = "totalCredits" + 24970
WHERE "companyId" = 6
AND "creditTypeId" = (SELECT id FROM "AICreditTypes" WHERE key = 'message')
AND "totalCredits" < 25000;  -- Solo si no se ha sumado ya

-- Company 7 (Jc ROMERO, planId=1)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 7, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 7),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 7)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 7 AND "creditTypeId" = pca."creditTypeId"
);

-- Company 8 (chateam, planId=1)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 8, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 8),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 8)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 8 AND "creditTypeId" = pca."creditTypeId"
);

-- Company 9 (Levelix, planId=1)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 9, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 9),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 9)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 9 AND "creditTypeId" = pca."creditTypeId"
);

-- Company 10 (Estetica dolcevita, planId=1)
INSERT INTO "AICreditBalances" ("companyId", "creditTypeId", "totalCredits", "usedCredits", "resetAt", "createdAt", "updatedAt")
SELECT 10, pca."creditTypeId", pca."creditsPerCycle", 0,
  (SELECT "dueDate"::timestamp FROM "Companies" WHERE id = 10),
  NOW(), NOW()
FROM "PlanCreditAllocations" pca
WHERE pca."planId" = (SELECT "planId" FROM "Companies" WHERE id = 10)
AND NOT EXISTS (
  SELECT 1 FROM "AICreditBalances"
  WHERE "companyId" = 10 AND "creditTypeId" = pca."creditTypeId"
);

-- ============================================================================
-- PARTE D: Poblar AiTokenPlans con 5 packs de compra adicional
-- Columnas disponibles: code, name, priceUsd, tokens, isRecurring, isActive,
--   planFeatures, planAiTools, createdAt, updatedAt
-- ============================================================================

INSERT INTO "AiTokenPlans" ("code", "name", "priceUsd", "tokens", "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
SELECT 'pack_500', 'Pack 500 Creditos', 4.99, 500, false, true,
  '[{"feature":"500 mensajes IA"},{"feature":"5 imagenes"},{"feature":"10 consultas RAG"}]'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AiTokenPlans" WHERE code = 'pack_500');

INSERT INTO "AiTokenPlans" ("code", "name", "priceUsd", "tokens", "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
SELECT 'pack_2000', 'Pack 2000 Creditos', 14.99, 2000, false, true,
  '[{"feature":"2000 mensajes IA"},{"feature":"15 imagenes"},{"feature":"50 consultas RAG"}]'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AiTokenPlans" WHERE code = 'pack_2000');

INSERT INTO "AiTokenPlans" ("code", "name", "priceUsd", "tokens", "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
SELECT 'pack_5000', 'Pack 5000 Creditos', 29.99, 5000, false, true,
  '[{"feature":"5000 mensajes IA"},{"feature":"30 imagenes"},{"feature":"100 consultas RAG"}]'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AiTokenPlans" WHERE code = 'pack_5000');

INSERT INTO "AiTokenPlans" ("code", "name", "priceUsd", "tokens", "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
SELECT 'pack_20000', 'Pack 20000 Creditos', 79.99, 20000, false, true,
  '[{"feature":"20000 mensajes IA"},{"feature":"80 imagenes"},{"feature":"300 consultas RAG"}]'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AiTokenPlans" WHERE code = 'pack_20000');

INSERT INTO "AiTokenPlans" ("code", "name", "priceUsd", "tokens", "isRecurring", "isActive", "planFeatures", "createdAt", "updatedAt")
SELECT 'pack_50000', 'Pack 50000 Creditos', 149.99, 50000, false, true,
  '[{"feature":"50000 mensajes IA"},{"feature":"150 imagenes"},{"feature":"500 consultas RAG"}]'::jsonb, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM "AiTokenPlans" WHERE code = 'pack_50000');

COMMIT;

-- ============================================================================
-- RESUMEN:
-- A) 4 Plans actualizados con limites IA reales
-- B) 44 PlanCreditAllocations (4 planes x 11 tipos)
-- C) 77 AICreditBalances (7 companies x 11 tipos) + 24970 legacy Smarttrack
-- D) 5 AiTokenPlans (packs de compra adicional)
-- ============================================================================
