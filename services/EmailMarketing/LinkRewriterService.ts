/**
 * LinkRewriterService — Email Marketing Fase 2
 * Reescribe links en HTML para tracking de clicks y agrega tracking pixel para opens.
 */

import logger from "../../utils/logger";

/**
 * Reescribir todos los links <a href="..."> en el HTML para pasar por tracking.
 * - No reescribe links mailto:
 * - No reescribe links que ya contienen /tracking/ (evitar doble reescritura)
 * - No reescribe links de unsubscribe que ya son tracking
 *
 * @param html - HTML original del email
 * @param recipientId - ID del recipient para tracking
 * @param baseUrl - URL base del backend (ej: https://appro.chateam.ws)
 * @returns HTML con links reescritos
 */
export const rewriteLinks = (
  html: string,
  recipientId: number,
  baseUrl: string
): string => {
  if (!html || !recipientId || !baseUrl) {
    return html;
  }

  try {
    // Regex para encontrar <a href="..."> (con comillas simples o dobles)
    const linkRegex = /<a\s+([^>]*?)href\s*=\s*["']([^"']+)["']([^>]*?)>/gi;

    const rewrittenHtml = html.replace(
      linkRegex,
      (match: string, before: string, url: string, after: string): string => {
        // No reescribir mailto: links
        if (url.startsWith("mailto:")) {
          return match;
        }

        // No reescribir links que ya son de tracking
        if (url.includes("/tracking/")) {
          return match;
        }

        // No reescribir anchors internos (#)
        if (url.startsWith("#")) {
          return match;
        }

        // No reescribir tel: links
        if (url.startsWith("tel:")) {
          return match;
        }

        // Construir URL de tracking
        const trackingUrl = `${baseUrl}/tracking/click/${recipientId}?url=${encodeURIComponent(url)}`;

        return `<a ${before}href="${trackingUrl}"${after}>`;
      }
    );

    return rewrittenHtml;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[LinkRewriterService] Error reescribiendo links para recipient ${recipientId}: ${err.message}`
    );
    // En caso de error, retornar HTML original sin modificar
    return html;
  }
};

/**
 * Agregar tracking pixel (imagen 1x1 invisible) al HTML para detectar aperturas.
 * Se inserta antes de </body> si existe, o al final del HTML.
 *
 * @param html - HTML del email
 * @param recipientId - ID del recipient
 * @param baseUrl - URL base del backend
 * @returns HTML con tracking pixel insertado
 */
export const addTrackingPixel = (
  html: string,
  recipientId: number,
  baseUrl: string
): string => {
  if (!html || !recipientId || !baseUrl) {
    return html;
  }

  try {
    const trackingPixel = `<img src="${baseUrl}/tracking/open/${recipientId}" width="1" height="1" style="display:none" alt="" />`;

    // Intentar insertar antes de </body>
    if (html.includes("</body>")) {
      return html.replace("</body>", `${trackingPixel}</body>`);
    }

    // Si no hay </body>, insertar antes de </html>
    if (html.includes("</html>")) {
      return html.replace("</html>", `${trackingPixel}</html>`);
    }

    // Si no hay ninguno, agregar al final
    return html + trackingPixel;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[LinkRewriterService] Error agregando tracking pixel para recipient ${recipientId}: ${err.message}`
    );
    return html;
  }
};

/**
 * Agregar link de unsubscribe al HTML.
 * Se inserta antes de </body> si existe.
 *
 * @param html - HTML del email
 * @param recipientId - ID del recipient
 * @param baseUrl - URL base del backend
 * @returns HTML con link de unsubscribe
 */
export const addUnsubscribeLink = (
  html: string,
  recipientId: number,
  baseUrl: string
): string => {
  if (!html || !recipientId || !baseUrl) {
    return html;
  }

  try {
    const unsubscribeUrl = `${baseUrl}/tracking/unsubscribe/${recipientId}`;
    const unsubscribeHtml = `
      <div style="text-align:center;padding:20px 0;font-size:12px;color:#999;">
        <p>Si no deseas recibir mas emails, puedes <a href="${unsubscribeUrl}" style="color:#666;text-decoration:underline;">desuscribirte aqui</a>.</p>
      </div>`;

    if (html.includes("</body>")) {
      return html.replace("</body>", `${unsubscribeHtml}</body>`);
    }

    if (html.includes("</html>")) {
      return html.replace("</html>", `${unsubscribeHtml}</html>`);
    }

    return html + unsubscribeHtml;
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(
      `[LinkRewriterService] Error agregando unsubscribe link para recipient ${recipientId}: ${err.message}`
    );
    return html;
  }
};

/**
 * Procesar HTML completo: reescribir links + agregar tracking pixel + agregar unsubscribe
 * Funcion de conveniencia que aplica todas las transformaciones.
 *
 * @param html - HTML original
 * @param recipientId - ID del recipient
 * @param baseUrl - URL base del backend
 * @returns HTML procesado con tracking completo
 */
export const processHtmlForTracking = (
  html: string,
  recipientId: number,
  baseUrl: string
): string => {
  let processed = html;

  // 1. Reescribir links para tracking de clicks
  processed = rewriteLinks(processed, recipientId, baseUrl);

  // 2. Agregar link de unsubscribe
  processed = addUnsubscribeLink(processed, recipientId, baseUrl);

  // 3. Agregar tracking pixel (al final, para que sea lo ultimo antes de </body>)
  processed = addTrackingPixel(processed, recipientId, baseUrl);

  return processed;
};
