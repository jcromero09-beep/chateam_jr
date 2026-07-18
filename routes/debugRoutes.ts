// Rutas temporales de diagnóstico - BORRAR DESPUÉS
import { Router, Request, Response } from "express";
import WebChatWidget from "../models/WebChatWidget";
import Whatsapp from "../models/Whatsapp";
import Queue from "../models/Queue";
import sequelize from "../database";

const debugRoutes = Router();

// GET /debug/webchat/:apiKey - Verificar widget directamente
debugRoutes.get("/webchat/:apiKey", async (req: Request, res: Response) => {
  const { apiKey } = req.params;

  try {
    console.log('[DEBUG ROUTE] Testing connection...');

    // Test conexión
    await sequelize.authenticate();
    console.log('[DEBUG ROUTE] DB Connection OK');

    // Query directa
    const [result] = await sequelize.query(`
      SELECT id, "companyId", name, "apiKey", status
      FROM "WebChatWidgets"
      WHERE "apiKey" = :apiKey
    `, {
      replacements: { apiKey }
    });

    console.log('[DEBUG ROUTE] Raw query result:', result);

    // Query con modelo simple
    const widgetSimple = await WebChatWidget.findOne({
      where: { apiKey }
    });
    console.log('[DEBUG ROUTE] Simple model query:', widgetSimple?.toJSON());

    // Query con includes (como el servicio real)
    let widgetWithIncludes = null;
    let includeError = null;
    try {
      widgetWithIncludes = await WebChatWidget.findOne({
        where: { apiKey, status: true },
        include: [
          {
            model: Whatsapp,
            as: "whatsapp",
            attributes: ["id", "name", "status", "channel"]
          },
          {
            model: Queue,
            as: "queue",
            attributes: ["id", "name", "color"]
          }
        ]
      });
      console.log('[DEBUG ROUTE] With includes:', widgetWithIncludes?.toJSON());
    } catch (err: any) {
      includeError = err.message;
      console.error('[DEBUG ROUTE] Include error:', err.message);
    }

    return res.json({
      dbConnected: true,
      rawQueryResult: result,
      simpleModelResult: widgetSimple ? {
        id: widgetSimple.id,
        name: widgetSimple.name,
        apiKey: widgetSimple.apiKey,
        status: widgetSimple.status,
        whatsappId: widgetSimple.whatsappId,
        queueId: widgetSimple.queueId
      } : null,
      withIncludesResult: widgetWithIncludes ? {
        id: widgetWithIncludes.id,
        name: widgetWithIncludes.name,
        whatsapp: widgetWithIncludes.whatsapp,
        queue: widgetWithIncludes.queue
      } : null,
      includeError
    });
  } catch (error: any) {
    console.error('[DEBUG ROUTE] Error:', error);
    return res.status(500).json({
      error: error.message,
      stack: error.stack
    });
  }
});

export default debugRoutes;
