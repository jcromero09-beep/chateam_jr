import Whatsapp from "../../models/Whatsapp";

/**
 * Conexiones de la MISMA empresa que comparten el token de usuario de Facebook.
 *
 * Una sesión de Facebook puede haber dado de alta varias páginas o cuentas de
 * Instagram a la vez; todas comparten `facebookUserToken`. Al desconectar una hay
 * que arrastrar el resto, y para eso hace falta agruparlas.
 *
 * [Incidente 2026-08-01] `facebookUserToken` está cifrado en reposo con IV aleatorio
 * (commit bc102f7), así que `where: { facebookUserToken }` dejó de encontrar nada:
 * el valor que se compara sale del getter YA DESCIFRADO y la columna guarda el texto
 * cifrado. Desde el 26/07 desconectar una conexión de Facebook/Instagram no arrastra
 * ninguna otra.
 *
 * El where roto tapaba además algo peor. WhatsAppController hacía:
 *
 *     await Whatsapp.destroy({ where: { facebookUserToken } });   // sin companyId
 *
 * Con el token a null eso es `WHERE "facebookUserToken" IS NULL`, que alcanza a
 * conexiones de CUALQUIER empresa. Por eso aquí un token vacío devuelve la lista
 * vacía en vez de "todas las que también lo tienen vacío": agrupar por ausencia de
 * token no significa nada, y quien llama borra lo que esto devuelva.
 *
 * La comparación se hace en memoria porque no hay forma de consultar por igualdad
 * contra una columna cifrada con IV aleatorio. El conjunto está acotado a las
 * conexiones de una empresa, así que el coste es irrelevante.
 */
const FindWhatsappsBySameFacebookToken = async (
  whatsapp: Whatsapp
): Promise<Whatsapp[]> => {
  const { facebookUserToken, companyId } = whatsapp;
  if (!facebookUserToken || companyId == null) return [];

  const candidatas = await Whatsapp.findAll({ where: { companyId } });
  // El getter descifra al leer, así que aquí se comparan valores en claro.
  return candidatas.filter(w => w.facebookUserToken === facebookUserToken);
};

export default FindWhatsappsBySameFacebookToken;
