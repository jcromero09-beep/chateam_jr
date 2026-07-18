/**
 * ContactTemperatureService
 *
 * Calcula la "temperatura" de cada contacto (0-100) basándose en:
 * - Tag actual (30%): hot-lead=100, referrer=90, consideration=80, post-sale=70, interest=60, retargeting=50, attraction=40, dormant=10
 * - Recencia último mensaje (25%): <1h=100, <24h=80, <3d=60, <7d=40, <30d=20, >30d=0
 * - Frecuencia mensajes 30d (20%): >=20=100, >=10=80, >=5=60, >=2=40, 1=20, 0=0
 * - Tickets abiertos (15%): open=100, pending=80, closed<7d=40, ninguno=0
 * - Datos completos (10%): email+phone+name=100, 2 de 3=66, 1 de 3=33, 0=0
 *
 * Categorías: hot >= 70, warm >= 35, cold < 35
 */

import { Op, fn, col, literal } from "sequelize";
import ContactTemperature from "../models/ContactTemperature";
import Contact from "../models/Contact";
import Message from "../models/Message";
import Ticket from "../models/Ticket";
import Tag from "../models/Tag";
import ContactTag from "../models/ContactTag";
import logger from "../utils/logger";

// Pesos del algoritmo de temperatura
const WEIGHTS = {
  tag: 0.30,
  recency: 0.25,
  frequency: 0.20,
  tickets: 0.15,
  completeness: 0.10
};

// Mapeo de tag key → score (0-100)
const TAG_SCORES: Record<string, number> = {
  "hot-lead": 100,
  "referrer": 90,
  "consideration": 80,
  "post-sale": 70,
  "interest": 60,
  "retargeting": 50,
  "attraction": 40,
  "dormant": 10
};

interface TemperatureFactors {
  tagScore: number;
  tagKey: string | null;
  recencyScore: number;
  lastMessageAt: Date | null;
  frequencyScore: number;
  messageCount30d: number;
  ticketScore: number;
  lastTicketAt: Date | null;
  ticketCount30d: number;
  completenessScore: number;
}

function categorizeTemperature(temperature: number): "cold" | "warm" | "hot" {
  if (temperature >= 70) return "hot";
  if (temperature >= 35) return "warm";
  return "cold";
}

function calculateRecencyScore(lastMessageDate: Date | null): number {
  if (!lastMessageDate) return 0;
  const hoursAgo = (Date.now() - new Date(lastMessageDate).getTime()) / (1000 * 60 * 60);
  if (hoursAgo < 1) return 100;
  if (hoursAgo < 24) return 80;
  if (hoursAgo < 72) return 60;    // 3 días
  if (hoursAgo < 168) return 40;   // 7 días
  if (hoursAgo < 720) return 20;   // 30 días
  return 0;
}

function calculateFrequencyScore(messageCount: number): number {
  if (messageCount >= 20) return 100;
  if (messageCount >= 10) return 80;
  if (messageCount >= 5) return 60;
  if (messageCount >= 2) return 40;
  if (messageCount >= 1) return 20;
  return 0;
}

function calculateTicketScore(tickets: Array<{ status: string; updatedAt: Date }>): number {
  if (!tickets || tickets.length === 0) return 0;

  // Buscar el ticket más relevante
  const hasOpen = tickets.some(t => t.status === "open");
  const hasPending = tickets.some(t => t.status === "pending");
  const recentClosed = tickets.some(t => {
    if (t.status !== "closed") return false;
    const daysAgo = (Date.now() - new Date(t.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysAgo < 7;
  });

  if (hasOpen) return 100;
  if (hasPending) return 80;
  if (recentClosed) return 40;
  return 10; // Tickets viejos cerrados
}

function calculateCompletenessScore(contact: { name: string; email: string; number: string }): number {
  let fieldsPresent = 0;
  if (contact.name && contact.name.trim() !== "") fieldsPresent++;
  if (contact.email && contact.email.trim() !== "") fieldsPresent++;
  if (contact.number && contact.number.trim() !== "") fieldsPresent++;

  if (fieldsPresent >= 3) return 100;
  if (fieldsPresent === 2) return 66;
  if (fieldsPresent === 1) return 33;
  return 0;
}

class ContactTemperatureService {
  /**
   * Calcula la temperatura de un solo contacto
   */
  static async calculateForContact(
    contactId: number,
    companyId: number
  ): Promise<ContactTemperature> {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const now = new Date();

    // Obtener contacto con tags
    const contact = await Contact.findOne({
      where: { id: contactId, companyId },
      include: [{
        model: Tag,
        through: { attributes: [] },
        attributes: ["id", "key", "name"]
      }],
      attributes: ["id", "name", "email", "number", "companyId"]
    });

    if (!contact) {
      throw new Error(`Contacto ${contactId} no encontrado en empresa ${companyId}`);
    }

    // 1. Tag Score
    const tags = (contact as any).tags || [];
    let tagKey: string | null = null;
    let tagScore = 0;

    for (const tag of tags) {
      if (tag.key && TAG_SCORES[tag.key] !== undefined) {
        if (TAG_SCORES[tag.key] > tagScore) {
          tagScore = TAG_SCORES[tag.key];
          tagKey = tag.key;
        }
      }
    }

    // 2. Recencia — último mensaje del contacto
    const lastMessage = await Message.findOne({
      where: {
        contactId,
        companyId
      },
      order: [["createdAt", "DESC"]],
      attributes: ["createdAt"]
    });
    const lastMessageAt = lastMessage ? lastMessage.createdAt : null;
    const recencyScore = calculateRecencyScore(lastMessageAt);

    // 3. Frecuencia — mensajes en últimos 30 días
    const messageCount30d = await Message.count({
      where: {
        contactId,
        companyId,
        createdAt: { [Op.gte]: thirtyDaysAgo }
      }
    });
    const frequencyScore = calculateFrequencyScore(messageCount30d);

    // 4. Tickets
    const tickets = await Ticket.findAll({
      where: {
        contactId,
        companyId,
        createdAt: { [Op.gte]: thirtyDaysAgo }
      },
      attributes: ["id", "status", "updatedAt", "createdAt"],
      order: [["updatedAt", "DESC"]]
    });

    const ticketCount30d = tickets.length;
    const lastTicketAt = tickets.length > 0 ? tickets[0].updatedAt : null;
    const ticketScore = calculateTicketScore(
      tickets.map(t => ({ status: t.status, updatedAt: t.updatedAt }))
    );

    // 5. Completitud de datos
    const completenessScore = calculateCompletenessScore({
      name: contact.name || "",
      email: contact.email || "",
      number: contact.number || ""
    });

    // Calcular temperatura final
    const temperature = Math.round(
      (tagScore * WEIGHTS.tag +
       recencyScore * WEIGHTS.recency +
       frequencyScore * WEIGHTS.frequency +
       ticketScore * WEIGHTS.tickets +
       completenessScore * WEIGHTS.completeness) * 100
    ) / 100;

    const category = categorizeTemperature(temperature);

    const reasons: Record<string, number> = {
      tagScore: Math.round(tagScore * WEIGHTS.tag * 100) / 100,
      recencyScore: Math.round(recencyScore * WEIGHTS.recency * 100) / 100,
      frequencyScore: Math.round(frequencyScore * WEIGHTS.frequency * 100) / 100,
      ticketScore: Math.round(ticketScore * WEIGHTS.tickets * 100) / 100,
      completenessScore: Math.round(completenessScore * WEIGHTS.completeness * 100) / 100
    };

    // Upsert (crear o actualizar)
    const [record] = await ContactTemperature.upsert({
      companyId,
      contactId,
      temperature,
      category,
      lastMessageAt,
      lastTicketAt,
      messageCount30d,
      ticketCount30d,
      tagKey,
      reasons: [reasons],
      lastRecalculatedAt: now
    } as any);

    return record;
  }

  /**
   * Recalcula TODOS los contactos de una empresa
   * Usa batches de 100 para evitar sobrecarga
   */
  static async recalculateForCompany(
    companyId: number
  ): Promise<{ processed: number; hot: number; warm: number; cold: number }> {
    const startTime = Date.now();
    let processed = 0;
    let hot = 0;
    let warm = 0;
    let cold = 0;

    const BATCH_SIZE = 100;
    let offset = 0;
    let hasMore = true;

    while (hasMore) {
      const contacts = await Contact.findAll({
        where: { companyId, isGroup: false },
        attributes: ["id"],
        limit: BATCH_SIZE,
        offset,
        order: [["id", "ASC"]]
      });

      if (contacts.length === 0) {
        hasMore = false;
        break;
      }

      const results = await Promise.allSettled(
        contacts.map(c => ContactTemperatureService.calculateForContact(c.id, companyId))
      );

      for (const result of results) {
        if (result.status === "fulfilled") {
          processed++;
          const cat = result.value.category;
          if (cat === "hot") hot++;
          else if (cat === "warm") warm++;
          else cold++;
        } else {
          logger.warn(`[ContactTemperature] Error calculando contacto: ${result.reason?.message || result.reason}`);
        }
      }

      offset += BATCH_SIZE;
      if (contacts.length < BATCH_SIZE) {
        hasMore = false;
      }
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.info(
      `[ContactTemperature] ✅ Empresa ${companyId}: ${processed} contactos en ${duration}s — 🔥 ${hot} hot, 🟠 ${warm} warm, 🔵 ${cold} cold`
    );

    return { processed, hot, warm, cold };
  }

  /**
   * Obtener distribución de temperaturas (para dashboard)
   */
  static async getDistribution(
    companyId: number
  ): Promise<{ hot: number; warm: number; cold: number; total: number }> {
    try {
      const results = await ContactTemperature.findAll({
        where: { companyId },
        attributes: [
          "category",
          [fn("COUNT", col("id")), "count"]
        ],
        group: ["category"],
        raw: true
      }) as unknown as Array<{ category: string; count: string }>;

      const distribution = { hot: 0, warm: 0, cold: 0, total: 0 };

      for (const row of results) {
        const count = parseInt(row.count) || 0;
        if (row.category === "hot") distribution.hot = count;
        else if (row.category === "warm") distribution.warm = count;
        else if (row.category === "cold") distribution.cold = count;
        distribution.total += count;
      }

      return distribution;
    } catch (error: any) {
      logger.error(`[ContactTemperature] ❌ Error obteniendo distribución: ${error.message}`);
      return { hot: 0, warm: 0, cold: 0, total: 0 };
    }
  }

  /**
   * Listar contactos por categoría con paginación
   */
  static async getContactsByCategory(
    companyId: number,
    category: "hot" | "warm" | "cold",
    options?: { limit?: number; offset?: number; search?: string }
  ): Promise<{ contacts: ContactTemperature[]; total: number }> {
    try {
      const where: Record<string, unknown> = { companyId, category };

      const includeWhere: Record<string, unknown> = {};
      if (options?.search) {
        includeWhere[Op.or as unknown as string] = [
          { name: { [Op.iLike]: `%${options.search}%` } },
          { number: { [Op.iLike]: `%${options.search}%` } },
          { email: { [Op.iLike]: `%${options.search}%` } }
        ];
      }

      const { count, rows } = await ContactTemperature.findAndCountAll({
        where,
        include: [{
          model: Contact,
          attributes: ["id", "name", "number", "email", "profilePicUrl"],
          where: Object.keys(includeWhere).length > 0 ? includeWhere : undefined
        }],
        order: [["temperature", "DESC"]],
        limit: options?.limit || 50,
        offset: options?.offset || 0
      });

      return { contacts: rows, total: count };
    } catch (error: any) {
      logger.error(`[ContactTemperature] ❌ Error listando contactos ${category}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener temperatura de un contacto específico
   */
  static async getContactTemperature(
    contactId: number,
    companyId: number
  ): Promise<ContactTemperature | null> {
    try {
      return await ContactTemperature.findOne({
        where: { contactId, companyId },
        include: [{
          model: Contact,
          attributes: ["id", "name", "number", "email", "profilePicUrl"]
        }]
      });
    } catch (error: any) {
      logger.error(`[ContactTemperature] ❌ Error obteniendo temperatura contacto ${contactId}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Obtener contactos por categoría (solo IDs + datos básicos para Custom Audiences)
   */
  static async getContactIdsByCategory(
    companyId: number,
    category: "hot" | "warm" | "cold"
  ): Promise<Array<{ contactId: number; email: string; number: string; name: string }>> {
    try {
      const records = await ContactTemperature.findAll({
        where: { companyId, category },
        include: [{
          model: Contact,
          attributes: ["id", "name", "number", "email", "city", "state", "country", "zipcode"]
        }],
        attributes: ["contactId"]
      });

      return records
        .filter(r => (r as any).contact)
        .map(r => {
          const c = (r as any).contact;
          return {
            contactId: c.id,
            email: c.email || "",
            number: c.number || "",
            name: c.name || "",
            city: c.city || "",
            state: c.state || "",
            country: c.country || "",
            zipcode: c.zipcode || ""
          };
        });
    } catch (error: any) {
      logger.error(`[ContactTemperature] ❌ Error obteniendo IDs por categoría: ${error.message}`);
      return [];
    }
  }
}

export default ContactTemperatureService;
