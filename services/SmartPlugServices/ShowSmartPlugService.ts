/**
 * Service: ShowSmartPlugService
 * Devuelve una toma de la company. Aisla el chequeo de pertenencia para que
 * ningun caller pueda leer una toma de otro tenant por id.
 */

import SmartPlug from "../../models/SmartPlug";
import AppError from "../../errors/AppError";

const ShowSmartPlugService = async (
  plugId: number,
  companyId: number
): Promise<SmartPlug> => {
  const plug = await SmartPlug.findOne({ where: { id: plugId, companyId } });

  if (!plug) {
    throw new AppError("ERR_SMART_PLUG_NOT_FOUND", 404);
  }

  return plug;
};

export default ShowSmartPlugService;
