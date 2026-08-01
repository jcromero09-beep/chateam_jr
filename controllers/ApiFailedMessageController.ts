/**
 * ApiFailedMessageController — bandeja de mensajes de la API que fallaron.
 *
 * [2026-08-01] Extraído VERBATIM de ApiController (-181 L). Primer lote de la
 * descomposición de ese fichero, que tenía 2.201 líneas y hasta hoy ningún test.
 *
 * Se eligió este bloque a propósito para estrenar el método aquí: es el más pequeño
 * de los tres candidatos, el único con red por encima
 * (tests/harness/apiController.dbtest.ts cubre el aislamiento entre empresas de
 * `listFailedMessages`) y el que menos duele si sale mal — al contrario que
 * `index` (/api/send), que es por donde entra el tráfico que factura.
 *
 * Contrato medido antes de mover con tests/harness/wbotTopLevelDeps.cjs: 0
 * dependencias del resto de ApiController, 0 símbolos sin resolver y ningún uso de
 * los tres handlers fuera del bloque. Por eso sale entero y no deja ciclo: lo único
 * que había que actualizar es a quién apuntan las rutas.
 *
 * Los tres handlers usan `isAuth` (JWT de usuario), no `tokenAuth`: son de la
 * consola, no de la API pública. Ver routes/apiRoutes.ts.
 */
import { Request, Response } from "express";
import { Op } from "sequelize";

import ApiFailedMessage from "../models/ApiFailedMessage";
import Whatsapp from "../models/Whatsapp";
import {
  sendTextDynamic,
  sendTemplateDynamic,
} from "../services/MetaServices/metaSendService";

export const listFailedMessages = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { status, endpoint, page = 1, limit = 20 } = req.query;

    const where: any = { companyId };
    if (status && status !== "all") {
      where.status = status;
    }
    if (endpoint && endpoint !== "all") {
      where.endpoint = endpoint;
    }

    const offset = (Number(page) - 1) * Number(limit);

    const { count, rows: messages } = await ApiFailedMessage.findAndCountAll({
      where,
      order: [["createdAt", "DESC"]],
      limit: Number(limit),
      offset,
      include: [
        {
          model: Whatsapp,
          as: "whatsapp",
          attributes: ["id", "name", "number"],
        },
      ],
    });

    return res.status(200).json({
      success: true,
      messages,
      pagination: {
        total: count,
        page: Number(page),
        limit: Number(limit),
        pages: Math.ceil(count / Number(limit)),
      },
    });
  } catch (error: any) {
    console.error("❌ Error listando mensajes fallidos:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error al listar mensajes fallidos",
    });
  }
};

export const retryFailedMessage = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const failedMessage = await ApiFailedMessage.findOne({
      where: { id, companyId, status: { [Op.in]: ["pending", "failed"] } },
    });

    if (!failedMessage) {
      return res.status(404).json({
        success: false,
        error: "Mensaje fallido no encontrado o ya procesado",
      });
    }

    // Obtener la conexión WhatsApp — Multi-tenant: filtrar por companyId aunque failedMessage ya lo valida (defensa en profundidad)
    const whatsapp = await Whatsapp.findOne({
      where: { id: failedMessage.whatsappId, companyId },
    });
    if (!whatsapp) {
      return res.status(400).json({
        success: false,
        error: "Conexión WhatsApp no encontrada",
      });
    }

    // Reenviar el mensaje según el endpoint
    const phoneNumberId =
      whatsapp.phoneNumberId || whatsapp.facebookPageUserId || whatsapp.number;
    const accessToken = whatsapp.tokenMeta;

    if (!accessToken || !phoneNumberId) {
      return res.status(400).json({
        success: false,
        error: "Conexión META no configurada correctamente",
      });
    }

    const toNumber = String(failedMessage.number).replace(/[\s\-\+]/g, "");
    const metadata = failedMessage.metadata || {};

    console.log(`🔄 [RETRY] Reenviando mensaje a ${toNumber}`);

    if (failedMessage.endpoint === "send-template") {
      // Reenviar plantilla
      console.log(
        `🔄 [RETRY] Template: ${metadata.template_name}, Params: ${JSON.stringify(metadata.params)}, Botones: ${JSON.stringify(metadata.buttons)}`,
      );
      await sendTemplateDynamic(
        toNumber,
        metadata.template_name,
        phoneNumberId,
        accessToken,
        metadata.params || metadata.template_params || [],
        metadata.template_lang || metadata.language || "es",
        metadata.buttons || [],
      );
    } else {
      // Reenviar texto normal
      await sendTextDynamic(
        toNumber,
        failedMessage.message,
        phoneNumberId,
        accessToken,
      );
    }

    // Actualizar estado del mensaje fallido
    await failedMessage.update({
      status: "retried",
      retryCount: failedMessage.retryCount + 1,
    });

    console.log(`✅ [RETRY] Mensaje reenviado exitosamente a ${toNumber}`);

    return res.status(200).json({
      success: true,
      message: "Mensaje reenviado exitosamente",
      retryCount: failedMessage.retryCount + 1,
    });
  } catch (error: any) {
    console.error("❌ Error reenviando mensaje:", error.message);

    // Actualizar el mensaje fallido con el nuevo error
    const { id } = req.params;
    const { companyId } = req.user as any;

    const failedMessage = await ApiFailedMessage.findOne({
      where: { id, companyId },
    });
    if (failedMessage) {
      await failedMessage.update({
        error: error.message,
        retryCount: failedMessage.retryCount + 1,
      });
    }

    return res.status(400).json({
      success: false,
      error: error.message || "Error al reenviar mensaje",
    });
  }
};

export const deleteFailedMessage = async (
  req: Request,
  res: Response,
): Promise<Response> => {
  try {
    const { companyId } = req.user as any;
    const { id } = req.params;

    const failedMessage = await ApiFailedMessage.findOne({
      where: { id, companyId },
    });

    if (!failedMessage) {
      return res.status(404).json({
        success: false,
        error: "Mensaje fallido no encontrado",
      });
    }

    await failedMessage.destroy();

    return res.status(200).json({
      success: true,
      message: "Mensaje fallido eliminado",
    });
  } catch (error: any) {
    console.error("❌ Error eliminando mensaje fallido:", error.message);
    return res.status(500).json({
      success: false,
      error: "Error al eliminar mensaje fallido",
    });
  }
};
