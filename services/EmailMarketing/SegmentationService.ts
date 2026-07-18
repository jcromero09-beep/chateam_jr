/**
 * SegmentationService — Segmentacion avanzada de contactos para email marketing
 *
 * Proporciona funciones para segmentar contactos basandose en
 * metricas de EmailCampaignRecipient y EmailTrackingEvent.
 * Soporta segmentos predefinidos y query builder dinamico.
 *
 * Multi-tenant: todas las operaciones filtran por companyId.
 */

import { Op, fn, col, literal } from "sequelize";
import logger from "../../utils/logger";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import EmailTrackingEvent from "../../models/EmailMarketing/EmailTrackingEvent";
import ContactListItem from "../../models/ContactListItem";
import Contact from "../../models/Contact";
import sequelize from "../../database";

// ============================================================================
// Interfaces
// ============================================================================

interface SegmentResult {
  contactIds: number[];
  count: number;
}

interface CustomSegmentCriteria {
  minOpenRate?: number;
  maxOpenRate?: number;
  minClickRate?: number;
  maxClickRate?: number;
  inactiveDays?: number;
  activeDays?: number;
  minBounces?: number;
  maxBounces?: number;
  contactListId?: number;
  tags?: number[];
  createdAfter?: string;
  createdBefore?: string;
}

interface SegmentStats {
  engaged: number;
  cold: number;
  hot: number;
  newContacts: number;
  bounced: number;
  total: number;
}

// ============================================================================
// getEngagedContacts — Contactos con open rate > X%
// ============================================================================

export const getEngagedContacts = async (
  companyId: number,
  minOpenRate: number = 30
): Promise<SegmentResult> => {
  try {
    // Contactos que han abierto al menos un % de los emails recibidos
    const results = await sequelize.query(`
      SELECT
        r."contactId",
        COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL)::float / NULLIF(COUNT(*), 0) * 100 AS open_rate
      FROM email_campaign_recipients r
      WHERE r."companyId" = :companyId
        AND r."contactId" IS NOT NULL
        AND r.status != 'failed'
      GROUP BY r."contactId"
      HAVING COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL)::float / NULLIF(COUNT(*), 0) * 100 >= :minOpenRate
      ORDER BY open_rate DESC
    `, {
      replacements: { companyId, minOpenRate },
      type: "SELECT" as any
    }) as unknown as Array<{ contactId: number }>;

    const contactIds = results.map(r => Number(r.contactId));

    logger.info(
      `[SegmentationService] Engaged contacts: company=${companyId}, ` +
      `minOpenRate=${minOpenRate}%, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getEngagedContacts: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// getColdContacts — Sin apertura en X+ dias
// ============================================================================

export const getColdContacts = async (
  companyId: number,
  inactiveDays: number = 30
): Promise<SegmentResult> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

    // Contactos que han recibido emails pero no han abierto ninguno despues del cutoff
    const results = await sequelize.query(`
      SELECT DISTINCT r."contactId"
      FROM email_campaign_recipients r
      WHERE r."companyId" = :companyId
        AND r."contactId" IS NOT NULL
        AND r."contactId" NOT IN (
          SELECT DISTINCT r2."contactId"
          FROM email_campaign_recipients r2
          WHERE r2."companyId" = :companyId
            AND r2."contactId" IS NOT NULL
            AND r2."openedAt" >= :cutoffDate
        )
    `, {
      replacements: { companyId, cutoffDate },
      type: "SELECT" as any
    }) as unknown as Array<{ contactId: number }>;

    const contactIds = results.map(r => Number(r.contactId));

    logger.info(
      `[SegmentationService] Cold contacts: company=${companyId}, ` +
      `inactiveDays=${inactiveDays}, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getColdContacts: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// getHotContacts — Click rate > X%
// ============================================================================

export const getHotContacts = async (
  companyId: number,
  minClickRate: number = 10
): Promise<SegmentResult> => {
  try {
    const results = await sequelize.query(`
      SELECT
        r."contactId",
        COUNT(*) FILTER (WHERE r."clickedAt" IS NOT NULL)::float / NULLIF(COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL), 0) * 100 AS click_rate
      FROM email_campaign_recipients r
      WHERE r."companyId" = :companyId
        AND r."contactId" IS NOT NULL
        AND r.status != 'failed'
      GROUP BY r."contactId"
      HAVING COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL) > 0
        AND COUNT(*) FILTER (WHERE r."clickedAt" IS NOT NULL)::float / NULLIF(COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL), 0) * 100 >= :minClickRate
      ORDER BY click_rate DESC
    `, {
      replacements: { companyId, minClickRate },
      type: "SELECT" as any
    }) as unknown as Array<{ contactId: number }>;

    const contactIds = results.map(r => Number(r.contactId));

    logger.info(
      `[SegmentationService] Hot contacts: company=${companyId}, ` +
      `minClickRate=${minClickRate}%, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getHotContacts: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// getNewContacts — Agregados hace < X dias
// ============================================================================

export const getNewContacts = async (
  companyId: number,
  daysNew: number = 7
): Promise<SegmentResult> => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysNew);

    const contacts = await Contact.findAll({
      where: {
        companyId,
        createdAt: { [Op.gte]: cutoffDate }
      },
      attributes: ["id"]
    });

    const contactIds = contacts.map(c => c.id);

    logger.info(
      `[SegmentationService] New contacts: company=${companyId}, ` +
      `daysNew=${daysNew}, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getNewContacts: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// getBouncedContacts — Con X+ bounces
// ============================================================================

export const getBouncedContacts = async (
  companyId: number,
  minBounces: number = 1
): Promise<SegmentResult> => {
  try {
    const results = await sequelize.query(`
      SELECT
        r."contactId",
        COUNT(*) FILTER (WHERE r."bouncedAt" IS NOT NULL) AS bounce_count
      FROM email_campaign_recipients r
      WHERE r."companyId" = :companyId
        AND r."contactId" IS NOT NULL
      GROUP BY r."contactId"
      HAVING COUNT(*) FILTER (WHERE r."bouncedAt" IS NOT NULL) >= :minBounces
      ORDER BY bounce_count DESC
    `, {
      replacements: { companyId, minBounces },
      type: "SELECT" as any
    }) as unknown as Array<{ contactId: number }>;

    const contactIds = results.map(r => Number(r.contactId));

    logger.info(
      `[SegmentationService] Bounced contacts: company=${companyId}, ` +
      `minBounces=${minBounces}, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getBouncedContacts: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// buildCustomSegment — Query builder dinamico
// ============================================================================

export const buildCustomSegment = async (
  companyId: number,
  criteria: CustomSegmentCriteria
): Promise<SegmentResult> => {
  try {
    const conditions: string[] = [];
    const replacements: Record<string, unknown> = { companyId };

    let baseQuery = `
      SELECT DISTINCT sub."contactId"
      FROM (
        SELECT
          r."contactId",
          COUNT(*) AS total_received,
          COUNT(*) FILTER (WHERE r."openedAt" IS NOT NULL) AS total_opened,
          COUNT(*) FILTER (WHERE r."clickedAt" IS NOT NULL) AS total_clicked,
          COUNT(*) FILTER (WHERE r."bouncedAt" IS NOT NULL) AS total_bounced,
          MAX(r."openedAt") AS last_opened,
          MAX(r."clickedAt") AS last_clicked
        FROM email_campaign_recipients r
        WHERE r."companyId" = :companyId
          AND r."contactId" IS NOT NULL
        GROUP BY r."contactId"
      ) sub
    `;

    // Filtro por open rate
    if (criteria.minOpenRate !== undefined) {
      conditions.push(`(sub.total_opened::float / NULLIF(sub.total_received, 0) * 100) >= :minOpenRate`);
      replacements.minOpenRate = criteria.minOpenRate;
    }
    if (criteria.maxOpenRate !== undefined) {
      conditions.push(`(sub.total_opened::float / NULLIF(sub.total_received, 0) * 100) <= :maxOpenRate`);
      replacements.maxOpenRate = criteria.maxOpenRate;
    }

    // Filtro por click rate
    if (criteria.minClickRate !== undefined) {
      conditions.push(`(sub.total_clicked::float / NULLIF(sub.total_opened, 0) * 100) >= :minClickRate`);
      replacements.minClickRate = criteria.minClickRate;
    }
    if (criteria.maxClickRate !== undefined) {
      conditions.push(`(sub.total_clicked::float / NULLIF(sub.total_opened, 0) * 100) <= :maxClickRate`);
      replacements.maxClickRate = criteria.maxClickRate;
    }

    // Filtro por bounces
    if (criteria.minBounces !== undefined) {
      conditions.push(`sub.total_bounced >= :minBounces`);
      replacements.minBounces = criteria.minBounces;
    }
    if (criteria.maxBounces !== undefined) {
      conditions.push(`sub.total_bounced <= :maxBounces`);
      replacements.maxBounces = criteria.maxBounces;
    }

    // Filtro por inactividad
    if (criteria.inactiveDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - criteria.inactiveDays);
      conditions.push(`(sub.last_opened IS NULL OR sub.last_opened < :inactiveCutoff)`);
      replacements.inactiveCutoff = cutoff;
    }

    // Filtro por actividad reciente
    if (criteria.activeDays !== undefined) {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - criteria.activeDays);
      conditions.push(`sub.last_opened >= :activeCutoff`);
      replacements.activeCutoff = cutoff;
    }

    if (conditions.length > 0) {
      baseQuery += ` WHERE ${conditions.join(" AND ")}`;
    }

    const results = await sequelize.query(baseQuery, {
      replacements,
      type: "SELECT" as any
    }) as unknown as Array<{ contactId: number }>;

    let contactIds = results.map(r => Number(r.contactId));

    // Filtro adicional por contactListId
    if (criteria.contactListId) {
      const listItems = await ContactListItem.findAll({
        where: { contactListId: criteria.contactListId },
        attributes: ["contactId"]
      });
      const listContactIds = new Set(
        listItems.map(item => (item as unknown as { contactId: number }).contactId).filter(Boolean)
      );
      contactIds = contactIds.filter(id => listContactIds.has(id));
    }

    // Filtro por fecha de creacion del contacto
    if (criteria.createdAfter || criteria.createdBefore) {
      const dateWhere: Record<string, unknown> = { companyId };
      if (criteria.createdAfter) {
        dateWhere.createdAt = { ...(dateWhere.createdAt as object || {}), [Op.gte]: new Date(criteria.createdAfter) };
      }
      if (criteria.createdBefore) {
        dateWhere.createdAt = { ...(dateWhere.createdAt as object || {}), [Op.lte]: new Date(criteria.createdBefore) };
      }

      const dateContacts = await Contact.findAll({
        where: dateWhere,
        attributes: ["id"]
      });
      const dateContactIds = new Set(dateContacts.map(c => c.id));
      contactIds = contactIds.filter(id => dateContactIds.has(id));
    }

    logger.info(
      `[SegmentationService] Custom segment: company=${companyId}, ` +
      `criteria=${JSON.stringify(criteria)}, found=${contactIds.length}`
    );

    return { contactIds, count: contactIds.length };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error buildCustomSegment: ${msg}`);
    return { contactIds: [], count: 0 };
  }
};

// ============================================================================
// getSegmentStats — Resumen de todos los segmentos predefinidos
// ============================================================================

export const getSegmentStats = async (
  companyId: number
): Promise<SegmentStats> => {
  try {
    const [engaged, cold, hot, newContacts, bounced] = await Promise.all([
      getEngagedContacts(companyId, 30),
      getColdContacts(companyId, 30),
      getHotContacts(companyId, 10),
      getNewContacts(companyId, 7),
      getBouncedContacts(companyId, 1)
    ]);

    // Total de contactos unicos con historial de email
    const totalResult = await sequelize.query(`
      SELECT COUNT(DISTINCT r."contactId") AS total
      FROM email_campaign_recipients r
      WHERE r."companyId" = :companyId
        AND r."contactId" IS NOT NULL
    `, {
      replacements: { companyId },
      type: "SELECT" as any
    }) as unknown as Array<{ total: string }>;

    const total = totalResult.length > 0 ? parseInt(totalResult[0].total, 10) : 0;

    const stats: SegmentStats = {
      engaged: engaged.count,
      cold: cold.count,
      hot: hot.count,
      newContacts: newContacts.count,
      bounced: bounced.count,
      total
    };

    logger.info(
      `[SegmentationService] Segment stats: company=${companyId}, ` +
      `engaged=${stats.engaged}, cold=${stats.cold}, hot=${stats.hot}, ` +
      `new=${stats.newContacts}, bounced=${stats.bounced}, total=${stats.total}`
    );

    return stats;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    logger.error(`[SegmentationService] Error getSegmentStats: ${msg}`);
    return { engaged: 0, cold: 0, hot: 0, newContacts: 0, bounced: 0, total: 0 };
  }
};
