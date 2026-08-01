/**
 * processWarnings.ts — los avisos de Node dejan de contarse como errores.
 *
 * ## El problema (triaje de logs, 2026-07-30)
 *
 * En 3 días de producción había **1.088 líneas de nivel ERROR** que decían:
 *
 *     [DEP0174] DeprecationWarning: Calling promisify on a function that
 *     returns a Promise is likely a mistake.
 *
 * Frente a **9 errores reales**. Los de verdad quedaban en el 0,8 % de las
 * líneas: buscar un problema en ese log es buscarlo debajo de su propio ruido.
 *
 * ## Por qué un aviso acababa siendo un ERROR
 *
 * El handler por defecto de Node para el evento `warning` escribe con
 * `console.error`. Y `utils/consoleToLogger` enruta `console.error` a
 * `logger.error` — con buen motivo, para unificar formato y aplicar la
 * sanitización de secretos. El resultado no buscado: **todo aviso del runtime
 * (deprecación, MaxListenersExceeded, etc.) se clasifica como error.**
 *
 * ## Qué hace esto
 *
 * 1. Quita el handler por defecto (`removeAllListeners`) — si no, seguiría
 *    escribiendo por `console.error` en paralelo al nuestro.
 * 2. Loguea a nivel `warn`, que es lo que son.
 * 3. **Deduplica.** Un aviso repetido 1.088 veces no aporta más información que
 *    la primera vez: se loguea la primera aparición de cada `(name, code,
 *    message)` y a partir de ahí solo se cuenta. Es el mismo criterio que ya
 *    usan el inventario de `helpers/tenantScope` y el contador de
 *    `middleware/tokenAuth`.
 * 4. Vuelca un resumen con los contadores cada `PROCESS_WARNINGS_SUMMARY_MS`
 *    (default 30 min), solo si hubo avisos nuevos.
 *
 * Nada se pierde: el aviso sigue estando, con su traza la primera vez. Lo que se
 * pierde es la repetición.
 */
import logger from "./logger";

const SUMMARY_MS = Number(process.env.PROCESS_WARNINGS_SUMMARY_MS || 30 * 60 * 1000);

type WarningRecord = {
  name: string;
  code?: string;
  message: string;
  count: number;
  firstSeen: string;
};

const seen = new Map<string, WarningRecord>();
let timer: NodeJS.Timeout | undefined;

/** Inventario acumulado de avisos, de más a menos frecuente. Para diagnóstico. */
export const getProcessWarnings = (): WarningRecord[] =>
  [...seen.values()].sort((a, b) => b.count - a.count);

export const resetProcessWarnings = (): void => {
  seen.clear();
};

/** Registra un aviso. Exportada para poder testearla sin emitir de verdad. */
export const recordWarning = (warning: {
  name?: string;
  message?: string;
  code?: string;
  stack?: string;
}): void => {
  const name = warning?.name || "Warning";
  const code = (warning as any)?.code;
  const message = warning?.message || "";
  const key = `${name}|${code || "-"}|${message}`;

  const existing = seen.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }

  seen.set(key, {
    name,
    code,
    message,
    count: 1,
    firstSeen: new Date().toISOString()
  });

  // Primera vez: se loguea con la traza, que es lo único que sirve para
  // localizar de dónde sale.
  logger.warn(
    { name, code, stack: warning?.stack },
    `[processWarning] ${name}${code ? ` [${code}]` : ""}: ${message}`
  );
};

const startSummary = (): void => {
  if (timer) return;
  timer = setInterval(() => {
    const inv = getProcessWarnings();
    if (!inv.length) return;
    const repeated = inv.filter(w => w.count > 1);
    if (!repeated.length) return;
    logger.warn(
      {
        distinct: inv.length,
        total: inv.reduce((n, w) => n + w.count, 0),
        warnings: inv.map(w => ({ name: w.name, code: w.code, count: w.count }))
      },
      "[processWarning] resumen de avisos del runtime"
    );
  }, SUMMARY_MS);
  timer.unref?.();
};

const g = globalThis as any;
if (!g.__processWarningsRouted) {
  g.__processWarningsRouted = true;
  // El handler por defecto de Node escribe con console.error; quitarlo es lo que
  // impide que el aviso siga contándose como error.
  process.removeAllListeners("warning");
  process.on("warning", recordWarning);
  startSummary();
}

export {};
