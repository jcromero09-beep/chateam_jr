import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";

/**
 * GetCreditsSummaryService
 *
 * Devuelve un resumen agregado del balance UNIFICADO de creditos IA de la
 * company. Consumido por las UIs que muestran "creditos disponibles" en
 * tiempo real (AIWriter, AIMultimodal, AIAudio, AICredits, etc.).
 *
 * Estructura:
 *   {
 *     totalCredits: 1250,
 *     totalUsed: 342,
 *     totalRemaining: 908,
 *     byType: [
 *       { key, name, unit, totalCredits, usedCredits, remaining, isActive }
 *     ],
 *     byKey: { message: { ... }, image: { ... } },
 *     asOf: "2026-05-03T22:33:00Z"
 *   }
 *
 * El "byKey" facilita lectura O(1) desde el front.
 *
 * Solo agrega tipos con isActive=true.
 *
 * Autor: ChatEAM JR — Unificacion de cobro IA (2026-05-03)
 */

interface Request {
  companyId: number;
  /** Si se especifica, devolver solo balances de estas keys. */
  keys?: string[];
}

export interface CreditSummaryEntry {
  key: string;
  name: string;
  unit: string;
  totalCredits: number;
  usedCredits: number;
  remaining: number;
  isActive: boolean;
}

export interface CreditsSummaryResponse {
  totalCredits: number;
  totalUsed: number;
  totalRemaining: number;
  byType: CreditSummaryEntry[];
  byKey: Record<string, CreditSummaryEntry>;
  asOf: string;
}

const GetCreditsSummaryService = async ({
  companyId,
  keys
}: Request): Promise<CreditsSummaryResponse> => {
  const balances = await AICreditBalance.findAll({
    where: { companyId },
    include: [
      {
        model: AICreditType,
        as: "creditType",
        attributes: ["id", "key", "name", "unit", "isActive"],
        where: { isActive: true },
        required: true
      }
    ],
    order: [[{ model: AICreditType, as: "creditType" }, "name", "ASC"]]
  });

  const byType: CreditSummaryEntry[] = [];
  const byKey: Record<string, CreditSummaryEntry> = {};
  let totalCredits = 0;
  let totalUsed = 0;

  for (const b of balances) {
    const ct = (b as any).creditType as AICreditType | null;
    if (!ct) continue;
    if (keys && keys.length > 0 && !keys.includes(ct.key)) continue;

    const t = Number(b.totalCredits) || 0;
    const u = Number(b.usedCredits) || 0;
    const r = Math.max(0, t - u);

    const entry: CreditSummaryEntry = {
      key: ct.key,
      name: ct.name,
      unit: ct.unit,
      totalCredits: t,
      usedCredits: u,
      remaining: r,
      isActive: ct.isActive
    };

    byType.push(entry);
    byKey[ct.key] = entry;
    totalCredits += t;
    totalUsed += u;
  }

  return {
    totalCredits,
    totalUsed,
    totalRemaining: Math.max(0, totalCredits - totalUsed),
    byType,
    byKey,
    asOf: new Date().toISOString()
  };
};

export default GetCreditsSummaryService;
