import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

import { getIO } from "../../libs/socket";
import Contact from "../../models/Contact";
import logger from "../../utils/logger";
import lodash from "lodash";
const { isNil } = lodash;
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
  phoneNumberId?: string;
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
/**
 * Check if name contains at least one letter (a-zA-Z)
 * Returns false if name is empty, only numbers, only emojis, or only special chars
 */
const hasLetters = (name: string): boolean => {
  if (!name || !name.trim()) return false;
  // Check if name contains at least one letter (including Spanish accented chars)
  return /[a-zA-ZáéíóúÁÉÍÓÚñÑüÜ]/.test(name);
};

const isLikelyTechnicalLid = (remoteJid = ""): boolean => {
  return remoteJid.endsWith("@lid");
};

/**
 * Clean and format the name:
 * - If name has no letters and number looks like a WhatsApp LID, use "Sin nombre"
 * - If name has no letters for a regular phone, use the number as name
 * - Otherwise, keep the original name
 */
const formatName = (name: string, number: string, remoteJid = ""): string => {
  if (!hasLetters(name)) {
    if (isLikelyTechnicalLid(remoteJid)) {
      return "Sin nombre";
    }
    // Use the phone number as name if no valid letters found
    return number;
  }
  return name.trim();
};

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
  telegramUserId,
  phoneNumberId
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

    // 2.1. Format name: avoid using WhatsApp LID as a human-facing name.
    const finalName = formatName(name, number, finalRemoteJid);

    // 3. OPTIMIZED LOOKUP: Single robust strategy - match by number digits only
    // This handles all formats: LID (Meta), s.whatsapp.net (Baileys), with/without +
    let contact: Contact | null = null;

    // Contact is canonical inside a company. Connection-specific identity is
    // represented by Ticket.whatsappId and ContactBindings, so the lookup must
    // not scope by whatsappId or Baileys connections will create duplicates.
    const baseWhere: any = { companyId };

    // Normalize number for comparison (remove all non-digits)
    const normalizedNumber = number.replace(/[^0-9]/g, "");

    // Strategy 1: By phoneNumberId (most reliable for Meta - unique per business number)
    if (!contact && phoneNumberId) {
      contact = await Contact.findOne({
        where: { ...baseWhere, phoneNumberId }
      });
    }

    // Strategy 2: By remoteJid exact match
    if (!contact && finalRemoteJid) {
      contact = await Contact.findOne({
        where: { ...baseWhere, remoteJid: finalRemoteJid }
      });
    }

    // Strategy 3: By normalized number (compare digits only)
    if (!contact && normalizedNumber) {
      // First try exact match on number field
      contact = await Contact.findOne({
        where: {
          ...baseWhere,
          [require("sequelize").Op.or]: [
            { number: normalizedNumber },
            { number: `+${normalizedNumber}` }
          ]
        }
      });

      // If not found, search by extracting digits from remoteJid in database
      if (!contact) {
        // Use a smarter query: try to match numbers with LIKE
        contact = await Contact.findOne({
          where: {
            ...baseWhere,
            [require("sequelize").Op.or]: [
              { number: { [require("sequelize").Op.like]: `%${normalizedNumber}%` } }
            ]
          },
          order: [["id", "DESC"]]
        });
      }
    }

    // Strategy 4: Cross-reference by extracting digits from any stored remoteJid
    // This handles CTWA campaigns where contact was created with LID but now we have full number
    if (!contact && normalizedNumber) {
      // Find contacts from same whatsapp where remoteJid digits match
      const potentialContact = await Contact.findOne({
        where: {
          ...baseWhere,
          remoteJid: {
            [require("sequelize").Op.like]: `%${normalizedNumber}%`
          }
        }
      });

      if (potentialContact) {
        contact = potentialContact;
      }
    }

    // Strategy 4b: Cross-reference - Match by digits in stored NUMBER vs new remoteJid
    // This handles: contact was saved with wrong number (like LID), now client writes with correct number
    // Example: saved number = "136797300667", new remoteJid = "593987009472@s.whatsapp.net"
    // We search if any stored number contains digits from new remoteJid (or vice versa)
    if (!contact && finalRemoteJid && normalizedNumber) {
      const newRemoteJidDigits = finalRemoteJid.split("@")[0].replace(/[^0-9]/g, "");

      if (newRemoteJidDigits.length >= 10) {
        // Search: find contacts where stored number's digits match new remoteJid digits
        const potentialContacts = await Contact.findAll({
          where: {
            ...baseWhere,
            number: {
              [require("sequelize").Op.ne]: null
            }
          },
          order: [["id", "DESC"]],
          limit: 10
        });

        // Find the one that matches by digits
        for (const potContact of potentialContacts) {
          const storedNumDigits = (potContact.number || "").replace(/[^0-9]/g, "");

          // Check if digits match (one contains the other)
          if (
            (storedNumDigits.length >= 10 && newRemoteJidDigits.includes(storedNumDigits)) ||
            (newRemoteJidDigits.length >= 10 && storedNumDigits.includes(newRemoteJidDigits))
          ) {
            contact = potContact;
            break;
          }
        }
      }
    }

    // ELIMINADO: Strategy 5 - Causaba bugs críticos donde diferentes clientes
    // terminaban en el mismo ticket porque tomaba el contacto más antiguo
    // de la conexión whatsappId. Si no encuentra contacto, se crea uno nuevo.
    // 2026-03-18: Bug fix - https://chatEAM.atlassian.net/browse/BUG-XXX

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

      // Update phoneNumberId if provided and not set
      if (phoneNumberId && !contact.phoneNumberId) {
        contact.phoneNumberId = phoneNumberId;
        hasChanges = true;
      }

      // Update remoteJid if provided and different (normalize both for comparison)
      if (finalRemoteJid && contact.remoteJid !== finalRemoteJid) {
        // Extract numbers for comparison
        const contactRemoteJidNum = contact.remoteJid?.split("@")[0].replace(/[^0-9]/g, "") || "";
        const newRemoteJidNum = finalRemoteJid.split("@")[0].replace(/[^0-9]/g, "");

        // Only update if the number part is different (handle LID vs s.whatsapp.net)
        if (contactRemoteJidNum !== newRemoteJidNum) {
          contact.remoteJid = finalRemoteJid;
          hasChanges = true;
        }
      }

      // Update number if we have a valid number
      // Always prefer the number from message.from (more reliable than wa_id from contacts)
      // This handles CTWA campaigns where first contact has LID as number, then user writes from app
      if (number && contact.number !== number) {
        const currentNumDigits = (contact.number || "").replace(/[^0-9]/g, "");
        const newNumDigits = number.replace(/[^0-9]/g, "");

        // Check if current number looks like a LID (contains letters - Meta) or is just digits
        const currentIsLID = /[a-zA-Z]/.test(contact.number || "");

        // ========== NUEVO: Detectar LID por dígitos (14-15 dígitos) ==========
        // El número guardado puede ser "68616598909016" (14-15 dígitos del LID sin @lid)
        // El número real tiene 10-13 dígitos (ej: 593969936629 = Ecuador)
        const currentIsLIDbyDigits = currentNumDigits.length >= 14 && currentNumDigits.length <= 15;

        const currentNumValid = (currentNumDigits.length >= 10 && currentNumDigits.length <= 13) && !currentIsLID;
        const newNumValid = newNumDigits.length >= 10 && newNumDigits.length <= 13;

        // Update if:
        // 1. Current number contains letters (LID con @lid) - always prefer real phone number
        // 2. Current number is 14-15 digits (LID sin @lid) and new is 10-13 digits (real number)
        // 3. Current number is invalid (empty/short) and new is valid
        // 4. Numbers are different and new is valid (even if shorter, prefer real phone over old)
        const shouldUpdate = currentIsLID || currentIsLIDbyDigits || !currentNumValid || (newNumValid && currentNumDigits !== newNumDigits);

        if (shouldUpdate) {
          contact.number = number;
          hasChanges = true;
        }
      }

      // Update name: if new name has letters and current name doesn't (or is just the number)
      if (finalName && hasLetters(finalName)) {
        const currentHasLetters = hasLetters(contact.name || "");
        const currentIsJustNumber = contact.name === contact.number;

        if (!currentHasLetters || currentIsJustNumber) {
          contact.name = finalName;
          hasChanges = true;
        }
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
      name: finalName,
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
      telegramUserId,
      phoneNumberId // AGREGADO: guardar phoneNumberId del número Meta
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
