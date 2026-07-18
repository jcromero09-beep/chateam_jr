// [Plan Fase 2 · Ola B · E4.1] ROAS + CPA REALES por campaña/conjunto/anuncio.
// Reemplaza el mock `Math.random` (marketingApi.ts, sin uso en backend).
//   ROAS = Σ ventas atribuidas (AttributionConversions.totalRevenue, unidas por
//          ticket → CampaignMessages.campaignId) ÷ Σ spend (InsightsDaily).
//   CPA  = spend ÷ nº de conversiones atribuidas.
// Honesto: si no hay spend o no hay datos suficientes, devuelve roas=null +
// dataStatus='insufficient' (no inventa números).
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import Stats from "../StatisticsService"; // [Ola D · G4]

export interface RoasRow {
  campaignId: string;
  campaignName: string | null;
  spend: number;
  revenue: number;
  conversions: number;
  conversations: number;
  roas: number | null;
  cpa: number | null;
  dataStatus: "ok" | "no_spend" | "insufficient";
  // [Ola D · G4] IC 95% REAL del CPA (n = conversiones). Reemplaza el confidence
  // inventado: si la muestra no llega a n mínimo, marca insufficient con el n que falta.
  cpaConfidence: { low: number; high: number; margin: number; sufficient: boolean; nNeed?: number } | null;
}

interface Params {
  companyId: number;
  since?: string; // YYYY-MM-DD
  until?: string; // YYYY-MM-DD
}

export async function getRoasByCampaign({ companyId, since, until }: Params): Promise<{
  rows: RoasRow[];
  overview: { totalSpend: number; totalRevenue: number; totalConversions: number; averageRoas: number | null; campaigns: number };
}> {
  // 1. Ventas atribuidas + conversaciones por campaña (una conversación = un CampaignMessage con campaignId).
  const attribution = await sequelize.query<any>(
    `SELECT cm."campaignId"                                   AS "campaignId",
            MAX(cm."campaignName")                            AS "campaignName",
            COUNT(DISTINCT cm.id)                             AS conversations,
            COUNT(DISTINCT ac.id)                             AS conversions,
            COALESCE(SUM(DISTINCT ac."totalRevenue"), 0)      AS revenue
       FROM "CampaignMessages" cm
       LEFT JOIN "AttributionConversions" ac
              ON ac."ticketId" = cm."ticketId" AND ac."companyId" = cm."companyId"
      WHERE cm."companyId" = :companyId AND cm."campaignId" IS NOT NULL
      GROUP BY cm."campaignId"`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );

  // 2. Spend por campaña desde InsightsDaily (con rango opcional).
  const dateFilter = since && until ? `AND "date" BETWEEN :since AND :until` : "";
  const spendRows = await sequelize.query<any>(
    `SELECT "campaignId" AS "campaignId", COALESCE(SUM(spend),0) AS spend
       FROM "InsightsDaily"
      WHERE "companyId" = :companyId AND "campaignId" IS NOT NULL ${dateFilter}
      GROUP BY "campaignId"`,
    { replacements: { companyId, since, until }, type: QueryTypes.SELECT }
  );
  const spendByCampaign = new Map<string, number>();
  for (const s of spendRows) spendByCampaign.set(String(s.campaignId), Number(s.spend) || 0);

  // 3. Merge + cálculo.
  const rows: RoasRow[] = attribution.map((a: any) => {
    const spend = spendByCampaign.get(String(a.campaignId)) || 0;
    const revenue = Number(a.revenue) || 0;
    const conversions = Number(a.conversions) || 0;
    const conversations = Number(a.conversations) || 0;
    const roas = spend > 0 ? Number((revenue / spend).toFixed(4)) : null;
    const cpa = spend > 0 && conversions > 0 ? Number((spend / conversions).toFixed(2)) : null;
    const dataStatus: RoasRow["dataStatus"] = spend === 0 ? "no_spend" : conversions === 0 ? "insufficient" : "ok";
    // [Ola D · G4] IC 95% del CPA por método delta sobre spend/conversiones.
    let cpaConfidence: RoasRow["cpaConfidence"] = null;
    if (spend > 0 && conversions > 0) {
      const ci = Stats.ratioCI(spend, conversions);
      cpaConfidence = ci.sufficient
        ? { low: Number(ci.low.toFixed(2)), high: Number(ci.high.toFixed(2)), margin: Number(ci.margin.toFixed(2)), sufficient: true }
        : { low: 0, high: 0, margin: 0, sufficient: false, nNeed: (ci as any).nNeed };
    }
    return { campaignId: String(a.campaignId), campaignName: a.campaignName ?? null, spend, revenue, conversions, conversations, roas, cpa, dataStatus, cpaConfidence };
  });

  // Campañas con spend pero sin conversaciones atribuidas (aún así relevantes).
  for (const [campaignId, spend] of spendByCampaign) {
    if (!rows.find(r => r.campaignId === campaignId)) {
      rows.push({ campaignId, campaignName: null, spend, revenue: 0, conversions: 0, conversations: 0, roas: 0, cpa: null, dataStatus: "insufficient", cpaConfidence: null });
    }
  }

  rows.sort((a, b) => b.spend - a.spend || b.revenue - a.revenue);

  const totalSpend = rows.reduce((s, r) => s + r.spend, 0);
  const totalRevenue = rows.reduce((s, r) => s + r.revenue, 0);
  const totalConversions = rows.reduce((s, r) => s + r.conversions, 0);
  return {
    rows,
    overview: {
      totalSpend: Number(totalSpend.toFixed(2)),
      totalRevenue: Number(totalRevenue.toFixed(2)),
      totalConversions,
      averageRoas: totalSpend > 0 ? Number((totalRevenue / totalSpend).toFixed(4)) : null,
      campaigns: rows.length
    }
  };
}

export default { getRoasByCampaign };
