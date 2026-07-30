/**
 * tokenFingerprint — identificar un secreto en los logs SIN exponerlo.
 *
 * ## Por qué
 *
 * El patrón `token.substring(0, 20) + "..."` estaba repetido en cinco sitios. Es
 * tentador porque parece prudente, pero no lo es:
 *
 *  - **Filtra material del secreto.** 20 o 30 caracteres de un token no permiten
 *    reconstruirlo, pero sí es más de lo que hace falta para nada, y los logs de
 *    PM2 son ficheros de decenas de MB con permisos amplios que nadie rota.
 *  - **Es innecesario.** Lo que se quiere responder en un log es "¿está puesto?"
 *    y "¿sigue siendo el mismo de antes?". Una huella hash responde a las dos
 *    igual de bien y no es reversible.
 *
 * Se devuelve también la longitud porque distingue un token real de un valor de
 * relleno o truncado, que es un fallo de configuración habitual.
 *
 * @example
 *   logger.info(`token: ${tokenFingerprint(t)}`)
 *   // token: SET (len=211, sha256:9f2a1c4b7e08)
 */
import { createHash } from "crypto";

export const tokenFingerprint = (token?: string | null): string => {
  if (!token) return "NOT SET";
  const sha = createHash("sha256").update(token).digest("hex").slice(0, 12);
  return `SET (len=${token.length}, sha256:${sha})`;
};

export default tokenFingerprint;
