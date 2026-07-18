import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";
import logger from "../../utils/logger";

/**
 * SyncLegacyCreditsService — Puente entre el sistema legacy de tokens
 * (Company.aiTokenBalance + AISubplan) y el nuevo sistema granular
 * (AICreditBalance + AICreditType).
 *
 * Se invoca cuando:
 * 1. Se compra un subplan via Stripe/MercadoPago
 * 2. Se agregan créditos manuales
 * 3. Se inicializa una company nueva
 *
 * Mapeo: 1 token legacy = 1 crédito tipo "message"
 */

/**
 * Sincroniza tokens comprados al nuevo sistema de créditos.
 * Suma los tokens al totalCredits del tipo "message" en AICreditBalance.
 */
const syncSubplanToCredits = async (
  companyId: number,
  tokens: number
): Promise<{ synced: boolean; creditTypeKey: string; addedCredits: number }> => {
  try {
    // Buscar tipo de crédito "message" (el equivalente genérico)
    const creditType = await AICreditType.findOne({
      where: { key: "message", isActive: true }
    });

    if (!creditType) {
      logger.warn(
        `[SyncLegacyCredits] Tipo "message" no encontrado. Tokens no sincronizados para company ${companyId}`
      );
      return { synced: false, creditTypeKey: "message", addedCredits: 0 };
    }

    // Buscar o crear balance
    let balance = await AICreditBalance.findOne({
      where: { companyId, creditTypeId: creditType.id }
    });

    if (!balance) {
      balance = await AICreditBalance.create({
        companyId,
        creditTypeId: creditType.id,
        totalCredits: 0,
        usedCredits: 0
      } as any);
    }

    // Sumar tokens al balance total
    const previousTotal = Number(balance.totalCredits);
    await balance.update({
      totalCredits: previousTotal + tokens
    });

    logger.info(
      `[SyncLegacyCredits] Sincronizado: company=${companyId}, ` +
      `tokens=${tokens}, totalCredits: ${previousTotal} -> ${previousTotal + tokens}`
    );

    return {
      synced: true,
      creditTypeKey: "message",
      addedCredits: tokens
    };
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Error desconocido";
    logger.error(`[SyncLegacyCredits] Error sincronizando: ${message}`);
    return { synced: false, creditTypeKey: "message", addedCredits: 0 };
  }
};

/**
 * Sincroniza créditos de imágenes desde el sistema legacy.
 */
const syncImageCredits = async (
  companyId: number,
  credits: number
): Promise<{ synced: boolean }> => {
  try {
    const creditType = await AICreditType.findOne({
      where: { key: "image", isActive: true }
    });

    if (!creditType) {
      return { synced: false };
    }

    let balance = await AICreditBalance.findOne({
      where: { companyId, creditTypeId: creditType.id }
    });

    if (!balance) {
      balance = await AICreditBalance.create({
        companyId,
        creditTypeId: creditType.id,
        totalCredits: 0,
        usedCredits: 0
      } as any);
    }

    await balance.update({
      totalCredits: Number(balance.totalCredits) + credits
    });

    logger.info(
      `[SyncLegacyCredits] Imágenes sincronizadas: company=${companyId}, credits=${credits}`
    );

    return { synced: true };
  } catch {
    return { synced: false };
  }
};

export default {
  syncSubplanToCredits,
  syncImageCredits
};
