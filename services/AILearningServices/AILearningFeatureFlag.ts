/**
 * AILearningFeatureFlag — Niveles del Loop de Aprendizaje por companyId.
 *
 * Sprint 1 (2026-05-20) — Opción C: aprender de correcciones humanas SIN
 * dependencia externa (Zep). El flag controla cuánto se activa el sistema
 * por empresa para permitir rollout gradual.
 *
 * Niveles:
 *   0 → OFF total. El comportamiento es idéntico al pre-Sprint 1.
 *       HumanCorrectionExtractorJob legacy sigue funcionando.
 *   1 → Solo clasificar y registrar en AICorrectionLearned (sin afectar el
 *       prompt ni el gatekeeper). Modo "observación".
 *   2 → Auto-aprender tipos NO críticos con confidence ≥ 0.85.
 *       Tipos críticos (price/payment/appointment/status/contract/availability)
 *       SIEMPRE van a AICorrectionReviewQueue, sin excepción.
 *       Gatekeeper activa CorrectionRepeatBlocker.
 *   3 → Igual que 2 pero además habilita supersede automático de filas
 *       AIHistoricalQA contradictorias para no críticos.
 *
 * Por decisión arquitectónica acordada (2026-05-20):
 *   - Sprint 1 NO persiste el nivel en BD. Solo env vars.
 *   - Tipos críticos: price, payment, appointment, status, contract, availability.
 *     NUNCA se auto-aprenden, incluso en nivel 3. Caen siempre en review.
 *
 * Multi-tenant: la decisión se toma por companyId.
 */

export type LearningLevel = 0 | 1 | 2 | 3;

const DEFAULT_LEVEL: LearningLevel = 0;

/**
 * Tipos de corrección que SIEMPRE requieren aprobación humana antes de
 * convertirse en regla activa, sin importar el nivel del feature flag o la
 * confidence del clasificador. Decisión inamovible del Sprint 1.
 */
export const CRITICAL_CORRECTION_TYPES: ReadonlyArray<string> = [
  "price_correction",
  "payment_override",
  "appointment_override",
  "status_override",
  "contract_override",
  "availability_override"
];

/**
 * Parsea una lista CSV de companyIds desde una env var.
 * Acepta "1,2,3" o " 1 , 2 , 3 " o "" (vacío → []).
 */
const parseCompanyList = (raw?: string): Set<number> => {
  if (!raw || !raw.trim()) return new Set();
  const ids = raw
    .split(",")
    .map(s => parseInt(s.trim(), 10))
    .filter(n => Number.isFinite(n) && n > 0);
  return new Set(ids);
};

const readLevelCompanies = (level: LearningLevel): Set<number> => {
  switch (level) {
    case 1: return parseCompanyList(process.env.AI_LEARNING_COMPANIES_LEVEL_1);
    case 2: return parseCompanyList(process.env.AI_LEARNING_COMPANIES_LEVEL_2);
    case 3: return parseCompanyList(process.env.AI_LEARNING_COMPANIES_LEVEL_3);
    default: return new Set();
  }
};

const readGlobalLevel = (): LearningLevel => {
  const raw = (process.env.AI_LEARNING_LEVEL || "").trim();
  if (!raw) return DEFAULT_LEVEL;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 0 || n > 3) return DEFAULT_LEVEL;
  return n as LearningLevel;
};

/**
 * Devuelve el nivel efectivo para una empresa.
 *
 * Lógica de override (de mayor a menor especificidad):
 *   1. Si companyId está en AI_LEARNING_COMPANIES_LEVEL_3 → 3
 *   2. Si companyId está en AI_LEARNING_COMPANIES_LEVEL_2 → 2
 *   3. Si companyId está en AI_LEARNING_COMPANIES_LEVEL_1 → 1
 *   4. AI_LEARNING_LEVEL global
 *   5. DEFAULT_LEVEL = 0
 *
 * Si una empresa aparece en varios niveles, gana el MÁS ALTO.
 */
export const getLevel = (companyId: number): LearningLevel => {
  if (!companyId || companyId <= 0) return DEFAULT_LEVEL;

  const lvl3 = readLevelCompanies(3);
  if (lvl3.has(companyId)) return 3;

  const lvl2 = readLevelCompanies(2);
  if (lvl2.has(companyId)) return 2;

  const lvl1 = readLevelCompanies(1);
  if (lvl1.has(companyId)) return 1;

  return readGlobalLevel();
};

/**
 * Atajos semánticos para el código consumidor.
 */
export const isEnabled = (companyId: number): boolean => getLevel(companyId) >= 1;

export const canAutoLearn = (companyId: number): boolean => getLevel(companyId) >= 2;

export const canSupersedeHistoricalQA = (companyId: number): boolean =>
  getLevel(companyId) >= 3;

/**
 * Tipos críticos: siempre van a review, nunca se auto-aprenden.
 * Independiente del nivel.
 */
export const requiresHumanReview = (
  correctionType: string,
  classifierConfidence: number
): boolean => {
  if (CRITICAL_CORRECTION_TYPES.includes(correctionType)) return true;
  if (classifierConfidence < 0.85) return true;
  return false;
};

/**
 * Modelo a usar para el HumanCorrectionClassifierAgent. Override por env.
 */
export const getClassifierModel = (): string =>
  process.env.AI_LEARNING_CLASSIFIER_MODEL || "gpt-5.5";

export default {
  getLevel,
  isEnabled,
  canAutoLearn,
  canSupersedeHistoricalQA,
  requiresHumanReview,
  getClassifierModel,
  CRITICAL_CORRECTION_TYPES
};
