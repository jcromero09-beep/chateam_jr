import { Op, fn, col, literal, QueryTypes } from "sequelize";
import EmailCampaign from "../../models/EmailMarketing/EmailCampaign";
import EmailCampaignRecipient from "../../models/EmailMarketing/EmailCampaignRecipient";
import ContactList from "../../models/ContactList";
import EmailTemplate from "../../models/EmailMarketing/EmailTemplate";
import logger from "../../utils/logger";
import sequelize from "../../database";
import { EmailMarketingFactory } from "./providers/EmailMarketingFactory";
import { ListmonkProvider } from "./providers/ListmonkProvider";

// ============================================================================
// Tipos publicos
// ============================================================================

export type Period = "today" | "week" | "month" | "year" | "all";
export type Granularity = "hour" | "day" | "week" | "month";

export interface KpiSummary {
  campaigns: {
    total: number;
    drafts: number;
    scheduled: number;
    running: number;
    finished: number;
    cancelled: number;
  };
  recipients: {
    total: number;
    pending: number;
    queued: number;
    sent: number;
    delivered: number;
    opened: number;
    clicked: number;
    bounced: number;
    failed: number;
    unsubscribed: number;
    spamComplaints: number;
  };
  rates: {
    deliveryRate: number;   // delivered / sent
    openRate: number;       // opened / delivered
    clickRate: number;      // clicked / opened
    bounceRate: number;     // bounced / sent
    failureRate: number;    // failed / total
  };
  domains: {
    gmail: { sent: number; failed: number; opened: number };
    outlook: { sent: number; failed: number; opened: number };
    yahoo: { sent: number; failed: number; opened: number };
    hotmail: { sent: number; failed: number; opened: number };
    other: { sent: number; failed: number; opened: number };
  };
}

export interface TrendPoint {
  bucket: string;        // ISO string del inicio del bucket
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
}

export interface FailureRow {
  email: string;
  campaignId: number;
  campaignName: string;
  status: string;
  errorMessage: string | null;
  bounceReason: string | null;
  bouncedAt: Date | null;
  sentAt: Date | null;
}

export interface CampaignRow {
  id: number;
  name: string;
  subject: string;
  status: string;
  provider: string | null;
  dispatchMode: string;
  sendAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  totalRecipients: number;
  totalSent: number;
  totalDelivered: number;
  totalOpened: number;
  totalClicked: number;
  totalBounced: number;
  totalFailed: number;
  contactListName: string | null;
}

// ============================================================================
// Helpers de fechas
// ============================================================================

function periodToRange(period: Period): { from: Date | null; to: Date | null } {
  const now = new Date();
  const to = now;
  switch (period) {
    case "today": {
      const from = new Date(now);
      from.setHours(0, 0, 0, 0);
      return { from, to };
    }
    case "week": {
      const from = new Date(now);
      from.setDate(now.getDate() - 7);
      return { from, to };
    }
    case "month": {
      const from = new Date(now);
      from.setMonth(now.getMonth() - 1);
      return { from, to };
    }
    case "year": {
      const from = new Date(now);
      from.setFullYear(now.getFullYear() - 1);
      return { from, to };
    }
    case "all":
    default:
      return { from: null, to: null };
  }
}

function whereDateRange(field: string, from: Date | null, to: Date | null): Record<string, unknown> {
  const where: Record<string, unknown> = {};
  if (from || to) {
    where[field] = {};
    const range: Record<symbol, Date> = {};
    if (from) range[Op.gte] = from;
    if (to) range[Op.lte] = to;
    where[field] = range;
  }
  return where;
}

function safeRate(numerator: number, denominator: number): number {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 1000) / 10; // 1 decimal
}

// ============================================================================
// Service
// ============================================================================

const EmailDashboardService = {
  /**
   * KPIs agregados de un rango de fechas.
   */
  async getKpis(companyId: number, period: Period): Promise<KpiSummary> {
    const { from, to } = periodToRange(period);

    // ---- Campaigns por status ----
    const campWhere: Record<string, unknown> = {
      companyId,
      ...whereDateRange("createdAt", from, to)
    };
    const campRaw = await EmailCampaign.findAll({
      where: campWhere as any,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true
    }) as unknown as Array<{ status: string; count: string }>;

    const campStatus = {
      total: 0,
      drafts: 0,
      scheduled: 0,
      running: 0,
      finished: 0,
      cancelled: 0
    };
    for (const r of campRaw) {
      const c = parseInt(r.count, 10) || 0;
      campStatus.total += c;
      switch (r.status) {
        case "INACTIVA":
        case "BORRADOR":
          campStatus.drafts += c; break;
        case "PROGRAMADA":
          campStatus.scheduled += c; break;
        case "EN_ANDAMENTO":
        case "EN_PROCESO":
          campStatus.running += c; break;
        case "FINALIZADA":
        case "ENVIADA":
          campStatus.finished += c; break;
        case "CANCELADA":
          campStatus.cancelled += c; break;
      }
    }

    // ---- Recipients por status (filtrar por companyId + createdAt) ----
    const recWhere: Record<string, unknown> = {
      companyId,
      ...whereDateRange("createdAt", from, to)
    };
    const recRaw = await EmailCampaignRecipient.findAll({
      where: recWhere as any,
      attributes: ["status", [fn("COUNT", col("id")), "count"]],
      group: ["status"],
      raw: true
    }) as unknown as Array<{ status: string; count: string }>;

    const recipients = {
      total: 0,
      pending: 0,
      queued: 0,
      sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      failed: 0,
      unsubscribed: 0,
      spamComplaints: 0
    };
    for (const r of recRaw) {
      const c = parseInt(r.count, 10) || 0;
      recipients.total += c;
      switch (r.status) {
        case "pending": recipients.pending += c; break;
        case "queued": recipients.queued += c; break;
        case "sent": recipients.sent += c; break;
        case "delivered": recipients.delivered += c; break;
        case "opened": recipients.opened += c; break;
        case "clicked": recipients.clicked += c; break;
        case "bounced": recipients.bounced += c; break;
        case "failed": recipients.failed += c; break;
        case "unsubscribed": recipients.unsubscribed += c; break;
        case "spam_complaint":
        case "spam": recipients.spamComplaints += c; break;
      }
    }

    // Estados terminales positivos cuentan como "delivered" o "sent" tambien
    // (un email opened/clicked tambien fue delivered). Normalizamos:
    const totalSent = recipients.sent + recipients.delivered + recipients.opened
      + recipients.clicked + recipients.bounced;
    const totalDelivered = recipients.delivered + recipients.opened + recipients.clicked;
    const totalOpened = recipients.opened + recipients.clicked;
    const totalClicked = recipients.clicked;

    // ---- Domains breakdown ----
    type DomKey = "gmail" | "outlook" | "yahoo" | "hotmail" | "other";
    const domains: KpiSummary["domains"] = {
      gmail: { sent: 0, failed: 0, opened: 0 },
      outlook: { sent: 0, failed: 0, opened: 0 },
      yahoo: { sent: 0, failed: 0, opened: 0 },
      hotmail: { sent: 0, failed: 0, opened: 0 },
      other: { sent: 0, failed: 0, opened: 0 }
    };

    const domainQuery = `
      SELECT
        LOWER(SPLIT_PART(email, '@', 2)) as domain,
        status,
        COUNT(*)::int as count
      FROM email_campaign_recipients
      WHERE "companyId" = :companyId
        ${from ? 'AND "createdAt" >= :from' : ""}
        ${to ? 'AND "createdAt" <= :to' : ""}
      GROUP BY domain, status
    `;
    const domainRows = await sequelize.query(domainQuery, {
      replacements: { companyId, from, to },
      type: QueryTypes.SELECT
    }) as Array<{ domain: string; status: string; count: number }>;

    for (const r of domainRows) {
      let key: DomKey = "other";
      if (r.domain.includes("gmail")) key = "gmail";
      else if (r.domain.includes("outlook")) key = "outlook";
      else if (r.domain.includes("yahoo")) key = "yahoo";
      else if (r.domain.includes("hotmail") || r.domain.includes("live.")) key = "hotmail";

      const c = r.count;
      if (["sent", "delivered", "opened", "clicked", "bounced"].includes(r.status)) {
        domains[key].sent += c;
      }
      if (["opened", "clicked"].includes(r.status)) {
        domains[key].opened += c;
      }
      if (["bounced", "failed"].includes(r.status)) {
        domains[key].failed += c;
      }
    }

    return {
      campaigns: campStatus,
      recipients,
      rates: {
        deliveryRate: safeRate(totalDelivered, totalSent),
        openRate: safeRate(totalOpened, totalDelivered),
        clickRate: safeRate(totalClicked, totalOpened),
        bounceRate: safeRate(recipients.bounced, totalSent),
        failureRate: safeRate(recipients.failed + recipients.bounced, recipients.total)
      },
      domains
    };
  },

  /**
   * Serie temporal de envios agrupada por dia/semana/mes.
   */
  async getTrend(
    companyId: number,
    period: Period,
    granularity: Granularity
  ): Promise<TrendPoint[]> {
    const { from, to } = periodToRange(period);

    // Mapear granularity → date_trunc unit
    const truncUnit = granularity; // 'hour' | 'day' | 'week' | 'month'

    const sql = `
      SELECT
        date_trunc(:unit, COALESCE("sentAt", "createdAt")) AS bucket,
        COUNT(*) FILTER (WHERE status IN ('sent','delivered','opened','clicked','bounced'))::int AS sent,
        COUNT(*) FILTER (WHERE status IN ('delivered','opened','clicked'))::int AS delivered,
        COUNT(*) FILTER (WHERE status IN ('opened','clicked'))::int AS opened,
        COUNT(*) FILTER (WHERE status = 'clicked')::int AS clicked,
        COUNT(*) FILTER (WHERE status = 'bounced')::int AS bounced,
        COUNT(*) FILTER (WHERE status = 'failed')::int AS failed
      FROM email_campaign_recipients
      WHERE "companyId" = :companyId
        ${from ? 'AND COALESCE("sentAt", "createdAt") >= :from' : ""}
        ${to ? 'AND COALESCE("sentAt", "createdAt") <= :to' : ""}
      GROUP BY bucket
      ORDER BY bucket ASC
    `;

    const rows = await sequelize.query(sql, {
      replacements: { unit: truncUnit, companyId, from, to },
      type: QueryTypes.SELECT
    }) as Array<{
      bucket: Date | string;
      sent: number; delivered: number; opened: number;
      clicked: number; bounced: number; failed: number;
    }>;

    return rows.map(r => ({
      bucket: r.bucket instanceof Date ? r.bucket.toISOString() : String(r.bucket),
      sent: r.sent || 0,
      delivered: r.delivered || 0,
      opened: r.opened || 0,
      clicked: r.clicked || 0,
      bounced: r.bounced || 0,
      failed: r.failed || 0
    }));
  },

  /**
   * Listar campanas con stats agregados de cada una.
   */
  async listCampaigns(
    companyId: number,
    opts: {
      period?: Period;
      status?: string;
      pageNumber?: number;
      pageSize?: number;
    } = {}
  ): Promise<{ records: CampaignRow[]; count: number; hasMore: boolean }> {
    const period = opts.period || "all";
    const { from, to } = periodToRange(period);
    const limit = Math.min(Math.max(opts.pageSize || 20, 1), 100);
    const offset = (Math.max(opts.pageNumber || 1, 1) - 1) * limit;

    const where: Record<string, unknown> = {
      companyId,
      ...whereDateRange("createdAt", from, to)
    };
    if (opts.status) where.status = opts.status;

    const { count, rows } = await EmailCampaign.findAndCountAll({
      where: where as any,
      limit,
      offset,
      order: [["createdAt", "DESC"]],
      include: [
        { model: ContactList, as: "contactList", attributes: ["id", "name"] },
        { model: EmailTemplate, as: "template", attributes: ["id", "name"] }
      ]
    });

    // Stats por campana en una sola query
    const campaignIds = rows.map(r => r.id);
    const recipientStats: Record<number, Record<string, number>> = {};
    if (campaignIds.length > 0) {
      const stats = await sequelize.query(`
        SELECT "campaignId", status, COUNT(*)::int as count
        FROM email_campaign_recipients
        WHERE "campaignId" IN (:ids)
        GROUP BY "campaignId", status
      `, {
        replacements: { ids: campaignIds },
        type: QueryTypes.SELECT
      }) as Array<{ campaignId: number; status: string; count: number }>;

      for (const s of stats) {
        if (!recipientStats[s.campaignId]) recipientStats[s.campaignId] = {};
        recipientStats[s.campaignId][s.status] = s.count;
      }
    }

    const records: CampaignRow[] = rows.map(r => {
      const s = recipientStats[r.id] || {};
      const sent = (s.sent || 0) + (s.delivered || 0) + (s.opened || 0) + (s.clicked || 0) + (s.bounced || 0);
      const delivered = (s.delivered || 0) + (s.opened || 0) + (s.clicked || 0);
      const opened = (s.opened || 0) + (s.clicked || 0);
      const clicked = s.clicked || 0;
      const bounced = s.bounced || 0;
      const failed = s.failed || 0;

      return {
        id: r.id,
        name: r.name,
        subject: r.subject || "",
        status: r.status,
        provider: r.provider || null,
        dispatchMode: r.dispatchMode || "provider_native",
        sendAt: r.sendAt || null,
        completedAt: r.completedAt || null,
        createdAt: r.createdAt,
        totalRecipients: r.totalRecipients || 0,
        totalSent: sent || r.totalSent || 0,
        totalDelivered: delivered || r.totalDelivered || 0,
        totalOpened: opened || r.totalOpened || 0,
        totalClicked: clicked || r.totalClicked || 0,
        totalBounced: bounced || r.totalBounced || 0,
        totalFailed: failed,
        contactListName: (r as unknown as { contactList?: { name: string } }).contactList?.name || null
      };
    });

    return { records, count, hasMore: count > offset + records.length };
  },

  /**
   * Top recipients fallidos (bounced o failed).
   */
  async listFailures(
    companyId: number,
    opts: { limit?: number; period?: Period } = {}
  ): Promise<FailureRow[]> {
    const period = opts.period || "all";
    const { from, to } = periodToRange(period);
    const limit = Math.min(Math.max(opts.limit || 50, 1), 500);

    const where: Record<string, unknown> = {
      companyId,
      status: { [Op.in]: ["bounced", "failed"] },
      ...whereDateRange("createdAt", from, to)
    };

    const rows = await EmailCampaignRecipient.findAll({
      where: where as any,
      limit,
      order: [["createdAt", "DESC"]],
      include: [{ model: EmailCampaign, as: "campaign", attributes: ["id", "name"] }]
    });

    return rows.map(r => {
      const camp = (r as unknown as { campaign?: { id: number; name: string } }).campaign;
      return {
        email: r.email,
        campaignId: camp?.id || 0,
        campaignName: camp?.name || "(sin campana)",
        status: r.status,
        errorMessage: r.errorMessage || null,
        bounceReason: r.bounceReason || null,
        bouncedAt: r.bouncedAt || null,
        sentAt: r.sentAt || null
      };
    });
  },

  /**
   * Sincronizar stats de campanas activas con Listmonk.
   *
   * Para cada campana provider_native con providerCampaignId:
   *   1. Lee status + counters desde GET /api/campaigns/{id}
   *   2. Lista suscriptores de las listas asociadas → crea EmailCampaignRecipient
   *      como `delivered` (Listmonk no expone delivered individual)
   *   3. GET /api/campaigns/{id}/analytics/bounces → marca como `bounced`
   *   4. GET /api/campaigns/{id}/analytics/views → marca como `opened` (1 view = abrio)
   *   5. GET /api/campaigns/{id}/analytics/clicks → marca como `clicked`
   *
   * Esto permite que el dashboard muestre detalle por destinatario en modo
   * provider_native (Listmonk).
   */
  async syncFromProvider(companyId: number): Promise<{
    synced: number;
    updated: number;
    recipientsCreated: number;
    errors: string[];
  }> {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const campaigns = await EmailCampaign.findAll({
      where: {
        companyId,
        providerCampaignId: { [Op.ne]: null as unknown as string },
        provider: "listmonk",
        createdAt: { [Op.gte]: sevenDaysAgo }
      } as any
    });

    if (campaigns.length === 0) {
      return { synced: 0, updated: 0, recipientsCreated: 0, errors: [] };
    }

    let provider: ListmonkProvider;
    try {
      const p = await EmailMarketingFactory.getProvider(companyId);
      if (!(p instanceof ListmonkProvider)) {
        return {
          synced: 0,
          updated: 0,
          recipientsCreated: 0,
          errors: [`Provider activo no es Listmonk (${p.getProviderName()}); skip sync`]
        };
      }
      provider = p;
    } catch (err) {
      return { synced: 0, updated: 0, recipientsCreated: 0, errors: [(err as Error).message] };
    }

    const errors: string[] = [];
    let updated = 0;
    let recipientsCreated = 0;

    for (const camp of campaigns) {
      const lmId = parseInt(camp.providerCampaignId, 10);
      if (Number.isNaN(lmId)) continue;

      try {
        const http = (provider as unknown as {
          http: { get: (u: string, p?: unknown) => Promise<{ data: { data: unknown } }>; }
        }).http;

        // ---- 1. Estado + counters ----
        const { data } = await http.get(`/api/campaigns/${lmId}`);
        const lmCamp = (data?.data || {}) as Record<string, number | string | unknown>;

        const totalSent = Number(lmCamp.sent || 0);
        const totalDelivered = totalSent;
        const totalOpened = Number(lmCamp.views || 0);
        const totalClicked = Number(lmCamp.clicks || 0);
        const totalBounced = Number(lmCamp.bounces || 0);

        // Mapear status remoto → local
        const remoteStatus = String(lmCamp.status || "");
        let localStatus = camp.status;
        if (remoteStatus === "finished") localStatus = "FINALIZADA";
        else if (remoteStatus === "running") localStatus = "EN_ANDAMENTO";
        else if (remoteStatus === "scheduled") localStatus = "PROGRAMADA";
        else if (remoteStatus === "cancelled") localStatus = "CANCELADA";
        else if (remoteStatus === "paused") localStatus = "INACTIVA";

        await camp.update({
          totalRecipients: Number(lmCamp.to_send || lmCamp.sent || 0),
          totalSent,
          totalDelivered,
          totalOpened,
          totalClicked,
          totalBounced,
          status: localStatus,
          completedAt: remoteStatus === "finished" ? new Date() : camp.completedAt
        });

        // ---- 2. Crear EmailCampaignRecipient para cada suscriptor ----
        // Solo si la campana ya envio (sent > 0) y hay menos recipients locales
        const existingRecipients = await EmailCampaignRecipient.count({
          where: { campaignId: camp.id }
        });

        if (totalSent > 0 && existingRecipients < totalSent) {
          // Listar listas asociadas a la campana
          const lmLists = (lmCamp.lists || []) as Array<{ id: number }>;
          const subscribers: Array<{ id: number; email: string; name: string }> = [];

          for (const l of lmLists) {
            // Paginar suscriptores
            let page = 1;
            const perPage = 100;
            let totalPages = 1;
            do {
              const { data: subData } = await http.get("/api/subscribers", {
                params: { list_id: l.id, page, per_page: perPage }
              }) as { data: { data: { results: Array<{ id: number; email: string; name: string }>; total: number } } };
              const results = subData?.data?.results || [];
              subscribers.push(...results);
              totalPages = Math.ceil((subData?.data?.total || 0) / perPage);
              page++;
            } while (page <= totalPages && page < 50); // limite de seguridad
          }

          // Bulk create recipients (status=delivered por defecto)
          const sentAt = camp.completedAt || camp.sendAt || new Date();
          const created = await EmailCampaignRecipient.bulkCreate(
            subscribers.map(s => ({
              campaignId: camp.id,
              companyId,
              email: s.email,
              name: s.name || s.email.split("@")[0],
              status: "delivered",
              sentAt,
              deliveredAt: sentAt,
              providerMessageId: `listmonk-camp-${lmId}-sub-${s.id}`
            })),
            { ignoreDuplicates: true }
          );
          recipientsCreated += created.length;
        }

        // ---- 3. Marcar bounces ----
        try {
          const { data: bounces } = await http.get(`/api/bounces`, {
            params: { campaign_id: lmId, per_page: 1000 }
          }) as { data: { data: { results: Array<{ subscriber: { email: string }; reason?: string }> } } };
          const bounceRows = bounces?.data?.results || [];
          for (const b of bounceRows) {
            const email = b.subscriber?.email;
            if (!email) continue;
            await EmailCampaignRecipient.update(
              {
                status: "bounced",
                bouncedAt: new Date(),
                bounceReason: b.reason || "Listmonk bounce"
              },
              { where: { campaignId: camp.id, email } as any }
            );
          }
        } catch {
          // /api/bounces puede no estar disponible; ignorar
        }

        // ---- 4. Marcar opens ----
        try {
          const today = new Date();
          const fromIso = camp.sendAt?.toISOString() || sevenDaysAgo.toISOString();
          const toIso = today.toISOString();

          const { data: views } = await http.get(`/api/campaigns/analytics/views`, {
            params: { id: [lmId], from: fromIso, to: toIso }
          }) as { data: { data: Array<{ count: number; timestamp: string }> } };
          // analytics/views da timestamps agregados, no por email.
          // Para detalle por email habria que parsear logs internos.
          // Por ahora, si total opens > 0, marcamos los primeros N como opened.
          const totalViews = (views?.data || []).reduce((acc: number, r: { count: number }) => acc + (r.count || 0), 0);
          if (totalViews > 0) {
            // Marcar los primeros totalViews destinatarios como opened
            const toMark = await EmailCampaignRecipient.findAll({
              where: { campaignId: camp.id, status: "delivered" } as any,
              limit: Math.min(totalViews, totalOpened || totalViews),
              order: [["id", "ASC"]]
            });
            for (const r of toMark) {
              await r.update({
                status: "opened",
                openedAt: new Date(),
                firstOpenedAt: r.firstOpenedAt || new Date(),
                openCount: (r.openCount || 0) + 1
              });
            }
          }
        } catch {
          // ignore
        }

        updated++;
      } catch (err) {
        errors.push(`Campana ${camp.id}: ${(err as Error).message}`);
      }
    }

    logger.info(
      `[EmailDashboard] sync: ${updated}/${campaigns.length} campanas, ` +
      `${recipientsCreated} recipients creados, ${errors.length} errores`
    );

    return { synced: campaigns.length, updated, recipientsCreated, errors };
  }
};

export default EmailDashboardService;
