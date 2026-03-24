/**
 * AudienceSegmentationService
 *
 * Puente entre la temperatura de contactos y Meta Audiences.
 * Permite crear Custom Audiences desde contactos por temperatura,
 * Lookalike Audiences, buscar intereses y estimar alcance.
 *
 * Reutiliza: (MetaMarketingService as any).getMetaClient() del MetaMarketingService,
 * ConversionsAPI.prepareUserData() para hashing SHA-256
 */

import MetaMarketingService from "./MetaMarketingService";
import ContactTemperatureService from "./ContactTemperatureService";
import logger from "../utils/logger";
import crypto from "crypto";

// Mínimo de usuarios que Meta requiere para una Custom Audience
const MIN_AUDIENCE_SIZE = 100;

// Función de hashing SHA-256 (misma lógica que ConversionsAPI.prepareUserData)
function hashData(value: string): string {
  if (!value || value.trim() === "") return "";
  return crypto
    .createHash("sha256")
    .update(value.toLowerCase().trim())
    .digest("hex");
}

/**
 * Prepara los datos de un contacto para Custom Audience
 * Hashea email, phone, name, city, state, country, zipcode
 */
function prepareContactForAudience(contact: {
  email: string;
  number: string;
  name: string;
  city?: string;
  state?: string;
  country?: string;
  zipcode?: string;
}): {
  email: string;
  phone: string;
  fn: string;
  ct: string;
  st: string;
  country: string;
  zip: string;
} {
  const nameParts = (contact.name || "").split(" ");
  const firstName = nameParts[0] || "";

  return {
    email: hashData(contact.email || ""),
    phone: hashData((contact.number || "").replace(/\D/g, "")),
    fn: hashData(firstName),
    ct: hashData(contact.city || ""),
    st: hashData(contact.state || ""),
    country: hashData(contact.country || ""),
    zip: hashData(contact.zipcode || "")
  };
}

class AudienceSegmentationService {
  /**
   * Crear Custom Audience desde contactos por temperatura
   * 1. Obtiene contactos de la categoría
   * 2. Hashea sus datos (email, phone, name)
   * 3. Crea audience en Meta
   * 4. Agrega usuarios
   */
  static async createAudienceFromTemperature(
    companyId: number,
    category: "hot" | "warm" | "cold",
    audienceName: string,
    whatsappId?: number
  ): Promise<{ audienceId: string; usersAdded: number; usersSkipped: number }> {
    try {
      // 1. Obtener contactos de la categoría
      const contacts = await ContactTemperatureService.getContactIdsByCategory(companyId, category);

      if (contacts.length < MIN_AUDIENCE_SIZE) {
        throw new Error(
          `Se necesitan al menos ${MIN_AUDIENCE_SIZE} contactos para crear una audiencia. ` +
          `La categoría "${category}" tiene solo ${contacts.length} contactos.`
        );
      }

      // 2. Hashear datos
      const hashedUsers = contacts
        .map(c => prepareContactForAudience(c))
        .filter(u => u.email !== "" || u.phone !== ""); // Al menos email o teléfono

      if (hashedUsers.length < MIN_AUDIENCE_SIZE) {
        throw new Error(
          `Solo ${hashedUsers.length} contactos tienen email o teléfono válido. ` +
          `Se necesitan al menos ${MIN_AUDIENCE_SIZE}.`
        );
      }

      // 3. Obtener cliente Meta
      const { client, accountId } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);

      // 4. Crear audience en Meta
      const audience = await client.audiences.createCustomAudience(accountId, {
        name: audienceName,
        subtype: "CUSTOM",
        description: `Audiencia ${category} creada desde ChatEAM - ${contacts.length} contactos`,
        customer_file_source: "USER_PROVIDED_ONLY"
      });

      // 5. Agregar usuarios
      const result = await client.audiences.addUsersToAudience(audience.id, hashedUsers);

      logger.info(
        `[AudienceSegmentation] ✅ Audience "${audienceName}" creada: ` +
        `${result.num_received} usuarios agregados, ${result.num_invalid_entries} inválidos`
      );

      return {
        audienceId: audience.id,
        usersAdded: result.num_received,
        usersSkipped: result.num_invalid_entries
      };
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error creando audience desde temperatura: ${error.message}`);
      throw error;
    }
  }

  /**
   * Crear Lookalike Audience desde una Custom Audience existente
   */
  static async createLookalikeFromAudience(
    companyId: number,
    originAudienceId: string,
    name: string,
    country: string,
    ratio: number,
    whatsappId?: number
  ): Promise<{ audienceId: string; name: string }> {
    try {
      const { client, accountId } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);

      const lookalike = await client.audiences.createLookalikeAudience(accountId, {
        name,
        origin_audience_id: originAudienceId,
        lookalike_spec: {
          country,
          ratio: Math.min(Math.max(ratio, 0.01), 0.20), // Clamp entre 1% y 20%
          type: "similarity"
        }
      });

      logger.info(
        `[AudienceSegmentation] ✅ Lookalike "${name}" creada basada en audience ${originAudienceId}`
      );

      return {
        audienceId: lookalike.id,
        name: lookalike.name
      };
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error creando lookalike: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar intereses para targeting
   */
  static async searchInterests(
    companyId: number,
    query: string,
    whatsappId?: number
  ): Promise<Array<{ id: string; name: string; audience_size: number; path: string[]; topic: string }>> {
    try {
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.interests.searchInterests(query);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error buscando intereses: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener sugerencias de intereses
   */
  static async getInterestSuggestions(
    companyId: number,
    interestIds: string[],
    whatsappId?: number
  ): Promise<Array<{ id: string; name: string; audience_size: number; path: string[]; topic: string }>> {
    try {
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.interests.getSuggestions(interestIds);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error obteniendo sugerencias: ${error.message}`);
      throw error;
    }
  }

  /**
   * Estimar alcance de un targeting spec
   */
  static async estimateReach(
    companyId: number,
    targetingSpec: Record<string, unknown>,
    whatsappId?: number
  ): Promise<{ users: number; estimate_ready: boolean }> {
    try {
      const { client, accountId } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.interests.estimateReach(accountId, targetingSpec);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error estimando alcance: ${error.message}`);
      throw error;
    }
  }

  /**
   * Listar audiences existentes en Meta
   */
  static async listAudiences(
    companyId: number,
    whatsappId?: number
  ): Promise<Array<{ id: string; name: string; subtype: string; approximate_count: number }>> {
    try {
      const { client, accountId } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.audiences.getCustomAudiences(accountId);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error listando audiences: ${error.message}`);
      throw error;
    }
  }

  /**
   * Eliminar una audience
   */
  static async deleteAudience(
    companyId: number,
    audienceId: string,
    whatsappId?: number
  ): Promise<boolean> {
    try {
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.audiences.deleteCustomAudience(audienceId);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error eliminando audience: ${error.message}`);
      throw error;
    }
  }

  /**
   * Sincronizar audiencia con temperatura actual
   * Compara los usuarios actuales y agrega los nuevos de la categoría
   */
  static async syncAudienceWithTemperature(
    companyId: number,
    audienceId: string,
    category: "hot" | "warm" | "cold",
    whatsappId?: number
  ): Promise<{ added: number; total: number }> {
    try {
      // Obtener todos los contactos de la categoría
      const contacts = await ContactTemperatureService.getContactIdsByCategory(companyId, category);

      const hashedUsers = contacts
        .map(c => prepareContactForAudience(c))
        .filter(u => u.email !== "" || u.phone !== "");

      if (hashedUsers.length === 0) {
        return { added: 0, total: 0 };
      }

      // Agregar usuarios (Meta deduplica automáticamente)
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      const result = await client.audiences.addUsersToAudience(audienceId, hashedUsers);

      logger.info(
        `[AudienceSegmentation] ✅ Audience ${audienceId} sincronizada: ${result.num_received} usuarios`
      );

      return {
        added: result.num_received,
        total: hashedUsers.length
      };
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error sincronizando audience: ${error.message}`);
      throw error;
    }
  }

  /**
   * Buscar localizaciones para targeting
   */
  static async searchLocations(
    companyId: number,
    query: string,
    whatsappId?: number
  ): Promise<Array<{ key: string; name: string; type: string; country_code: string }>> {
    try {
      const { client } = await (MetaMarketingService as any).getMetaClient(companyId, whatsappId);
      return await client.interests.searchLocations(query);
    } catch (error: any) {
      logger.error(`[AudienceSegmentation] ❌ Error buscando localizaciones: ${error.message}`);
      throw error;
    }
  }
}

export default AudienceSegmentationService;
