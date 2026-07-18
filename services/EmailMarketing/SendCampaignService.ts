import EmailCampaign from "../../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import ContactList from "../../models/ContactList";
import ContactListItem from "../../models/ContactListItem";
import AICreditBalance from "../../models/AICreditBalance";
import AICreditType from "../../models/AICreditType";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

// ============================================================================
// Interfaces
// ============================================================================

interface SendCampaignRequest {
  companyId: number;
  campaignId: number;
  userId: number;
}

interface SendCampaignResponse {
  campaignId: number;
  totalRecipients: number;
  status: "queued";
}

// ============================================================================
// SendCampaignService
// ============================================================================

/**
 * Prepara una campana de email para envio masivo.
 *
 * Este servicio NO envia los emails directamente.
 * Solo prepara la campana: valida estado, verifica creditos,
 * crea los registros de recipients y actualiza el status.
 * El envio real ocurre en el job de BullMQ.
 *
 * Flujo:
 * 1. Carga la campana con su lista de contactos
 * 2. Verifica que el status sea INACTIVA o PROGRAMADA
 * 3. Verifica que haya creditos suficientes para todos los recipients
 * 4. Actualiza el status a EN_ANDAMENTO
 * 5. Carga los contactos de la lista y crea EmailCampaignRecipient por cada uno
 * 6. Retorna resumen para que el job de BullMQ procese el envio
 */
const SendCampaignService = async ({
  companyId,
  campaignId,
  userId
}: SendCampaignRequest): Promise<SendCampaignResponse> => {

  // 1. Cargar campana con relaciones
  const campaign = await EmailCampaign.findOne({
    where: { id: campaignId, companyId },
    include: [
      { model: ContactList, as: "contactList" },
      { model: EmailCampaignRecipient, as: "recipients" }
    ]
  });

  if (!campaign) {
    throw new AppError("ERR_EMAIL_CAMPAIGN_NOT_FOUND", 404);
  }

  // 2. Verificar estado valido para envio
  const validStatuses = ["INACTIVA", "PROGRAMADA"];
  if (!validStatuses.includes(campaign.status)) {
    throw new AppError(
      `La campana no puede enviarse en estado "${campaign.status}". ` +
      `Solo se permite enviar campanas con estado INACTIVA o PROGRAMADA.`,
      400
    );
  }

  // 3. Verificar que tenga lista de contactos asociada
  if (!campaign.contactListId) {
    throw new AppError(
      "La campana no tiene una lista de contactos asignada",
      400
    );
  }

  // 4. Cargar contactos de la lista con email valido
  const contacts = await ContactListItem.findAll({
    where: {
      contactListId: campaign.contactListId,
      companyId
    }
  });

  // Filtrar solo contactos con email no vacio
  const validContacts = contacts.filter(
    (c: ContactListItem) => c.email && c.email.trim() !== ""
  );

  if (validContacts.length === 0) {
    throw new AppError(
      "La lista de contactos no tiene contactos con email valido",
      400
    );
  }

  const totalRecipients = validContacts.length;

  // 5. Verificar creditos disponibles
  const creditType = await AICreditType.findOne({
    where: { key: "email_send", isActive: true }
  });

  if (!creditType) {
    throw new AppError("ERR_AI_CREDIT_TYPE_NOT_FOUND", 404);
  }

  const balance = await AICreditBalance.findOne({
    where: {
      companyId,
      creditTypeId: creditType.id
    }
  });

  if (!balance) {
    throw new AppError("ERR_AI_NO_CREDIT_BALANCE", 402);
  }

  const remaining = Number(balance.totalCredits) - Number(balance.usedCredits);

  if (remaining < totalRecipients) {
    throw new AppError(
      `Creditos de email insuficientes. Requiere ${totalRecipients}, ` +
      `disponibles ${remaining}. Adquiera un paquete adicional de emails.`,
      402
    );
  }

  // 6. Actualizar estado de la campana
  await campaign.update({
    status: "EN_ANDAMENTO",
    totalRecipients,
    createdBy: userId
  });

  // 7. Crear registros de recipients para cada contacto
  const recipientRecords = validContacts.map((contact: ContactListItem) => ({
    campaignId: campaign.id,
    companyId,
    contactId: contact.id,
    email: contact.email,
    name: contact.name || "",
    status: "pending",
    personalizationData: {
      name: contact.name || "",
      email: contact.email,
      number: contact.number || ""
    }
  }));

  await EmailCampaignRecipient.bulkCreate(recipientRecords);

  logger.info(
    `[SendCampaignService] Campana preparada: campaignId=${campaignId}, ` +
    `companyId=${companyId}, userId=${userId}, totalRecipients=${totalRecipients}, ` +
    `status=queued`
  );

  return {
    campaignId: campaign.id,
    totalRecipients,
    status: "queued"
  };
};

export default SendCampaignService;
