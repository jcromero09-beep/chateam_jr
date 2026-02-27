import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import { isNil } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import { Op } from "sequelize";

interface Request {
  name: string;
  number: string;
  isGroup: boolean;
  email?: string;
  profilePicUrl?: string;
  companyId: number;
  channel?: string;
  extraInfo?: any[];
  remoteJid?: string;
  whatsappId?: number;
  wbot?: any;
  telegramUserId?: string;
}

/**
 * Normalize phone number: extract only digits
 */
const normalizeNumber = (rawNumber: string, isGroup: boolean): string => {
  return isGroup ? rawNumber : rawNumber.replace(/[^0-9]/g, "");
};

/**
 * Extract number from remoteJid
 * @example "593987009472@s.whatsapp.net" -> "593987009472"
 * @example "120363123456789@g.us" -> "120363123456789"
 */
const extractNumberFromJid = (remoteJid: string): string => {
  if (!remoteJid) return "";
  return remoteJid.split("@")[0].replace(/[^0-9]/g, "");
};

/**
 * Optimized CreateOrUpdateContactService
 * 
 * Performance improvements:
 * - Uses remoteJid as primary lookup (more reliable than phone number)
 * - Single database query pattern
 * - Skips profile picture downloads (major bottleneck)
 * - Minimal updates only when data changes
 */
const CreateOrUpdateContactService = async ({
  name,
  number: rawNumber,
  profilePicUrl: profilePicUrlInput,
  isGroup,
  email = "",
  channel = "whatsapp",
  companyId,
  extraInfo = [],
  remoteJid = "",
  whatsappId,
  wbot,
  telegramUserId
}: Request): Promise<Contact> => {
  try {
    const io = getIO();

    // 1. Normalize the number
    const number = normalizeNumber(rawNumber, isGroup);

    // 2. Build remoteJid if not provided
    let finalRemoteJid = remoteJid;
    if (!finalRemoteJid && number) {
      finalRemoteJid = isGroup ? `${number}@g.us` : `${number}@s.whatsapp.net`;
    }

    // 3. OPTIMIZED LOOKUP: Try by remoteJid + whatsappId first, then by number + whatsappId
    let contact: Contact | null = null;

    // Build where clause based on available data
    const baseWhere: any = { companyId };
    if (whatsappId) {
      baseWhere.whatsappId = whatsappId;
    }

    if (finalRemoteJid) {
      // Primary lookup: by remoteJid + whatsappId (most reliable for WhatsApp)
      contact = await Contact.findOne({
        where: { ...baseWhere, remoteJid: finalRemoteJid }
      });
    }

    // Fallback lookup: by normalized number + whatsappId
    if (!contact && number) {
      contact = await Contact.findOne({
        where: { ...baseWhere, number }
      });

      // If found by number but has different remoteJid, update it
      if (contact && finalRemoteJid && contact.remoteJid !== finalRemoteJid) {
        contact.remoteJid = finalRemoteJid;
      }
    }

    // 4. UPDATE existing contact (minimal updates)
    if (contact) {
      let hasChanges = false;

      // Update only if values changed
      if (finalRemoteJid && contact.remoteJid !== finalRemoteJid) {
        contact.remoteJid = finalRemoteJid;
        hasChanges = true;
      }

      if (contact.isGroup !== isGroup) {
        contact.isGroup = isGroup;
        hasChanges = true;
      }

      if (channel && contact.channel !== channel) {
        contact.channel = channel;
        hasChanges = true;
      }

      if (!isNil(whatsappId) && isNil(contact.whatsappId)) {
        const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
        if (whatsapp) {
          contact.whatsappId = whatsappId;
          hasChanges = true;
        }
      }

      // Update name only if current name is just the number
      if (name && contact.name === contact.number && name !== contact.number) {
        contact.name = name;
        hasChanges = true;
      }

      // Save only if there are changes
      if (hasChanges) {
        await contact.save();
      }

      // Emit update only if there were changes
      if (hasChanges) {
        io.of(String(companyId)).emit(`company-${companyId}-contact`, { action: "update", contact });
      }

      return contact;
    }

    // 5. CREATE new contact
    const defaultPic = `${process.env.FRONTEND_URL}/nopicture.png`;

    contact = await Contact.create({
      name: name || number,
      number,
      email,
      isGroup,
      companyId,
      channel,
      acceptAudioMessage: true,
      remoteJid: finalRemoteJid,
      profilePicUrl: profilePicUrlInput || defaultPic,
      urlPicture: "",
      whatsappId,
      telegramUserId
    });

    // Emit creation
    io.of(String(companyId)).emit(`company-${companyId}-contact`, { action: "create", contact });

    logger.info(`Contact created: ${contact.id} (${contact.number}) for company ${companyId}`);

    return contact;
  } catch (err: any) {
    // Handle unique constraint violation gracefully
    if (err.name === "SequelizeUniqueConstraintError") {
      // Race condition: contact was created by another process, fetch it
      const number = normalizeNumber(rawNumber, isGroup);
      const existingContact = await Contact.findOne({
        where: { number, companyId }
      });
      if (existingContact) {
        return existingContact;
      }
    }

    logger.error(`Error in CreateOrUpdateContactService: ${err?.message || err}`);
    throw err;
  }
};

export default CreateOrUpdateContactService;
