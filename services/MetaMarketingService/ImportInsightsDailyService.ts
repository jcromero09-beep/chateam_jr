// [Plan Fase 2 · Ola B · D5.1] Job horario: importa insights de la Marketing API
// y hace UPSERT en InsightsDaily (snapshot del día por campaña). Alimenta el ROAS
// real (E4.1). Fail-safe: un error de company/campaña no detiene el resto.
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import InsightsDaily from "../../models/InsightsDaily";
import { getCampaigns } from "./index";
import logger from "../../utils/logger";

function num(v: any): number {
  const n = typeof v === "string" ? parseFloat(v) : Number(v);
  return Number.isFinite(n) ? n : 0;
}

async function companiesWithAds(): Promise<number[]> {
  const rows = await sequelize.query<any>(
    `SELECT "companyId" FROM "CompaniesSettings"
      WHERE "facebookSystemUserToken" IS NOT NULL AND "facebookSystemUserToken" <> ''`,
    { type: QueryTypes.SELECT }
  );
  return rows.map(r => Number(r.companyId)).filter(Boolean);
}

export interface ImportResult { companies: number; campaigns: number; errors: number; }

export default async function ImportInsightsDailyService(): Promise<ImportResult> {
  const today = new Date().toISOString().split("T")[0];
  const result: ImportResult = { companies: 0, campaigns: 0, errors: 0 };

  let companyIds: number[] = [];
  try { companyIds = await companiesWithAds(); } catch (e: any) {
    logger.warn(`[ImportInsightsDaily] no se pudo listar companies: ${e.message}`);
    return result;
  }

  for (const companyId of companyIds) {
    result.companies++;
    try {
      const campaigns = await getCampaigns(companyId, { includeInsights: true } as any);
      for (const c of campaigns || []) {
        try {
          const ins = c.insights || c; // los campos vienen flat o bajo .insights
          await InsightsDaily.upsert({
            companyId,
            date: today,
            level: "campaign",
            objectId: String(c.id),
            campaignId: String(c.id),
            name: c.name ?? null,
            spend: num(ins.spend),
            impressions: num(ins.impressions),
            clicks: num(ins.clicks),
            cpm: num(ins.cpm),
            cpc: num(ins.cpc),
            ctr: num(ins.ctr),
            frequency: num(ins.frequency),
            conversationsStarted: num(ins.conversationsStarted),
            costPerConversation: num(ins.costPerConversation),
            raw: ins ?? null
          } as any);
          result.campaigns++;
        } catch (ce: any) {
          result.errors++;
          logger.warn(`[ImportInsightsDaily] campaña ${c?.id} (company ${companyId}): ${ce.message}`);
        }
      }
    } catch (e: any) {
      result.errors++;
      logger.warn(`[ImportInsightsDaily] company ${companyId}: ${e.message}`);
    }
  }

  logger.info(
    `[ImportInsightsDaily] ${today}: ${result.companies} companies, ${result.campaigns} campañas, ${result.errors} errores`
  );
  return result;
}
