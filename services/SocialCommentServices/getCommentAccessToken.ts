import Whatsapp from "../../models/Whatsapp";

/**
 * Resuelve el access token a usar para operaciones de comentarios
 * (Graph API de Facebook/Instagram) sobre una conexión Meta.
 *
 * Orden de resolución:
 * 1. pageAccessToken    — flujo "Conectar página" (ConnectPageService)
 * 2. facebookUserToken  — page token persistido por storeFacebook
 *                         (nombre confuso: es token de PÁGINA, no de usuario)
 * 3. tokenMeta          — token de USUARIO (expirable), último recurso
 */
const getCommentAccessToken = (whatsapp: Whatsapp): string | null =>
  whatsapp.pageAccessToken ||
  whatsapp.facebookUserToken ||
  whatsapp.tokenMeta ||
  null;

export default getCommentAccessToken;
