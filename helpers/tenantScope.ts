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

const MODE: Mode = (() => {
  const v = (process.env.TENANT_SCOPE_GUARD || "enforce").toLowerCase();
  if (v === "observe") return "observe";
  if (v === "off") return "off";
  return "enforce";
})();

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
 * - objeto plano CON companyId → se devuelve tal cual (ya scopeado)
 * - literal/Where/otro → AND explícito con Op.and para no perder el original
 * Devuelve la MISMA referencia cuando no hay nada que cambiar.
 */
export const scopeWhere = (where: any, companyId: number): any => {
  if (where == null) return { companyId };
  if (isPlainObject(where)) {
    if (hasOwn(where, "companyId")) return where;
    return { ...where, companyId };
  }
  return { [Op.and]: [where, { companyId }] };
};

/** Aplica el scope a las `options` de una operación ORM (in-place en enforce). */
const applyScope = (options: any): void => {
  if (MODE === "off" || !options) return;

  const ctx = getTraceContext();
  if (!ctx || ctx.origin !== "http") return; // sólo requests HTTP
  if (ctx.companyId == null) return; // no autenticado / público
  if (ctx.super) return; // super-admin: cross-company legítimo
  if (ctx.tenantBypass === true) return; // bypass a nivel de contexto
  if (options.tenantBypass === true) return; // bypass a nivel de query

  const current = options.where;
  const scoped = scopeWhere(current, ctx.companyId as number);
  if (scoped === current) return; // ya scopeado → nada que hacer

  if (MODE === "observe") {
    logger.warn(
      {
        companyId: ctx.companyId,
        traceId: ctx.traceId,
        model: options?.model?.name
      },
      "[tenantScope] would inject companyId (query sin filtro de tenant)"
    );
    return;
  }

  options.where = scoped;
};

/**
 * Registra los hooks de scope en todos los modelos que tengan `companyId`.
 * Llamar UNA vez tras `sequelize.addModels(...)`.
 */
export const installTenantScopeHooks = (models: any[]): void => {
  if (MODE === "off") {
    logger.info("[tenantScope] DESACTIVADO (TENANT_SCOPE_GUARD=off)");
    return;
  }

  let hooked = 0;
  for (const model of models) {
    const attrs = model?.rawAttributes || {};
    if (!attrs.companyId) continue; // modelo global/no-tenant → no se toca

    // Nombrar los hooks evita duplicados si se recarga el módulo.
    model.addHook("beforeFind", "tenantScopeFind", applyScope);
    model.addHook("beforeCount", "tenantScopeCount", applyScope);
    model.addHook("beforeBulkDestroy", "tenantScopeDestroy", applyScope);
    model.addHook("beforeBulkUpdate", "tenantScopeUpdate", applyScope);
    hooked++;
  }

  logger.info(
    `[tenantScope] modo=${MODE} · ${hooked} modelos tenant con hooks de aislamiento`
  );
};

export default { installTenantScopeHooks, scopeWhere };
