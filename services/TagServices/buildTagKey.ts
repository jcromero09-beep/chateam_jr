import { Op } from "sequelize";
import Tag from "../../models/Tag";

/**
 * Convierte un texto en un slug seguro para usar como `key` de etiqueta.
 * Ej: "Venta / Lead Caliente" → "venta-lead-caliente"
 */
export const slugify = (input: string): string => {
  return (input || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // quitar acentos
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-") // no alfanumérico → guion
    .replace(/^-+|-+$/g, "") // sin guiones extremos
    .slice(0, 60);
};

/**
 * Genera un `key` único por empresa a partir del nombre. Si el slug base
 * ya existe en la company, agrega sufijo numérico (-2, -3, ...).
 *
 * @param name        Nombre de la etiqueta (fuente del slug)
 * @param companyId   Empresa (multi-tenant)
 * @param ignoreTagId Tag a ignorar en la verificación de unicidad (al editar)
 */
export const buildUniqueTagKey = async (
  name: string,
  companyId: number,
  ignoreTagId?: number
): Promise<string> => {
  const base = slugify(name) || "etapa";

  const where: any = { companyId, key: { [Op.like]: `${base}%` } };
  if (ignoreTagId) where.id = { [Op.ne]: ignoreTagId };

  const existing = await Tag.findAll({
    where,
    attributes: ["key"]
  });

  const taken = new Set(
    existing.map(t => (t.key || "").toLowerCase()).filter(Boolean)
  );

  if (!taken.has(base)) return base;

  let suffix = 2;
  while (taken.has(`${base}-${suffix}`)) suffix += 1;
  return `${base}-${suffix}`;
};

export default buildUniqueTagKey;
