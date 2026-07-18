import { Op } from "sequelize";
import CampaignMessage from "../../models/CampaignMessage";
import FacebookConversionEvent from "../../models/FacebookConversionEvent";

/**
 * CountCampaignMessagesByStatusService — Conteos TOTALES (toda la BD, no la página) por estado
 * de conversión, para mostrar en los botones de filtro de la 2da tabla de FacebookConversions.
 *
 *   - all              → todas las campaign messages de la empresa
 *   - sent             → cuyo contacto YA tiene conversión Purchase enviada (sent/success)
 *   - pending          → contacto sin conversión enviada Y con valor (nota con monto > 0)
 *   - pending_no_value → contacto sin conversión enviada Y sin valor (nota vacía / sin monto)
 *
 * Debe cumplirse: all === sent + pending + pending_no_value.
 * Multi-tenant: todo filtra por companyId.
 */

export interface CampaignMessageStatusCounts {
  all: number;
  sent: number;
  pending: number;
  pending_no_value: number;
}

const HAS_VALUE_REGEXP = "[1-9]"; // aprox de monto > 0 (ej "$100", "50", "0.5")

const CountCampaignMessagesByStatusService = async ({
  companyId,
  channel
}: {
  companyId: number;
  channel?: string;
}): Promise<CampaignMessageStatusCounts> => {
  const base: any = { companyId };
  if (channel) base.channel = channel;

  const all = await CampaignMessage.count({ where: base });

  // Contactos con conversión Purchase enviada.
  const sentEvents = await FacebookConversionEvent.findAll({
    where: {
      companyId,
      eventName: "Purchase",
      responseStatus: { [Op.in]: ["sent", "success"] }
    },
    attributes: ["contactId"],
    group: ["contactId"]
  });
  const sentContactIds = sentEvents
    .map((e: any) => Number(e.contactId))
    .filter((id: number) => Number.isFinite(id) && id > 0);

  const sent = sentContactIds.length
    ? await CampaignMessage.count({
        where: { ...base, contactId: { [Op.in]: sentContactIds } }
      })
    : 0;

  const pendingBase: any = { ...base };
  if (sentContactIds.length) {
    pendingBase.contactId = { [Op.notIn]: sentContactIds };
  }

  const pending = await CampaignMessage.count({
    where: { ...pendingBase, conversionNote: { [Op.regexp]: HAS_VALUE_REGEXP } }
  });

  const pending_no_value = await CampaignMessage.count({
    where: {
      ...pendingBase,
      [Op.or]: [
        { conversionNote: null as any },
        { conversionNote: "" },
        { conversionNote: { [Op.notRegexp]: HAS_VALUE_REGEXP } }
      ]
    }
  });

  return { all, sent, pending, pending_no_value };
};

export default CountCampaignMessagesByStatusService;
