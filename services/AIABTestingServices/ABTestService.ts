import AIABTest from "../../models/AIABTest";
import AIABTestVariant from "../../models/AIABTestVariant";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// ---------------------------------------------------------------------------
// Tipos
// ---------------------------------------------------------------------------

interface CreateTestData {
  name: string;
  description?: string;
  testType: "prompt" | "model" | "temperature" | "system_message" | "rag_config" | "classifier_prompt";
  agentType?: string;
  primaryMetric?: "resolution_rate" | "csat" | "latency" | "cost" | "escalation_rate" | "engagement";
  minSampleSize?: number;
  confidenceLevel?: number;
  variants: Array<{
    name: string;
    isControl?: boolean;
    config: Record<string, unknown>;
  }>;
}

interface RecordResultData {
  converted?: boolean;
  latencyMs?: number;
  costUsd?: number;
  csat?: number;
  escalated?: boolean;
  resolved?: boolean;
  tokensUsed?: number;
}

interface ActiveVariantResult {
  testId: number;
  variantId: number;
  config: Record<string, unknown>;
}

interface EvaluationResult {
  significant: boolean;
  winner?: { id: number; name: string };
  pValue?: number;
  variants: Array<{
    id: number;
    name: string;
    isControl: boolean;
    conversionRate: number;
    impressions: number;
    conversions: number;
  }>;
}

interface ListFilters {
  status?: string;
  testType?: string;
  limit?: number;
  offset?: number;
}

// ---------------------------------------------------------------------------
// Helpers estadisticos
// ---------------------------------------------------------------------------

/**
 * Z-test simplificado de dos proporciones.
 * Retorna el p-value (two-tailed) comparando control vs treatment.
 */
const twoProportionZTest = (
  n1: number,
  x1: number,
  n2: number,
  x2: number
): { zScore: number; pValue: number } => {
  if (n1 === 0 || n2 === 0) return { zScore: 0, pValue: 1 };

  const p1 = x1 / n1;
  const p2 = x2 / n2;
  const pPool = (x1 + x2) / (n1 + n2);

  const se = Math.sqrt(pPool * (1 - pPool) * (1 / n1 + 1 / n2));
  if (se === 0) return { zScore: 0, pValue: 1 };

  const z = (p1 - p2) / se;

  // Aproximacion del p-value (two-tailed) usando la funcion de error
  const pValue = 2 * (1 - normalCDF(Math.abs(z)));

  return { zScore: z, pValue };
};

/**
 * CDF aproximada de la distribucion normal estandar.
 * Usa la aproximacion de Abramowitz & Stegun (formula 26.2.17).
 */
const normalCDF = (x: number): number => {
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const sign = x < 0 ? -1 : 1;
  const absX = Math.abs(x);

  const t = 1.0 / (1.0 + p * absX);
  const y =
    1.0 -
    ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-absX * absX / 2);

  return 0.5 * (1.0 + sign * y);
};

// ---------------------------------------------------------------------------
// Funciones del servicio
// ---------------------------------------------------------------------------

/**
 * Crear un A/B test con sus variantes.
 */
const createTest = async (
  companyId: number,
  data: CreateTestData
): Promise<AIABTest> => {
  if (!data.variants || data.variants.length < 2) {
    throw new AppError("ERR_AB_TEST_MIN_VARIANTS", 400);
  }

  // Generar trafficSplit equitativo
  const splitPercentage = Math.round((100 / data.variants.length) * 100) / 100;
  const trafficSplit: Record<string, number> = {};

  // Asegurar que al menos una variante sea control
  const hasControl = data.variants.some(v => v.isControl);
  if (!hasControl) {
    data.variants[0].isControl = true;
  }

  const test = await AIABTest.create({
    companyId,
    name: data.name,
    description: data.description || null,
    testType: data.testType,
    agentType: data.agentType || null,
    primaryMetric: data.primaryMetric || "resolution_rate",
    minSampleSize: data.minSampleSize || 100,
    confidenceLevel: data.confidenceLevel || 0.95,
    status: "draft",
    totalImpressions: 0,
    trafficSplit: {}
  } as Partial<AIABTest>);

  const variants: AIABTestVariant[] = [];

  for (let i = 0; i < data.variants.length; i++) {
    const variantData = data.variants[i];

    const variant = await AIABTestVariant.create({
      testId: test.id,
      companyId,
      name: variantData.name,
      isControl: variantData.isControl || false,
      config: variantData.config,
      impressions: 0,
      conversions: 0,
      avgLatencyMs: 0,
      avgCostUsd: 0,
      avgCsat: 0,
      escalationCount: 0,
      resolutionCount: 0,
      totalTokensUsed: 0,
      metadata: {}
    } as Partial<AIABTestVariant>);

    trafficSplit[String(variant.id)] = splitPercentage;
    variants.push(variant);
  }

  // Ajustar el ultimo para que sume exactamente 100
  const totalSoFar = splitPercentage * (variants.length - 1);
  trafficSplit[String(variants[variants.length - 1].id)] =
    Math.round((100 - totalSoFar) * 100) / 100;

  await test.update({ trafficSplit });

  // Recargar con variantes
  const result = await AIABTest.findByPk(test.id, {
    include: [{ model: AIABTestVariant, as: "variants" }]
  });

  logger.info(
    { testId: test.id, companyId, variantCount: variants.length },
    `[ABTest] Test creado: "${data.name}"`
  );

  return result!;
};

/**
 * Iniciar un test (cambia status a 'running').
 */
const startTest = async (
  testId: number,
  companyId: number
): Promise<AIABTest> => {
  const test = await AIABTest.findOne({
    where: { id: testId, companyId },
    include: [{ model: AIABTestVariant, as: "variants" }]
  });

  if (!test) throw new AppError("ERR_AB_TEST_NOT_FOUND", 404);

  if (test.status === "running") {
    throw new AppError("ERR_AB_TEST_ALREADY_RUNNING", 400);
  }

  if (test.status === "completed") {
    throw new AppError("ERR_AB_TEST_ALREADY_COMPLETED", 400);
  }

  await test.update({ status: "running", startedAt: new Date() });

  logger.info({ testId, companyId }, `[ABTest] Test iniciado: "${test.name}"`);

  return test;
};

/**
 * Pausar un test en ejecucion.
 */
const pauseTest = async (
  testId: number,
  companyId: number
): Promise<AIABTest> => {
  const test = await AIABTest.findOne({
    where: { id: testId, companyId }
  });

  if (!test) throw new AppError("ERR_AB_TEST_NOT_FOUND", 404);

  if (test.status !== "running") {
    throw new AppError("ERR_AB_TEST_NOT_RUNNING", 400);
  }

  await test.update({ status: "paused" });

  logger.info({ testId, companyId }, `[ABTest] Test pausado: "${test.name}"`);

  return test;
};

/**
 * Obtener la variante activa para un agentType dado.
 * Usa seleccion ponderada segun trafficSplit.
 */
const getActiveVariant = async (
  companyId: number,
  agentType: string
): Promise<ActiveVariantResult | null> => {
  const test = await AIABTest.findOne({
    where: {
      companyId,
      agentType,
      status: "running"
    },
    include: [{ model: AIABTestVariant, as: "variants" }]
  });

  if (!test || !test.variants || test.variants.length === 0) {
    return null;
  }

  // Seleccion ponderada basada en trafficSplit
  const split = test.trafficSplit || {};
  const random = Math.random() * 100;
  let cumulative = 0;
  let selectedVariant: AIABTestVariant | null = null;

  for (const variant of test.variants) {
    const weight = split[String(variant.id)] || 0;
    cumulative += weight;
    if (random <= cumulative) {
      selectedVariant = variant;
      break;
    }
  }

  // Fallback: si por redondeo no se selecciono, usar la ultima
  if (!selectedVariant) {
    selectedVariant = test.variants[test.variants.length - 1];
  }

  // Incrementar impressions de la variante
  await selectedVariant.increment("impressions", { by: 1 });

  // Incrementar totalImpressions del test
  await test.increment("totalImpressions", { by: 1 });

  return {
    testId: test.id,
    variantId: selectedVariant.id,
    config: selectedVariant.config
  };
};

/**
 * Registrar un resultado para una variante.
 * Actualiza metricas con promedios acumulativos.
 */
const recordResult = async (
  variantId: number,
  companyId: number,
  result: RecordResultData
): Promise<AIABTestVariant> => {
  const variant = await AIABTestVariant.findOne({
    where: { id: variantId, companyId }
  });

  if (!variant) throw new AppError("ERR_AB_TEST_VARIANT_NOT_FOUND", 404);

  const updates: Partial<Record<string, number>> = {};

  if (result.converted) {
    updates.conversions = (variant.conversions || 0) + 1;
  }

  if (result.latencyMs !== undefined) {
    const n = variant.impressions || 1;
    updates.avgLatencyMs =
      ((Number(variant.avgLatencyMs) * (n - 1)) + result.latencyMs) / n;
  }

  if (result.costUsd !== undefined) {
    const n = variant.impressions || 1;
    updates.avgCostUsd =
      ((Number(variant.avgCostUsd) * (n - 1)) + result.costUsd) / n;
  }

  if (result.csat !== undefined) {
    const n = variant.impressions || 1;
    updates.avgCsat =
      ((Number(variant.avgCsat) * (n - 1)) + result.csat) / n;
  }

  if (result.escalated) {
    updates.escalationCount = (variant.escalationCount || 0) + 1;
  }

  if (result.resolved) {
    updates.resolutionCount = (variant.resolutionCount || 0) + 1;
  }

  if (result.tokensUsed !== undefined) {
    updates.totalTokensUsed = (Number(variant.totalTokensUsed) || 0) + result.tokensUsed;
  }

  if (Object.keys(updates).length > 0) {
    await variant.update(updates);
  }

  // Incrementar totalImpressions del test padre
  const test = await AIABTest.findByPk(variant.testId);
  if (test) {
    await test.increment("totalImpressions", { by: 1 });
  }

  await variant.reload();
  return variant;
};

/**
 * Evaluar un test: calcular significancia estadistica.
 * Usa Z-test de dos proporciones (conversion rate).
 */
const evaluateTest = async (
  testId: number,
  companyId: number
): Promise<EvaluationResult> => {
  const test = await AIABTest.findOne({
    where: { id: testId, companyId },
    include: [{ model: AIABTestVariant, as: "variants" }]
  });

  if (!test) throw new AppError("ERR_AB_TEST_NOT_FOUND", 404);
  if (!test.variants || test.variants.length < 2) {
    throw new AppError("ERR_AB_TEST_INSUFFICIENT_VARIANTS", 400);
  }

  // Construir datos de variantes
  const variantsData = test.variants.map(v => ({
    id: v.id,
    name: v.name,
    isControl: v.isControl,
    conversionRate: v.impressions > 0
      ? Number(((v.conversions / v.impressions) * 100).toFixed(2))
      : 0,
    impressions: v.impressions,
    conversions: v.conversions
  }));

  // Encontrar variante control
  const control = test.variants.find(v => v.isControl);
  if (!control) {
    throw new AppError("ERR_AB_TEST_NO_CONTROL", 400);
  }

  // Evaluar cada variante tratamiento contra el control
  let bestPValue = 1;
  let bestVariant: { id: number; name: string } | undefined;
  let bestConversionRate = control.impressions > 0
    ? control.conversions / control.impressions
    : 0;
  let overallSignificant = false;

  for (const variant of test.variants) {
    if (variant.isControl) continue;

    const { pValue } = twoProportionZTest(
      control.impressions,
      control.conversions,
      variant.impressions,
      variant.conversions
    );

    const variantRate = variant.impressions > 0
      ? variant.conversions / variant.impressions
      : 0;

    const confidenceThreshold = 1 - Number(test.confidenceLevel);

    if (pValue < bestPValue) {
      bestPValue = pValue;
    }

    // Verificar si cumple minSampleSize y es significativo
    const hasEnoughSamples =
      control.impressions >= test.minSampleSize &&
      variant.impressions >= test.minSampleSize;

    if (hasEnoughSamples && pValue < confidenceThreshold && variantRate > bestConversionRate) {
      bestVariant = { id: variant.id, name: variant.name };
      bestConversionRate = variantRate;
      overallSignificant = true;
    }
  }

  // Si el control es mejor que todos los tratamientos y es significativo
  if (!bestVariant && overallSignificant) {
    bestVariant = { id: control.id, name: control.name };
  }

  // Si hay significancia, verificar si debe marcar ganador
  if (overallSignificant && bestVariant) {
    // Solo marcar ganador si el test esta corriendo
    if (test.status === "running") {
      await test.update({
        winnerVariantId: bestVariant.id,
        status: "completed",
        completedAt: new Date()
      });

      logger.info(
        { testId, companyId, winnerId: bestVariant.id, pValue: bestPValue },
        `[ABTest] Test completado. Ganador: "${bestVariant.name}"`
      );
    }
  }

  return {
    significant: overallSignificant,
    winner: bestVariant,
    pValue: Number(bestPValue.toFixed(6)),
    variants: variantsData
  };
};

/**
 * Listar tests con paginacion y filtros.
 */
const listTests = async (
  companyId: number,
  filters: ListFilters
): Promise<{ rows: AIABTest[]; count: number }> => {
  const where: Record<string, unknown> = { companyId };

  if (filters.status) where.status = filters.status;
  if (filters.testType) where.testType = filters.testType;

  const limit = filters.limit || 20;
  const offset = filters.offset || 0;

  const { rows, count } = await AIABTest.findAndCountAll({
    where,
    include: [{ model: AIABTestVariant, as: "variants" }],
    order: [["createdAt", "DESC"]],
    limit,
    offset
  });

  return { rows, count };
};

/**
 * Obtener un test por ID con todas sus variantes.
 */
const getTest = async (
  testId: number,
  companyId: number
): Promise<AIABTest> => {
  const test = await AIABTest.findOne({
    where: { id: testId, companyId },
    include: [{ model: AIABTestVariant, as: "variants" }]
  });

  if (!test) throw new AppError("ERR_AB_TEST_NOT_FOUND", 404);

  return test;
};

export default {
  createTest,
  startTest,
  pauseTest,
  getActiveVariant,
  recordResult,
  evaluateTest,
  listTests,
  getTest
};
