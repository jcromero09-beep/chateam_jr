/**
 * Service: DeleteSmartPlugService
 * Elimina el registro de una toma y descarta su sesion cacheada.
 *
 * Es un borrado real: la fila es solo el registro de acceso al dispositivo
 * (no guarda historico). Para dejar de operar una toma sin perder el registro
 * esta el flag `active` en UpdateSmartPlugService.
 */

import logger from "../../utils/logger";
import { invalidateSession } from "./TapoDriver";
import ShowSmartPlugService from "./ShowSmartPlugService";

const DeleteSmartPlugService = async (
  plugId: number,
  companyId: number
): Promise<void> => {
  const plug = await ShowSmartPlugService(plugId, companyId);

  const { host } = plug;
  await plug.destroy();
  invalidateSession(plugId);

  logger.info(
    `[DeleteSmartPlugService] Toma eliminada: id=${plugId}, host=${host}, company=${companyId}`
  );
};

export default DeleteSmartPlugService;
