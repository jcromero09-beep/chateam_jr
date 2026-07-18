// [Plan Fase 2 · Ola B · B5.1/E3.1] Registro MANUAL del monto de venta sobre un
// ticket → crea/actualiza AttributionConversion.totalRevenue. Este revenue lo
// consume el ROAS real (RoasService) uniendo por ticketId → CampaignMessage.campaignId.
//
// NOTA: el modelo `AttributionConversion` tiene drift (declara columnas que la
// tabla no tiene) → se usa SQL crudo sobre las columnas REALES para evitarlo.
import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import Ticket from "../../models/Ticket";
import AppError from "../../errors/AppError";

interface Params {
  companyId: number;
  ticketId: number;
  amount: number;
  currency?: string;
  orderId?: string;
}

interface SaleResult { id: number; totalRevenue: number; }

const RegisterSaleService = async ({
  companyId,
  ticketId,
  amount,
  currency = "USD",
  orderId
}: Params): Promise<SaleResult> => {
  if (!ticketId) throw new AppError("ticketId requerido", 400);
  if (!(amount >= 0)) throw new AppError("amount inválido", 400);

  const ticket = await Ticket.findOne({ where: { id: ticketId, companyId } });
  if (!ticket) throw new AppError("Ticket no encontrado", 404);
  const contactId = (ticket as any).contactId;

  const existing = await sequelize.query<any>(
    `SELECT id FROM "AttributionConversions" WHERE "companyId"=:companyId AND "ticketId"=:ticketId LIMIT 1`,
    { replacements: { companyId, ticketId }, type: QueryTypes.SELECT }
  );

  if (existing.length) {
    const id = existing[0].id;
    await sequelize.query(
      `UPDATE "AttributionConversions"
          SET "conversionType"='Purchase', "conversionValue"=:amount, "totalRevenue"=:amount,
              currency=:currency, "orderId"=COALESCE(:orderId,"orderId"), "orderDate"=NOW(), "updatedAt"=NOW()
        WHERE id=:id`,
      { replacements: { amount, currency, orderId: orderId ?? null, id }, type: QueryTypes.UPDATE }
    );
    return { id, totalRevenue: amount };
  }

  const inserted = await sequelize.query<any>(
    `INSERT INTO "AttributionConversions"
       ("companyId","contactId","ticketId","conversionType","conversionValue","totalRevenue",currency,"orderId","orderDate","createdAt","updatedAt")
     VALUES (:companyId,:contactId,:ticketId,'Purchase',:amount,:amount,:currency,:orderId,NOW(),NOW(),NOW())
     RETURNING id`,
    { replacements: { companyId, contactId, ticketId, amount, currency, orderId: orderId ?? null }, type: QueryTypes.SELECT }
  );

  return { id: inserted[0]?.id, totalRevenue: amount };
};

export default RegisterSaleService;
