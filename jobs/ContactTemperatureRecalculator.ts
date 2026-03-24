/**
 * ContactTemperatureRecalculator
 *
 * Job que recalcula la temperatura de todos los contactos
 * de todas las empresas activas.
 *
 * Frecuencia recomendada: cada 2 horas (via cron en backendCronJobs.ts)
 */

import ContactTemperatureService from "../services/ContactTemperatureService";
import Company from "../models/Company";
import logger from "../utils/logger";

async function runContactTemperatureRecalculator(): Promise<void> {
  logger.info("[ContactTemperatureRecalculator] 🚀 Iniciando recálculo de temperaturas...");
  const startTime = Date.now();

  try {
    const companies = await Company.findAll({
      where: { status: "true" },
      attributes: ["id", "name"]
    });

    logger.info(`[ContactTemperatureRecalculator] 📊 Recalculando ${companies.length} empresas`);

    let totalProcessed = 0;
    let totalHot = 0;
    let totalWarm = 0;
    let totalCold = 0;

    for (const company of companies) {
      try {
        const result = await ContactTemperatureService.recalculateForCompany(company.id);
        totalProcessed += result.processed;
        totalHot += result.hot;
        totalWarm += result.warm;
        totalCold += result.cold;
      } catch (error: any) {
        logger.error(
          `[ContactTemperatureRecalculator] ❌ Error en empresa ${company.id} (${company.name}): ${error.message}`
        );
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `[ContactTemperatureRecalculator] ✅ Completado en ${duration}s — ` +
      `${totalProcessed} contactos: 🔥 ${totalHot} hot, 🟠 ${totalWarm} warm, 🔵 ${totalCold} cold`
    );
  } catch (error: any) {
    logger.error(`[ContactTemperatureRecalculator] ❌ Error fatal: ${error.message}`);
  }
}

export default runContactTemperatureRecalculator;
