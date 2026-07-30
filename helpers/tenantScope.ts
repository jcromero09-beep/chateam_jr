/**
 * tenantScope.ts — [W1-SEC-IDOR] Guard estructural de aislamiento multi-tenant
 *
 * Cierra de forma SISTÉMICA el IDOR cross-tenant hallado en la re-auditoría de
 * los 868 servicios (~55-65 servicios hacían find/update/destroy sobre modelos
 * con `companyId` sin filtrarlo). En lugar de parchear cada servicio, inyecta
 * `companyId` en el `where` de TODA query ORM (findAll/findOne/findByPk/count/
 * update/destroy) de los modelos tenant-scoped, tomando el companyId del
 * AsyncLocalStorage de la request (utils/traceContext).
 *
 * SEGURIDAD DEL DISEÑO (fail-safe, cero regresión en caminos async):
 *  - Sólo actúa cuando `origin === 'http'` → jobs/cron/queue/baileys/meta-webhook/
 *    socket NUNCA se scopean (son server-side, confiables, y son la parte difícil
 *    de testear). La superficie del IDOR es el endpoint HTTP autenticado.
 *  - `super === true` → bypass (el super-admin ve/gestiona cross-company).
 *  - Sin companyId en contexto (login/rutas públicas/pre-auth) → no filtra.
 *  - Si el `where` YA trae companyId (servicio ya scopeado) → se respeta, no se
 *    duplica.
 *  - Escape hatch por-query: pasar `{ tenantBypass: true }` en las opciones.
 *  - Kill-switch por env `TENANT_SCOPE_GUARD`:
 *      enforce (default) → inyecta;  observe → sólo loguea lo que inyectaría;
 *      off → desactiva por completo (sin reverter código).
 *
 * Nota: los `sequelize.query()` en SQL crudo (dashboards/reports) NO pasan por
 * hooks ORM → no se ven afectados (ya scopean en el SQL).
 */
import { Op } from "sequelize";
import logger from "../utils/logger";
import { getTraceContext } from "../utils/traceContext";

type Mode = "enforce" | "observe" | "off";

const parseMode = (raw: string | undefined, fallback: Mode): Mode => {
  const v = (raw || "").toLowerCase();
  if (v === "observe") return "observe";
  if (v === "off") return "off";
  if (v === "enforce") return "enforce";
  return fallback;
};

const MODE: Mode = parseMode(process.env.TENANT_SCOPE_GUARD, "enforce");

/**
 * Modo para la superficie `api` (middleware/tokenAuth: /api/send y familia).
 *
 * Hasta ahora esas rutas no propagaban companyId al contexto, así que el guard
 * salía por la primera guarda de applyScope y quedaba INERTE ahí. Al empezar a
 * propagarlo, el guard se activaría de golpe sobre endpoints que hoy filtran a
 * mano: si alguno consultara cross-company a propósito, pasaría a devolver
 * vacío sin aviso. Por eso arranca en 'observe' — loguea lo que inyectaría sin
 * cambiar comportamiento. Pasar a `TENANT_SCOPE_GUARD_API=enforce` cuando los
 * logs confirmen que no hay sorpresas.
 */
const API_MODE: Mode = parseMode(process.env.TENANT_SCOPE_GUARD_API, "observe");

/** Cada cuánto se vuelca el resumen acumulado de observaciones (ms). */
const OBSERVE_SUMMARY_MS = Number(
  process.env.TENANT_SCOPE_OBSERVE_SUMMARY_MS || 10 * 60 * 1000
);

/**
 * Inventario de lo que el modo `observe` inyectaría.
 *
 * Se acumula en memoria en vez de loguear cada query por dos razones:
 *  1. Volumen. /api/send y familia son endpoints calientes; un warn por query
 *     sin filtro convierte el rollout de observación en un incidente de logs.
 *  2. Decidibilidad. Para decidir el paso a `enforce` hace falta el INVENTARIO
 *     de (superficie, ruta, modelo, operación) distintos, no N repeticiones del
 *     mismo. Cada combinación nueva se loguea una vez —esa línea es el hallazgo—
 *     y a partir de ahí solo suma al contador.
 */
type Observation = {
  surface: string;
  route: string;
  model: string;
  op: string;
  count: number;
  firstSeen: string;
};
const observations = new Map<string, Observation>();
let summaryTimer: NodeJS.Timeout | undefined;

/** Inventario acumulado, de más a menos frecuente. Para tests y diagnóstico. */
export const getTenantScopeObservations = (): Observation[] =>
  [...observations.values()].sort((a, b) => b.count - a.count);

export const resetTenantScopeObservations = (): void => {
  observations.clear();
};

const recordObservation = (
  ctx: any,
  options: any,
  op: string
): void => {
  const surface = ctx.tenantSurface || "http";
  const route = ctx.tenantRoute || "?";
  const model = options?.model?.name || "?";
  const key = `${surface}|${route}|${model}|${op}`;

  const existing = observations.get(key);
  if (existing) {
    existing.count += 1;
    return;
  }

  observations.set(key, {
    surface,
    route,
    model,
    op,
    count: 1,
    firstSeen: new Date().toISOString()
  });

  // Primera vez que se ve esta combinación → ESO es el hallazgo, se loguea.
  logger.warn(
    { companyId: ctx.companyId, traceId: ctx.traceId, model, surface, route, op },
    "[tenantScope] would inject companyId (query sin filtro de tenant)"
  );
};

/**
 * Vuelca el inventario cada OBSERVE_SUMMARY_MS. Es lo que se lee para decidir
 * el paso a `enforce`: si tras una ventana representativa solo aparecen rutas y
 * modelos esperados, el cambio es seguro. El timer va `unref()` para no
 * mantener el proceso vivo, y solo se arma si alguna superficie observa.
 */
const startObserveSummary = (): void => {
  if (summaryTimer) return;
  summaryTimer = setInterval(() => {
    const inv = getTenantScopeObservations();
    if (!inv.length) return;
    logger.warn(
      { total: inv.reduce((n, o) => n + o.count, 0), distinct: inv.length, inventory: inv },
      "[tenantScope] resumen de observación (candidatos a inyección de companyId)"
    );
  }, OBSERVE_SUMMARY_MS);
  summaryTimer.unref?.();
};

const hasOwn = (o: object, k: string): boolean =>
  Object.prototype.hasOwnProperty.call(o, k);

const isPlainObject = (v: any): boolean =>
  v != null &&
  typeof v === "object" &&
  (Object.getPrototypeOf(v) === Object.prototype ||
    Object.getPrototypeOf(v) === null);

/**
 * Devuelve un `where` equivalente al recibido pero acotado a `companyId`.
 * - undefined/null → { companyId }
 * - objeto plano sin companyId → { ...where, companyId } (preserva claves Symbol
 *   de Op.and/Op.or; el companyId entra como AND de nivel superior)
 * - objeto plano CON el MISMO companyId → se devuelve tal cual (ya scopeado)
 * - objeto plano CON OTRO companyId → **se sobrescribe con el del contexto**
 * - literal/Where/otro → AND explícito con Op.and para no perder el original
 * Devuelve la MISMA referencia cuando no hay nada que cambiar.
 *
 * ## Por qué se sobrescribe un companyId ajeno (cambio 2026-07-30)
 *
 * Antes, un `where` que YA traía `companyId` se respetaba sin mirar su valor. La
 * intención era no duplicar el filtro en servicios que ya scopean a mano — pero
 * el efecto real era que **el guard no cubría la forma más común del IDOR**:
 * cualquier endpoint que tome `companyId` del request (query param, body) y lo
 * pase al `where` se saltaba el guard entero.
 *
 * No es teórico. Lo cazó `tests/harness/crossTenant.dbtest.ts` en su primera
 * corrida: desde el contexto de la empresa A, un
 * `Ticket.findAll({ where: { companyId: B } })` devolvía los tickets de B. Y es
 * exactamente la familia de fuga que ya se había encontrado a mano antes
 * ("companyId del query ≠ el del token").
 *
 * Ahora el tenant del contexto autenticado es AUTORITATIVO. Para una request
 * HTTP no-super, pedir datos de otra empresa nunca es legítimo: el super-admin
 * ya está exento y existe `tenantBypass` para el caso deliberado.
 *
 * Cuando ocurre se loguea a `warn` — no debería pasar nunca, y si pasa es un bug
 * o un intento.
 */
export const scopeWhere = (where: any, companyId: number): any => {
  if (where == null) return { companyId };
  if (isPlainObject(where)) {
    if (hasOwn(where, "companyId")) {
      // Mismo tenant (o una forma que no sabemos comparar, tipo Op.in) → tal cual.
      if (where.companyId === companyId) return where;
      // DISTINTO tenant: el del contexto autenticado MANDA. Ver el bloque de
      // arriba — esta rama es la que cierra el IDOR de `companyId` en la query.
      return { ...where, companyId };
    }
    return { ...where, companyId };
  }
  return { [Op.and]: [where, { companyId }] };
};

/**
 * ¿La query pedía explícitamente OTRA empresa? Solo para poder loguearlo: que
 * esto ocurra es, o un bug, o un intento de IDOR. En ninguno de los dos casos
 * debe pasar en silencio.
 */
const asksForForeignTenant = (where: any, companyId: number): boolean =>
  isPlainObject(where) &&
  hasOwn(where, "companyId") &&
  where.companyId !== companyId;

/** Aplica el scope a las `options` de una operación ORM (in-place en enforce). */
const applyScope = (options: any, op = "find"): void => {
  // OJO: no se puede cortar aquí por `MODE === "off"`. El modo efectivo depende
  // de la superficie (ver effectiveMode más abajo), y con TENANT_SCOPE_GUARD=off
  // pero TENANT_SCOPE_GUARD_API=enforce la superficie api debe seguir scopeando.
  if (!options) return;

  const ctx = getTraceContext();
  if (!ctx || ctx.origin !== "http") return; // sólo requests HTTP
  if (ctx.companyId == null) return; // no autenticado / público
  if (ctx.super) return; // super-admin: cross-company legítimo
  if (ctx.tenantBypass === true) return; // bypass a nivel de contexto
  if (options.tenantBypass === true) return; // bypass a nivel de query

  // La superficie `api` tiene su propio modo (rollout gradual, ver API_MODE).
  const effectiveMode: Mode = ctx.tenantSurface === "api" ? API_MODE : MODE;
  if (effectiveMode === "off") return;

  const current = options.where;
  const foreign = asksForForeignTenant(current, ctx.companyId as number);
  const scoped = scopeWhere(current, ctx.companyId as number);
  if (scoped === current) return; // ya scopeado → nada que hacer

  if (foreign) {
    // No debería pasar nunca: una request autenticada de la empresa X pidiendo
    // datos de la Y. O es un bug (companyId tomado del request en vez del
    // token) o es un intento. Se loguea SIEMPRE, incluso en modo observe, y con
    // el modo efectivo dentro para saber si además se corrigió o solo se vio.
    logger.warn(
      {
        companyId: ctx.companyId,
        requestedCompanyId: (current as any)?.companyId,
        traceId: ctx.traceId,
        model: options?.model?.name,
        surface: ctx.tenantSurface || "http",
        route: ctx.tenantRoute,
        op,
        mode: effectiveMode
      },
      "[tenantScope] la query pedía OTRA empresa — companyId del contexto sobrescribe"
    );
  }

  if (effectiveMode === "observe") {
    recordObservation(ctx, options, op);
    return;
  }

  options.where = scoped;
};

/**
 * Registra los hooks de scope en todos los modelos que tengan `companyId`.
 * Llamar UNA vez tras `sequelize.addModels(...)`.
 */
export const installTenantScopeHooks = (models: any[]): void => {
  // Solo se saltan los hooks si AMBAS superficies están apagadas: con
  // TENANT_SCOPE_GUARD=off pero TENANT_SCOPE_GUARD_API=enforce hay que
  // engancharlos igual.
  if (MODE === "off" && API_MODE === "off") {
    logger.info("[tenantScope] DESACTIVADO (TENANT_SCOPE_GUARD=off)");
    return;
  }

  let hooked = 0;
  for (const model of models) {
    const attrs = model?.rawAttributes || {};
    if (!attrs.companyId) continue; // modelo global/no-tenant → no se toca

    // Nombrar los hooks evita duplicados si se recarga el módulo.
    // La operación se pasa explícita: en el inventario de `observe` importa
    // distinguir un find de un update/destroy sin filtro de tenant.
    model.addHook("beforeFind", "tenantScopeFind", (o: any) => applyScope(o, "find"));
    model.addHook("beforeCount", "tenantScopeCount", (o: any) => applyScope(o, "count"));
    model.addHook("beforeBulkDestroy", "tenantScopeDestroy", (o: any) => applyScope(o, "destroy"));
    model.addHook("beforeBulkUpdate", "tenantScopeUpdate", (o: any) => applyScope(o, "update"));
    hooked++;
  }

  if (MODE === "observe" || API_MODE === "observe") startObserveSummary();

  logger.info(
    `[tenantScope] modo=${MODE} · api=${API_MODE} · ${hooked} modelos tenant con hooks de aislamiento`
  );
};

export default { installTenantScopeHooks, scopeWhere };
