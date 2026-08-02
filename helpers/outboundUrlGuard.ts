import { promises as dns } from "dns";
import { isIPv4 } from "net";
import { URL_REGEX as URL_REGEX_BAILEYS } from "baileys";

/**
 * Rechaza mensajes salientes cuyos enlaces apunten a la red interna.
 *
 * ## El agujero
 *
 * [2026-08-02] `link-preview-js` —que baileys usa para generar la tarjeta de
 * previsualización— no filtra loopback ni rangos privados (advisory de severidad
 * alta, sin parche upstream). Al enviar un mensaje con un enlace, el servidor pide
 * esa URL. Y `/api/send` acepta el texto de cualquier cliente con token: eso es una
 * SSRF con la red interna del NAS al otro lado.
 *
 * Dos cosas que hubo que comprobar en el código de baileys, porque la intuición
 * fallaba en ambas:
 *
 *   - **`generateHighQualityLinkPreview: false` NO cierra nada.** Esa opción solo
 *     decide si se sube la miniatura; la petición HTTP se hace igual.
 *   - **`getUrlInfo` no es inyectable.** El socket lo pasa hardcodeado en cada
 *     `sendMessage`, así que no se puede sustituir por uno seguro sin parchear la
 *     librería. Por eso el filtro va aquí, antes de llamar a baileys.
 *
 * ## Por qué se reutiliza la regex de baileys
 *
 * Se importa `URL_REGEX` de baileys en vez de escribir una propia. Si aquí se
 * detectara menos de lo que él detecta, el filtro dejaría pasar justo las URLs que
 * sí acaban pidiéndose — un colador con forma de guard. Al compartir la regex, lo
 * que baileys procese es exactamente lo que esto haya mirado, hoy y cuando la
 * cambien.
 *
 * De paso, esa regex acota el problema real: exige TLD alfabético, así que
 * `https://127.0.0.1:5434` ni siquiera dispara el preview. El vector es un DOMINIO
 * que resuelva a una IP interna, y por eso aquí se resuelve el nombre en vez de
 * mirar el texto.
 *
 * ## Lo que no cubre
 *
 * Queda la ventana entre esta resolución y la que hará link-preview-js (DNS
 * rebinding): un dominio puede devolver una IP pública ahora y una interna un
 * segundo después. Cerrarla del todo exige resolver una vez y forzar esa IP en la
 * petición, que es justo lo que no se puede hacer sin parchear baileys. Esto sube el
 * listón de "manda una URL" a "monta un DNS con TTL 0 y acierta con la ventana".
 */

/** Rangos que nunca deberían alcanzarse desde un mensaje de un tercero. */
const esIPv4Interna = (ip: string): boolean => {
  const o = ip.split(".").map(Number);
  if (o.length !== 4 || o.some(n => Number.isNaN(n))) return true; // raro → se bloquea
  const [a, b] = o;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // privada
  if (a === 127) return true; // loopback
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a === 169 && b === 254) return true; // link-local (metadata de nube)
  if (a === 172 && b >= 16 && b <= 31) return true; // privada
  if (a === 192 && b === 168) return true; // privada
  if (a === 192 && b === 0) return true; // 192.0.0.0/24 y 192.0.2.0/24
  if (a === 198 && (b === 18 || b === 19)) return true; // benchmarking
  if (a === 198 && b === 51) return true; // documentación
  if (a === 203 && b === 0) return true; // documentación
  if (a >= 224) return true; // multicast y reservado
  return false;
};

const esIPv6Interna = (ip: string): boolean => {
  const s = ip.toLowerCase();
  // IPv4 mapeada (::ffff:127.0.0.1): se valida como IPv4 o el filtro se saltaría
  // entero escribiendo la misma dirección de otra forma.
  const mapeada = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapeada) return esIPv4Interna(mapeada[1]);
  if (s === "::1" || s === "::") return true;
  if (s.startsWith("fe80:")) return true; // link-local
  const primer = parseInt(s.split(":")[0] || "0", 16);
  if ((primer & 0xfe00) === 0xfc00) return true; // fc00::/7 ULA
  return false;
};

export const esDireccionInterna = (ip: string): boolean =>
  isIPv4(ip) ? esIPv4Interna(ip) : esIPv6Interna(ip);

/**
 * Copia literal de la regex de baileys (Defaults/index.js), como red de seguridad.
 *
 * Solo se usa si el import no trae un RegExp. Pasó: importando de
 * `baileys/lib/Defaults/index.js` funcionaba bajo ESM y bajo ts-jest llegaba como
 * otra cosa, así que `new RegExp(...)` reventaba con "Cannot convert object to
 * primitive value". El error era ruidoso y se vio enseguida; lo peligroso habría sido
 * lo contrario —que llegara algo que no casa nunca— porque entonces este guard
 * dejaría de detectar enlaces sin que nada lo dijera.
 *
 * Si esta copia entra en uso, el aviso lo deja escrito.
 */
const URL_REGEX_COPIA =
  /https:\/\/(?![^:@/\s]+:[^:@/\s]+@)[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(:\d+)?(\/[^\s]*)?/;

const fuenteRegex = (): string => {
  if (URL_REGEX_BAILEYS instanceof RegExp) return URL_REGEX_BAILEYS.source;
  // eslint-disable-next-line no-console
  console.warn(
    "[outboundUrlGuard] baileys no expuso URL_REGEX como RegExp; se usa la copia " +
      "local. Comprobar que sigue coincidiendo con la suya tras actualizar baileys."
  );
  return URL_REGEX_COPIA.source;
};

/** Extrae los enlaces que baileys convertiría en previsualización. */
export const extraerEnlaces = (texto: string | null | undefined): string[] => {
  if (!texto) return [];
  // La regex es global y con estado: se clona para que llamadas seguidas no se
  // pisen el lastIndex entre sí.
  const re = new RegExp(fuenteRegex(), "g");
  return texto.match(re) || [];
};

export interface EnlaceBloqueado {
  url: string;
  host: string;
  motivo: string;
}

/**
 * Comprueba UNA url concreta, la haya escrito quien la haya escrito.
 *
 * Es distinto de `enlacesInternos`, y la diferencia importa. Aquella busca enlaces
 * dentro de un texto con la regex de baileys, que exige TLD alfabético: contra ella
 * `http://127.0.0.1:5434` ni siquiera cuenta como enlace.
 *
 * Pero `/api/send/linkImage` recibe una url COMO PARÁMETRO y se la pasa a baileys en
 * `image: { url }`, que la descarga tal cual — sin regex, sin TLD, sin nada. Ahí una
 * IP literal sí funciona, así que ese vector es más directo que el de la
 * previsualización: no hace falta controlar un dominio, basta con escribir la
 * dirección.
 *
 * Devuelve el motivo del bloqueo, o null si se puede pedir.
 */
export const urlInterna = async (
  url: string | null | undefined,
  timeoutMs = 3000
): Promise<EnlaceBloqueado | null> => {
  if (!url) return null;

  let parsed: URL;
  try {
    parsed = new URL(String(url));
  } catch {
    return null; // no es una url; que la rechace quien la use
  }

  // Solo http/https. Un `file://` o un `gopher://` no son "enlaces raros": son otra
  // familia de ataque, y aquí no hay ningún caso legítimo que los necesite.
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return {
      url: String(url),
      host: parsed.hostname,
      motivo: `el esquema ${parsed.protocol} no está permitido`
    };
  }

  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  try {
    const direcciones = await Promise.race([
      dns.lookup(host, { all: true, verbatim: true }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error("timeout")), timeoutMs)
      )
    ]);
    const interna = direcciones.find(d => esDireccionInterna(d.address));
    if (interna) {
      return {
        url: String(url),
        host,
        motivo: `resuelve a ${interna.address}, que es una dirección interna`
      };
    }
  } catch {
    return null; // no resuelve → no es alcanzable → no es una SSRF
  }
  return null;
};

/**
 * Devuelve los enlaces del texto que apuntan a la red interna. Vacío = se puede
 * enviar.
 *
 * Un host que no resuelve NO se bloquea: no es alcanzable, así que no es una SSRF, y
 * bloquearlo convertiría cualquier caída de DNS en un rechazo de mensajes legítimos.
 */
export const enlacesInternos = async (
  texto: string | null | undefined,
  timeoutMs = 3000
): Promise<EnlaceBloqueado[]> => {
  const enlaces = extraerEnlaces(texto);
  if (!enlaces.length) return [];

  const bloqueados: EnlaceBloqueado[] = [];
  for (const url of enlaces) {
    let host: string;
    try {
      host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    } catch {
      continue; // si no es una URL válida, baileys tampoco la va a pedir
    }

    try {
      const direcciones = await Promise.race([
        dns.lookup(host, { all: true, verbatim: true }),
        new Promise<never>((_, rej) =>
          setTimeout(() => rej(new Error("timeout")), timeoutMs)
        )
      ]);
      const interna = direcciones.find(d => esDireccionInterna(d.address));
      if (interna) {
        bloqueados.push({
          url,
          host,
          motivo: `resuelve a ${interna.address}, que es una dirección interna`
        });
      }
    } catch {
      // No resuelve o tarda demasiado: no es alcanzable, no se bloquea.
      continue;
    }
  }
  return bloqueados;
};

export default enlacesInternos;
