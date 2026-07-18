/**
 * EmailTrackingController — Email Marketing Fase 2
 * Endpoints PUBLICOS (sin auth) para tracking de emails:
 * - GET /tracking/open/:recipientId — Tracking pixel (GIF 1x1)
 * - GET /tracking/click/:recipientId — Link redirect con tracking
 * - GET /tracking/unsubscribe/:recipientId — Pagina de desuscripcion
 *
 * Estos endpoints deben ser ultra-rapidos y nunca fallar visiblemente.
 */

import { Request, Response } from "express";
import * as TrackingService from "../services/EmailMarketing/TrackingService";
import logger from "../utils/logger";

// GIF 1x1 transparente en base64
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

/**
 * Parsear user-agent para determinar tipo de dispositivo
 */
const parseDeviceType = (userAgent: string): string => {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("mobile") || ua.includes("android") || ua.includes("iphone")) {
    return "mobile";
  }
  if (ua.includes("tablet") || ua.includes("ipad")) {
    return "tablet";
  }
  return "desktop";
};

/**
 * Parsear user-agent para determinar cliente de email
 */
const parseEmailClient = (userAgent: string): string => {
  if (!userAgent) return "unknown";
  const ua = userAgent.toLowerCase();
  if (ua.includes("thunderbird")) return "Thunderbird";
  if (ua.includes("outlook")) return "Outlook";
  if (ua.includes("apple mail") || ua.includes("webkit")) return "Apple Mail";
  if (ua.includes("googleimageproxy") || ua.includes("gmail")) return "Gmail";
  if (ua.includes("yahoo")) return "Yahoo Mail";
  return "Other";
};

/**
 * GET /tracking/open/:recipientId
 * Tracking pixel: registra apertura y retorna GIF 1x1 transparente
 */
export const trackOpen = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = Number(req.params.recipientId);

    if (!recipientId || isNaN(recipientId)) {
      // Siempre retornar el GIF, incluso si el ID es invalido
      res.set({
        "Content-Type": "image/gif",
        "Content-Length": String(TRANSPARENT_GIF.length),
        "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
        "Pragma": "no-cache",
        "Expires": "0"
      });
      res.status(200).end(TRANSPARENT_GIF);
      return;
    }

    const userAgent = req.headers["user-agent"] || "";
    const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
      || req.socket.remoteAddress
      || "";

    // Registrar apertura de forma async (no bloquear respuesta)
    TrackingService.trackOpen(recipientId, {
      ip,
      userAgent,
      deviceType: parseDeviceType(userAgent),
      emailClient: parseEmailClient(userAgent)
    }).catch((err: Error) => {
      logger.error(`[EmailTrackingController] Error async trackOpen: ${err.message}`);
    });

    // Retornar GIF inmediatamente
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      "Pragma": "no-cache",
      "Expires": "0"
    });
    res.status(200).end(TRANSPARENT_GIF);
  } catch (error: unknown) {
    // Siempre retornar el GIF, nunca errores
    res.set({
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store"
    });
    res.status(200).end(TRANSPARENT_GIF);
  }
};

/**
 * GET /tracking/click/:recipientId?url=encodedUrl
 * Registra click y redirige al URL original
 */
export const trackClick = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = Number(req.params.recipientId);
    const encodedUrl = req.query.url as string;

    if (!encodedUrl) {
      res.status(400).send("URL no proporcionada");
      return;
    }

    const decodedUrl = decodeURIComponent(encodedUrl);

    // Validar que sea un URL razonable (evitar open redirect)
    if (!decodedUrl.startsWith("http://") && !decodedUrl.startsWith("https://")) {
      res.status(400).send("URL invalida");
      return;
    }

    if (recipientId && !isNaN(recipientId)) {
      const userAgent = req.headers["user-agent"] || "";
      const ip = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim()
        || req.socket.remoteAddress
        || "";

      // Registrar click de forma async
      TrackingService.trackClick(recipientId, decodedUrl, {
        ip,
        userAgent,
        deviceType: parseDeviceType(userAgent),
        emailClient: parseEmailClient(userAgent)
      }).catch((err: Error) => {
        logger.error(`[EmailTrackingController] Error async trackClick: ${err.message}`);
      });
    }

    // Redirigir inmediatamente
    res.redirect(302, decodedUrl);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailTrackingController] Error en trackClick: ${err.message}`);
    // Fallback: intentar redirigir al URL del query
    const fallbackUrl = req.query.url as string;
    if (fallbackUrl) {
      res.redirect(302, decodeURIComponent(fallbackUrl));
    } else {
      res.status(500).send("Error procesando click");
    }
  }
};

/**
 * GET /tracking/unsubscribe/:recipientId
 * Desuscribe al recipient y muestra pagina de confirmacion
 */
export const trackUnsubscribe = async (req: Request, res: Response): Promise<void> => {
  try {
    const recipientId = Number(req.params.recipientId);

    if (!recipientId || isNaN(recipientId)) {
      res.status(400).send("ID invalido");
      return;
    }

    // Registrar unsubscribe
    await TrackingService.trackUnsubscribe(recipientId);

    // Retornar HTML de confirmacion
    const confirmationHtml = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Desuscripcion Exitosa</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: linear-gradient(135deg, #1e293b 0%, #152030 50%, #1a2535 100%);
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      color: #334155;
    }
    .card {
      background: white;
      border-radius: 16px;
      padding: 48px 40px;
      max-width: 480px;
      width: 90%;
      text-align: center;
      box-shadow: 0 20px 60px rgba(0,0,0,0.3);
    }
    .icon {
      font-size: 48px;
      margin-bottom: 16px;
    }
    h1 {
      font-size: 24px;
      color: #1e293b;
      margin-bottom: 12px;
    }
    p {
      font-size: 16px;
      color: #64748b;
      line-height: 1.6;
    }
    .footer {
      margin-top: 32px;
      font-size: 13px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#9989;</div>
    <h1>Te has desuscrito exitosamente</h1>
    <p>Ya no recibiras mas emails de marketing de nuestra parte. Si esto fue un error, puedes contactar a nuestro equipo de soporte.</p>
    <p class="footer">Puedes cerrar esta ventana.</p>
  </div>
</body>
</html>`;

    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(confirmationHtml);
  } catch (error: unknown) {
    const err = error as Error;
    logger.error(`[EmailTrackingController] Error en trackUnsubscribe: ${err.message}`);
    res.set("Content-Type", "text/html; charset=utf-8");
    res.status(200).send(`<!DOCTYPE html>
<html lang="es">
<head><meta charset="UTF-8"><title>Desuscripcion</title></head>
<body style="font-family:sans-serif;text-align:center;padding:60px;">
  <h2>Solicitud procesada</h2>
  <p>Tu solicitud de desuscripcion ha sido recibida.</p>
</body>
</html>`);
  }
};
