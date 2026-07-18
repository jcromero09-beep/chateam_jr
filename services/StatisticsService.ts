/**
 * [Fase2·Ola D] Núcleo estadístico de forma cerrada, en TypeScript puro.
 *
 * Reemplaza los números de confianza inventados (p.ej. `attribution_confidence: 0.9`
 * hardcodeado) por estadística real. Todo aquí es cerrado-de-forma: no necesita
 * scipy/statsmodels, así que corre en el proceso Node sin sidecar ni build pesado.
 * Base: Anderson/Sweeney/Williams (Estadística para administración y economía).
 *
 * Regla transversal (criterio de aceptación de la ola): ninguna estimación se
 * reporta sin **n mínimo**; por debajo se devuelve `insufficient` con el n que falta.
 */

// z crítico para IC bilateral. 1.96 = 95% (α=0.05), el estándar de la ola.
export const Z_95 = 1.959963984540054;
export const Z_90 = 1.6448536269514722;

/** Φ⁻¹ aproximada (Acklam) — para p-valores sin tablas. */
const invNorm = (p: number): number => {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  let q: number, r: number;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1); }
  if (p <= 1 - pl) { q = p - 0.5; r = q*q; return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q / (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1); }
  q = Math.sqrt(-2 * Math.log(1 - p)); return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) / ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
};

/** Φ estándar acumulada (Abramowitz-Stegun 7.1.26). */
export const normCdf = (x: number): number => {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989422804014327 * Math.exp(-x * x / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
};

export type Interval = { point: number; low: number; high: number; margin: number };
export type Estimate<T = {}> = ({ sufficient: true } & Interval & T) | { sufficient: false; reason: string; nHave: number; nNeed: number };

/**
 * [G4] IC 95% de una RATIO tipo CPA/ROAS (gasto/conversiones).
 * El CPA es una media de coste por evento; su error estándar sale de la varianza
 * del gasto por conversión. Se aproxima con el método delta sobre la media.
 */
export const ratioCI = (
  numeratorTotal: number,   // p.ej. gasto total
  denominatorCount: number, // p.ej. nº de conversiones (n)
  denominatorVarianceHint?: number,
  z = Z_95,
  minN = 30
): Estimate<{ cv: number }> => {
  if (denominatorCount < minN) {
    return { sufficient: false, reason: "muestra insuficiente para un IC fiable", nHave: denominatorCount, nNeed: minN };
  }
  const point = numeratorTotal / denominatorCount;
  // SE de la media ≈ punto / √n si no hay varianza observada (aprox. Poisson en el conteo).
  const se = denominatorVarianceHint != null
    ? Math.sqrt(denominatorVarianceHint / denominatorCount)
    : point / Math.sqrt(denominatorCount);
  const margin = z * se;
  return { sufficient: true, point, low: Math.max(0, point - margin), high: point + margin, margin, cv: se / point };
};

/** ¿El IC es tan ancho que no permite decidir? (criterio de la ola: IC más ancho que el efecto). */
export const isConclusive = (ci: Interval, referenceEffect: number): boolean =>
  ci.margin < Math.abs(referenceEffect) / 2;

/** [G1/G2] Media posterior Beta-Binomial (scoring bayesiano de conversión). */
export const betaBinomialScore = (
  successes: number,
  trials: number,
  priorAlpha = 1,
  priorBeta = 1
): { score: number; low: number; high: number; posteriorMean: number } => {
  const a = priorAlpha + successes;
  const b = priorBeta + (trials - successes);
  const mean = a / (a + b);
  // IC por normal sobre la Beta (válido con a,b no muy pequeños).
  const varBeta = (a * b) / ((a + b) ** 2 * (a + b + 1));
  const sd = Math.sqrt(varBeta);
  return {
    score: Math.round(mean * 100),
    posteriorMean: mean,
    low: Math.max(0, Math.round((mean - Z_95 * sd) * 100)),
    high: Math.min(100, Math.round((mean + Z_95 * sd) * 100))
  };
};

/** [G5] z-test de dos proporciones (A/B). Devuelve p-valor bilateral y decisión. */
export const twoProportionZTest = (
  xA: number, nA: number, xB: number, nB: number, minPerArm = 30
): Estimate<{ pValue: number; lift: number; significant: boolean }> | { sufficient: false; reason: string; nHave: number; nNeed: number } => {
  if (nA < minPerArm || nB < minPerArm) {
    return { sufficient: false, reason: "cada variante necesita muestra mínima", nHave: Math.min(nA, nB), nNeed: minPerArm };
  }
  const pA = xA / nA, pB = xB / nB;
  const pPool = (xA + xB) / (nA + nB);
  const se = Math.sqrt(pPool * (1 - pPool) * (1 / nA + 1 / nB));
  const z = se > 0 ? (pB - pA) / se : 0;
  const pValue = 2 * (1 - normCdf(Math.abs(z)));
  const diff = pB - pA;
  const seDiff = Math.sqrt(pA * (1 - pA) / nA + pB * (1 - pB) / nB);
  const margin = Z_95 * seDiff;
  return {
    sufficient: true, point: diff, low: diff - margin, high: diff + margin, margin,
    pValue, lift: pA > 0 ? (pB - pA) / pA : 0, significant: pValue < 0.05
  };
};

/** [G6] χ² de independencia sobre una tabla de contingencia r×c. */
export const chiSquareIndependence = (
  observed: number[][]
): { chi2: number; df: number; pValue: number; significant: boolean; n: number; sufficient: boolean; reason?: string } => {
  const rows = observed.length, cols = observed[0]?.length || 0;
  const rowSums = observed.map(r => r.reduce((a, b) => a + b, 0));
  const colSums = Array.from({ length: cols }, (_, j) => observed.reduce((a, r) => a + r[j], 0));
  const n = rowSums.reduce((a, b) => a + b, 0);
  if (n === 0 || rows < 2 || cols < 2) return { chi2: 0, df: 0, pValue: 1, significant: false, n, sufficient: false, reason: "tabla degenerada" };

  let chi2 = 0, lowExpected = 0;
  for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
    const expected = (rowSums[i] * colSums[j]) / n;
    if (expected < 5) lowExpected++;
    if (expected > 0) chi2 += (observed[i][j] - expected) ** 2 / expected;
  }
  const df = (rows - 1) * (cols - 1);
  // p-valor por CDF χ² (Wilson-Hilferty).
  const pValue = 1 - chiSqCdf(chi2, df);
  return {
    chi2, df, pValue, significant: pValue < 0.05, n,
    // Regla de Cochran: χ² poco fiable si >20% de celdas esperan <5.
    sufficient: lowExpected / (rows * cols) <= 0.2,
    reason: lowExpected / (rows * cols) > 0.2 ? "demasiadas celdas con frecuencia esperada <5" : undefined
  };
};

/** CDF χ² por aproximación de Wilson-Hilferty a la normal. */
const chiSqCdf = (x: number, df: number): number => {
  if (x <= 0 || df <= 0) return 0;
  const t = Math.cbrt(x / df);
  const mean = 1 - 2 / (9 * df);
  const sd = Math.sqrt(2 / (9 * df));
  return normCdf((t - mean) / sd);
};

/** [G3] Demanda Poisson: λ/hora + P(X > capacidad) de superar aforo de agentes. */
export const poissonForecast = (
  eventsObserved: number,
  hoursObserved: number,
  capacity: number,
  minHours = 24
): Estimate<{ lambda: number; probExceedCapacity: number }> | { sufficient: false; reason: string; nHave: number; nNeed: number } => {
  if (hoursObserved < minHours) {
    return { sufficient: false, reason: "pocas horas de histórico para estimar λ", nHave: hoursObserved, nNeed: minHours };
  }
  const lambda = eventsObserved / hoursObserved;
  // P(X > capacity) = 1 - Σ_{k=0}^{capacity} e^-λ λ^k / k!
  let cdf = 0, term = Math.exp(-lambda);
  for (let k = 0; k <= Math.floor(capacity); k++) {
    cdf += term;
    term *= lambda / (k + 1);
  }
  const probExceed = Math.max(0, Math.min(1, 1 - cdf));
  // IC de λ (aprox normal): λ ± z√(λ/horas).
  const se = Math.sqrt(lambda / hoursObserved);
  const margin = Z_95 * se;
  return { sufficient: true, point: lambda, low: Math.max(0, lambda - margin), high: lambda + margin, margin, lambda, probExceedCapacity: probExceed };
};

/** [G9] Carta de control ±3σ: límites y puntos fuera de control de una serie temporal. */
export const controlChart = (
  series: number[]
): { mean: number; ucl: number; lcl: number; sigma: number; outOfControl: number[] } => {
  const n = series.length;
  if (n < 2) return { mean: series[0] || 0, ucl: 0, lcl: 0, sigma: 0, outOfControl: [] };
  const mean = series.reduce((a, b) => a + b, 0) / n;
  // Carta de individuos (I-MR): sigma se estima del RANGO MÓVIL medio, no de la SD
  // muestral. La SD la infla el propio outlier (sube sigma, ensancha los límites,
  // y el outlier queda dentro → no se detecta nada). mR-bar/d2 (d2=1.128 para n=2)
  // es robusto a puntos aislados, que es justo lo que una carta de control busca.
  const movingRanges = series.slice(1).map((v, i) => Math.abs(v - series[i]));
  const mrBar = movingRanges.reduce((a, b) => a + b, 0) / movingRanges.length;
  const sigma = mrBar / 1.128;
  const ucl = mean + 3 * sigma, lcl = Math.max(0, mean - 3 * sigma);
  const outOfControl = series.map((v, i) => (v > ucl || v < lcl ? i : -1)).filter(i => i >= 0);
  return { mean, ucl, lcl, sigma, outOfControl };
};

/** Tamaño de muestra mínimo por brazo para detectar un lift dado (dos proporciones, α=0.05, potencia 0.8). */
export const minSampleSize = (baseline: number, minDetectableLift: number, alpha = 0.05, power = 0.8): number => {
  const p1 = baseline, p2 = baseline * (1 + minDetectableLift);
  const zA = invNorm(1 - alpha / 2), zB = invNorm(power);
  const pBar = (p1 + p2) / 2;
  const num = (zA * Math.sqrt(2 * pBar * (1 - pBar)) + zB * Math.sqrt(p1 * (1 - p1) + p2 * (1 - p2))) ** 2;
  const den = (p2 - p1) ** 2;
  return den > 0 ? Math.ceil(num / den) : Infinity;
};

/** [G2] Muestreo Thompson: reparte presupuesto explorando/explotando creatividades.
 * Muestrea de la posterior Beta de cada variante y asigna proporción por victorias. */
export const thompsonAllocation = (
  arms: { id: string; successes: number; trials: number }[],
  draws = 2000,
  priorAlpha = 1,
  priorBeta = 1
): { id: string; share: number; posteriorMean: number }[] => {
  if (!arms.length) return [];
  // Gamma(k,1) por suma de exponenciales (k entero) → Beta = G(a)/(G(a)+G(b)).
  const gamma = (k: number): number => {
    let sum = 0;
    for (let i = 0; i < Math.max(1, Math.round(k)); i++) sum += -Math.log(1 - pseudoRandom());
    return sum;
  };
  // PRNG determinista (sin Math.random, que rompe la reproducibilidad): LCG sembrado
  // por los datos, para que el mismo estado dé el mismo reparto.
  let seed = arms.reduce((a, x) => a + x.successes * 31 + x.trials * 17, 7);
  function pseudoRandom(): number { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; }

  const wins = new Map(arms.map(a => [a.id, 0]));
  for (let d = 0; d < draws; d++) {
    let best = arms[0].id, bestVal = -1;
    for (const a of arms) {
      const ga = gamma(priorAlpha + a.successes);
      const gb = gamma(priorBeta + (a.trials - a.successes));
      const sample = ga / (ga + gb);
      if (sample > bestVal) { bestVal = sample; best = a.id; }
    }
    wins.set(best, (wins.get(best) || 0) + 1);
  }
  return arms.map(a => ({
    id: a.id,
    share: Math.round(((wins.get(a.id) || 0) / draws) * 1000) / 10,
    posteriorMean: (priorAlpha + a.successes) / (priorAlpha + priorBeta + a.trials)
  }));
};

/** [G7] Regresión lineal múltiple OLS: coeficientes + errores estándar + p-valores.
 * Normal equations β=(XᵀX)⁻¹Xᵀy; SE de la diagonal de σ²(XᵀX)⁻¹; p por t≈normal (df grande). */
export const linearRegression = (
  X: number[][], // filas = observaciones, cols = predictores (SIN intercepto: se añade)
  y: number[],
  minN = 20
): { coefficients: { name: string; beta: number; se: number; t: number; pValue: number; significant: boolean }[]; r2: number; n: number; sufficient: boolean; reason?: string } => {
  const n = y.length;
  if (n < minN || !X.length) return { coefficients: [], r2: 0, n, sufficient: false, reason: `se necesitan ≥${minN} observaciones` };
  const k = X[0].length + 1; // +1 intercepto
  if (n <= k) return { coefficients: [], r2: 0, n, sufficient: false, reason: "más predictores que observaciones" };

  // Diseño con intercepto.
  const Xd = X.map(row => [1, ...row]);
  // XᵀX y Xᵀy
  const XtX = Array.from({ length: k }, (_, i) => Array.from({ length: k }, (_, j) =>
    Xd.reduce((s, row) => s + row[i] * row[j], 0)));
  const Xty = Array.from({ length: k }, (_, i) => Xd.reduce((s, row, r) => s + row[i] * y[r], 0));
  const inv = invertMatrix(XtX);
  if (!inv) return { coefficients: [], r2: 0, n, sufficient: false, reason: "matriz singular (predictores colineales)" };

  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * Xty[j], 0));
  const yhat = Xd.map(row => row.reduce((s, v, j) => s + v * beta[j], 0));
  const meanY = y.reduce((a, b) => a + b, 0) / n;
  const ssRes = y.reduce((s, yi, i) => s + (yi - yhat[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - meanY) ** 2, 0);
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  const sigma2 = ssRes / (n - k);

  const names = ["intercepto", ...X[0].map((_, i) => `x${i + 1}`)];
  const coefficients = beta.map((b, i) => {
    const se = Math.sqrt(Math.max(0, sigma2 * inv[i][i]));
    const t = se > 0 ? b / se : 0;
    const pValue = 2 * (1 - normCdf(Math.abs(t))); // t≈normal para df grande
    return { name: names[i], beta: Math.round(b * 10000) / 10000, se: Math.round(se * 10000) / 10000, t: Math.round(t * 100) / 100, pValue: Math.round(pValue * 10000) / 10000, significant: pValue < 0.05 };
  });
  return { coefficients, r2: Math.round(r2 * 1000) / 1000, n, sufficient: true };
};

/** Inversa por Gauss-Jordan (matrices pequeñas de regresión). */
const invertMatrix = (m: number[][]): number[][] | null => {
  const n = m.length;
  const a = m.map((row, i) => [...row, ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0))]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[piv][col])) piv = r;
    if (Math.abs(a[piv][col]) < 1e-12) return null;
    [a[col], a[piv]] = [a[piv], a[col]];
    const d = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= d;
    for (let r = 0; r < n; r++) if (r !== col) { const f = a[r][col]; for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j]; }
  }
  return a.map(row => row.slice(n));
};

/** [G8] Pronóstico por suavización exponencial (Holt, nivel+tendencia) con escenarios. */
export const forecastExponential = (
  series: number[],
  horizon = 1,
  alpha = 0.5,
  beta = 0.3,
  minN = 3
): { base: number; pessimistic: number; optimistic: number; level: number; trend: number; sufficient: boolean; reason?: string } => {
  const n = series.length;
  if (n < minN) return { base: 0, pessimistic: 0, optimistic: 0, level: 0, trend: 0, sufficient: false, reason: `se necesitan ≥${minN} períodos` };
  let level = series[0], trend = series[1] - series[0];
  const errors: number[] = [];
  for (let i = 1; i < n; i++) {
    const forecast = level + trend;
    errors.push(series[i] - forecast);
    const prevLevel = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prevLevel) + (1 - beta) * trend;
  }
  const base = level + horizon * trend;
  // Banda ±1.28σ del error (≈80%) para pesimista/optimista.
  const sd = errors.length ? Math.sqrt(errors.reduce((s, e) => s + e * e, 0) / errors.length) : 0;
  return {
    base: Math.round(base * 100) / 100,
    pessimistic: Math.round((base - 1.28 * sd) * 100) / 100,
    optimistic: Math.round((base + 1.28 * sd) * 100) / 100,
    level: Math.round(level * 100) / 100, trend: Math.round(trend * 1000) / 1000, sufficient: true
  };
};

export default {
  ratioCI, isConclusive, betaBinomialScore, twoProportionZTest,
  chiSquareIndependence, poissonForecast, controlChart, minSampleSize, normCdf, Z_95,
  thompsonAllocation, linearRegression, forecastExponential
};
