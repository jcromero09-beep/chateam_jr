/**
 * CorrectionScopeMatcher — Funciones puras para comparar el alcance (scope)
 * de una corrección guardada contra el contexto del turno actual.
 *
 * Sprint 1 (2026-05-20) — Loop de Aprendizaje desde Correcciones Humanas.
 *
 * Una corrección tiene scope:
 *   { companyId, queueId?, productKey?, intent? }
 *
 * Una corrección aplica al turno actual si:
 *   - companyId coincide (obligatorio)
 *   - scope.queueId == undefined OR scope.queueId == turn.queueId
 *   - scope.productKey == undefined OR scope.productKey == turn.productKey
 *   - scope.intent == undefined OR scope.intent == turn.intent
 *
 * El servicio NO hace I/O. Acepta los objetos en memoria y devuelve booleanos
 * o scores. Esto lo hace fácil de testear y reusable por gatekeeper, planner,
 * search service, etc.
 */

export interface CorrectionScope {
  companyId: number;
  queueId?: number | null;
  productKey?: string | null;
  intent?: string | null;
  [k: string]: unknown;
}

export interface TurnContext {
  companyId: number;
  queueId?: number | null;
  productKey?: string | null;
  intent?: string | null;
}

/**
 * Devuelve true si el scope guardado aplica al turno actual.
 *
 * - companyId DEBE coincidir. Si no, retorna false sin más comprobaciones.
 * - Para los demás campos, "vacío" en scope significa "comodín" (aplica a
 *   todos los valores en el turno).
 * - Strings se normalizan (lowercase + trim) antes de comparar.
 */
export const matches = (
  scope: CorrectionScope,
  turn: TurnContext
): boolean => {
  if (!scope || !turn) return false;
  if (scope.companyId !== turn.companyId) return false;

  // queueId puede venir como null o undefined → wildcard
  if (scope.queueId !== undefined && scope.queueId !== null) {
    if (scope.queueId !== turn.queueId) return false;
  }

  if (scope.productKey) {
    const a = String(scope.productKey).trim().toLowerCase();
    const b = String(turn.productKey || "").trim().toLowerCase();
    if (!b || a !== b) return false;
  }

  if (scope.intent) {
    const a = String(scope.intent).trim().toLowerCase();
    const b = String(turn.intent || "").trim().toLowerCase();
    if (!b || a !== b) return false;
  }

  return true;
};

/**
 * Score de especificidad: a mayor especificidad, más relevante el match.
 * Se usa para ordenar varias correcciones que matchean: la más específica gana.
 *
 *   companyId           +1 (siempre se cuenta)
 *   queueId definido    +2
 *   productKey definido +2
 *   intent definido     +1
 *
 * Rango típico: 1..6
 */
export const specificityScore = (scope: CorrectionScope): number => {
  let s = 1;
  if (scope.queueId !== undefined && scope.queueId !== null) s += 2;
  if (scope.productKey) s += 2;
  if (scope.intent) s += 1;
  return s;
};

/**
 * Ordena un array de correcciones por scope especificidad (más específica
 * primero) y rompe empates con prioridad (menor número = mayor prioridad).
 */
export const sortByRelevance = <T extends { scopeJson: CorrectionScope; priority: number }>(
  corrections: T[]
): T[] => {
  return [...corrections].sort((a, b) => {
    const sa = specificityScore(a.scopeJson);
    const sb = specificityScore(b.scopeJson);
    if (sa !== sb) return sb - sa;            // más específica primero
    return (a.priority || 100) - (b.priority || 100); // menor prioridad numérica primero
  });
};

/**
 * Normaliza un scope crudo (puede venir con strings vacíos, números 0, etc.)
 * a un objeto canónico. NO altera companyId.
 */
export const normalizeScope = (raw: unknown, companyId: number): CorrectionScope => {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;

  const queueId = (() => {
    const v = r.queueId;
    if (typeof v === "number" && v > 0) return v;
    if (typeof v === "string" && v.trim()) {
      const n = parseInt(v, 10);
      return Number.isFinite(n) && n > 0 ? n : undefined;
    }
    return undefined;
  })();

  const productKey = (() => {
    const v = r.productKey;
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  })();

  const intent = (() => {
    const v = r.intent;
    if (typeof v === "string" && v.trim()) return v.trim();
    return undefined;
  })();

  return { companyId, queueId, productKey, intent };
};

export default {
  matches,
  specificityScore,
  sortByRelevance,
  normalizeScope
};
