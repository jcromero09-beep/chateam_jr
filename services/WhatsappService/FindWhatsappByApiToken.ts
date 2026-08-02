import Whatsapp from "../../models/Whatsapp";
import { hashSecret } from "../../helpers/secretCrypto";

/**
 * Resuelve la conexión a partir del token de API que manda el cliente.
 *
 * [Incidente 2026-08-01] Existe para que esta consulta se escriba UNA vez.
 *
 * `Whatsapps.token` se cifra en reposo desde el 26/07 con IV aleatorio, así que
 * `where: { token }` no puede encontrar nada nunca. Ese `where` estaba copiado en
 * SIETE sitios —el middleware y seis handlers que lo repetían por su cuenta— y los
 * siete se rompieron a la vez sin que nadie lo notara: la API pública devolvió 401
 * y 403 durante seis días.
 *
 * Arreglar los siete por separado habría dejado el mismo terreno para el próximo
 * cambio de esquema. Ahora hay un solo sitio que sabe cómo se busca un token, y si
 * el modelo vuelve a cambiar solo hay que tocar aquí.
 *
 * Devuelve null si no hay token o no corresponde a ninguna conexión: quien llama
 * decide qué código de estado usar (el middleware da 403; los handlers, 401 — se
 * respeta la diferencia porque es contrato con las integraciones que ya existen).
 */
const FindWhatsappByApiToken = async (
  token: string | null | undefined
): Promise<Whatsapp | null> => {
  if (!token) return null;
  return Whatsapp.findOne({ where: { tokenHash: hashSecret(token) } });
};

export default FindWhatsappByApiToken;
