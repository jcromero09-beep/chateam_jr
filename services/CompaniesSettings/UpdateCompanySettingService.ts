/**
 * @TercioSantos-0 |
 * serviço/atualizar 1 configuração da empresa |
 * @params:companyId/column(name)/data
 *
 * Whitelist (Fase 5 — seguridad):
 * Valida que `column` corresponda a un atributo declarado en el modelo
 * CompaniesSettings antes de inyectarlo en SQL crudo. Bloquea inyecciones
 * por nombre de columna y modificaciones a campos no autorizados (id,
 * companyId, createdAt, updatedAt).
 */
import sequelize from "../../database";
import CompaniesSettings from "../../models/CompaniesSettings";
import AppError from "../../errors/AppError";

type Params = {
  companyId: number;
  column: string;
  data: string | null;
};

// Columnas que NUNCA pueden modificarse vía este endpoint
const PROTECTED_COLUMNS = new Set<string>([
  "id",
  "companyId",
  "createdAt",
  "updatedAt"
]);

// Whitelist derivada del modelo (se evalúa en cada llamada por si se agregan
// columnas nuevas en runtime tras agregarlas al modelo + migración).
const buildAllowedColumns = (): Set<string> => {
  const attrs = Object.keys(CompaniesSettings.rawAttributes || {});
  return new Set(attrs.filter(c => !PROTECTED_COLUMNS.has(c)));
};

const UpdateCompanySettingsService = async ({
  companyId,
  column,
  data
}: Params): Promise<any> => {
  // 1. Validar que `column` sea string no vacío y solo contenga caracteres seguros
  if (
    !column ||
    typeof column !== "string" ||
    !/^[A-Za-z][A-Za-z0-9_]*$/.test(column)
  ) {
    throw new AppError("Nombre de columna inválido", 400);
  }

  // 2. Validar contra whitelist (atributos del modelo)
  const allowed = buildAllowedColumns();
  if (!allowed.has(column)) {
    throw new AppError(
      `Columna '${column}' no permitida en CompaniesSettings`,
      400
    );
  }

  const value =
    data === null || data === undefined || data === "null" ? null : data;

  const [results] = await sequelize.query(
    `UPDATE "CompaniesSettings" SET "${column}"=:value WHERE "companyId"=:companyId`,
    { replacements: { value, companyId } }
  );

  return results;
};

export default UpdateCompanySettingsService;
