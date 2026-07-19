import Announcement from "../../models/Announcement";
import Company from "../../models/Company";
import AppError from "../../errors/AppError";

interface BroadcastData {
  title: string;
  text: string;
  priority?: string | number;
  // "all" = todas las empresas activas · un número = una empresa específica (1-a-1).
  target: "all" | number | string;
}

/**
 * Comunicado masivo del super admin: crea un Announcement por empresa destino.
 * Reusa el modelo/flujo per-empresa existente (cada empresa ve sus anuncios vía GET /announcements),
 * así que un broadcast = una fila por empresa. status "true" para que ListService (status:true) lo muestre.
 */
const BroadcastService = async (
  data: BroadcastData
): Promise<{ created: number; target: string }> => {
  const { title, text, target } = data;

  if (!title?.trim() || !text?.trim()) {
    throw new AppError("ERR_ANNOUNCEMENT_REQUIRED");
  }
  const priority = Number(data.priority) || 1;

  let companyIds: number[];
  if (target === "all") {
    const companies = await Company.findAll({
      where: { status: true },
      attributes: ["id"]
    });
    companyIds = companies.map((c) => c.id);
  } else {
    const companyId = Number(target);
    if (!companyId || Number.isNaN(companyId)) {
      throw new AppError("ERR_INVALID_TARGET", 400);
    }
    const company = await Company.findByPk(companyId);
    if (!company) {
      throw new AppError("ERR_NO_COMPANY_FOUND", 404);
    }
    companyIds = [companyId];
  }

  if (companyIds.length === 0) {
    return { created: 0, target: String(target) };
  }

  const rows = companyIds.map((companyId) => ({
    title: title.trim(),
    text: text.trim(),
    priority,
    status: "true",
    companyId
  }));
  await Announcement.bulkCreate(rows as any);

  return { created: companyIds.length, target: target === "all" ? "all" : String(target) };
};

export default BroadcastService;
