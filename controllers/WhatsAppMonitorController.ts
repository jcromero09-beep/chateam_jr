/**
 * 📊 WHATSAPP MONITOR CONTROLLER - JR CHATEAM v6.0.0
 *
 * Endpoints para dashboard de monitoreo WhatsApp
 *
 * @version 2.0.0 - Fase 2
 * @date 14 de octubre de 2025
 */

import { Request, Response } from "express";
import { whatsappMonitor } from "../monitoring/whatsappMonitor";
import { whatsappRateLimiter } from "../utils/rateLimiterRedis";
import { antiBanManager } from "../utils/antiBan";
import AppError from "../errors/AppError";

/**
 * 📊 Obtener métricas globales del sistema
 */
export const getGlobalMetrics = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const metrics = whatsappMonitor.getGlobalMetrics();

    if (!metrics) {
      throw new AppError("ERR_NO_METRICS_AVAILABLE", 404);
    }

    return res.status(200).json(metrics);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🏥 Obtener estado de salud de todas las conexiones
 */
export const getAllHealthStatuses = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const allStatuses = await whatsappMonitor.getAllHealthStatuses();

    // Filtrar por company
    const companyStatuses = allStatuses.filter(
      status => status.companyId === companyId
    );

    return res.status(200).json(companyStatuses);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🏥 Obtener estado de salud de una conexión específica
 */
export const getWhatsappHealth = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { whatsappId } = req.params;
    const { companyId } = req.user;

    const health = await whatsappMonitor.getWhatsappHealth(parseInt(whatsappId));

    if (!health) {
      throw new AppError("ERR_WHATSAPP_NOT_FOUND", 404);
    }

    // Verificar que pertenece a la company
    if (health.companyId !== companyId) {
      throw new AppError("ERR_FORBIDDEN", 403);
    }

    return res.status(200).json(health);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🔒 Obtener métricas de rate limiting
 */
export const getRateLimitMetrics = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const metrics = await whatsappRateLimiter.getMetrics();
    return res.status(200).json(metrics);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🛡️ Obtener métricas de anti-ban
 */
export const getAntiBanMetrics = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const metrics = antiBanManager.getGlobalMetrics();
    return res.status(200).json(metrics);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🔓 Desbloquear conversación por rate limit
 */
export const unblockConversation = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { conversationId } = req.params;

    await whatsappRateLimiter.unblockConversation(conversationId);

    return res.status(200).json({
      message: "Conversación desbloqueada exitosamente",
      conversationId
    });
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 🔄 Reset frecuencia de conversación
 */
export const resetConversationFrequency = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { conversationId } = req.params;

    antiBanManager.resetFrequency(conversationId);
    await whatsappRateLimiter.resetConversation(conversationId);

    return res.status(200).json({
      message: "Frecuencia de conversación reseteada",
      conversationId
    });
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};

/**
 * 📊 Dashboard completo (métricas consolidadas)
 */
export const getDashboard = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;

    const [
      globalMetrics,
      healthStatuses,
      rateLimitMetrics,
      antiBanMetrics
    ] = await Promise.all([
      whatsappMonitor.getGlobalMetrics(),
      whatsappMonitor.getAllHealthStatuses(),
      whatsappRateLimiter.getMetrics(),
      Promise.resolve(antiBanManager.getGlobalMetrics())
    ]);

    // Filtrar por company
    const companyHealthStatuses = healthStatuses.filter(
      status => status.companyId === companyId
    );

    const dashboard = {
      global: globalMetrics,
      whatsapps: companyHealthStatuses,
      rateLimit: rateLimitMetrics,
      antiBan: antiBanMetrics,
      timestamp: new Date()
    };

    return res.status(200).json(dashboard);
  } catch (error) {
    throw new AppError(error.message, 500);
  }
};
