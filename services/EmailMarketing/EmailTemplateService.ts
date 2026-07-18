import { Op } from "sequelize";
import EmailTemplate from "../../models/EmailMarketing/EmailTemplate";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { EmailMarketingFactory } from "./providers/EmailMarketingFactory";
import { TemplateData } from "./providers/EmailMarketingProvider";

// ============================================================================
// Interfaces
// ============================================================================

export interface CreateTemplateInput {
  name: string;
  subject: string;
  htmlContent: string;
  textContent?: string;
  previewText?: string;
  type?: "campaign" | "tx";
  category?: string;
  status?: "draft" | "active" | "archived";
  tags?: string[];
}

export interface UpdateTemplateInput {
  name?: string;
  subject?: string;
  htmlContent?: string;
  textContent?: string;
  previewText?: string;
  type?: "campaign" | "tx";
  category?: string;
  status?: "draft" | "active" | "archived";
  tags?: string[];
}

interface ListParams {
  companyId: number;
  searchParam?: string;
  pageNumber?: string;
  type?: "campaign" | "tx";
  status?: string;
}

// ============================================================================
// EmailTemplateService — CRUD con sync al provider activo
// ============================================================================

const EmailTemplateService = {
  /**
   * Listar plantillas de la company.
   */
  async list({
    companyId,
    searchParam = "",
    pageNumber = "1",
    type,
    status
  }: ListParams) {
    const limit = 20;
    const offset = limit * (parseInt(pageNumber, 10) - 1);

    const where: Record<string, unknown> = { companyId };
    if (searchParam) {
      where.name = { [Op.iLike]: `%${searchParam}%` };
    }
    if (type) where.type = type;
    if (status) where.status = status;

    const { count, rows: records } = await EmailTemplate.findAndCountAll({
      where,
      limit,
      offset,
      order: [["createdAt", "DESC"]]
    });

    return { records, count, hasMore: count > offset + records.length };
  },

  /**
   * Crear plantilla local + sincronizar con provider activo.
   * Si el sync falla, la plantilla local queda creada pero sin providerTemplateId
   * para que el usuario pueda reintentarlo manualmente.
   */
  async create(
    companyId: number,
    userId: number,
    data: CreateTemplateInput
  ): Promise<EmailTemplate> {
    if (!data.name || !data.subject || !data.htmlContent) {
      throw new AppError("name, subject y htmlContent son requeridos", 400);
    }

    const type: "campaign" | "tx" = data.type === "tx" ? "tx" : "campaign";
    const status = data.status || "draft";

    const tpl = await EmailTemplate.create({
      name: data.name,
      subject: data.subject,
      htmlContent: data.htmlContent,
      textContent: data.textContent || "",
      previewText: data.previewText || "",
      type,
      category: data.category || "general",
      status,
      tags: data.tags || [],
      companyId,
      createdBy: userId
    } as any);

    // Sync con provider (best-effort: si falla, log + retornar el local)
    if (status !== "draft") {
      await this.syncToProvider(tpl);
    }

    return tpl;
  },

  /**
   * Actualizar plantilla local + sincronizar con provider si tiene providerTemplateId.
   */
  async update(
    companyId: number,
    id: number,
    data: UpdateTemplateInput
  ): Promise<EmailTemplate> {
    const tpl = await EmailTemplate.findOne({ where: { id, companyId } });
    if (!tpl) throw new AppError("Plantilla no encontrada", 404);

    const updates: Record<string, unknown> = {};
    for (const key of [
      "name", "subject", "htmlContent", "textContent",
      "previewText", "type", "category", "status", "tags"
    ] as const) {
      if (data[key] !== undefined) updates[key] = data[key];
    }

    await tpl.update(updates);

    // Sync con provider
    if (tpl.providerTemplateId && tpl.provider) {
      try {
        const provider = await EmailMarketingFactory.getProvider(companyId);
        if (provider.getProviderName() === tpl.provider) {
          const r = await provider.updateTemplate(tpl.providerTemplateId, {
            name: tpl.name,
            subject: tpl.subject,
            htmlContent: tpl.htmlContent,
            textContent: tpl.textContent,
            type: (tpl.type === "tx" ? "tx" : "campaign") as "campaign" | "tx"
          });
          if (!r.success) {
            logger.warn(
              `[EmailTemplateService] sync provider fallo: ${r.error}`
            );
          }
        }
      } catch (err) {
        logger.warn(
          `[EmailTemplateService] sync provider exception: ${(err as Error).message}`
        );
      }
    } else if (tpl.status === "active") {
      // Si pasa de draft a active, sync por primera vez
      await this.syncToProvider(tpl);
    }

    await tpl.reload();
    return tpl;
  },

  /**
   * Soft-delete: status = archived. NO destroy (BD SAGRADA).
   * Si tiene providerTemplateId, intenta borrar en provider (best-effort).
   */
  async remove(companyId: number, id: number): Promise<void> {
    const tpl = await EmailTemplate.findOne({ where: { id, companyId } });
    if (!tpl) throw new AppError("Plantilla no encontrada", 404);

    // Borrar en remoto (best-effort)
    if (tpl.providerTemplateId && tpl.provider) {
      try {
        const provider = await EmailMarketingFactory.getProvider(companyId);
        if (provider.getProviderName() === tpl.provider) {
          await provider.deleteTemplate(tpl.providerTemplateId);
        }
      } catch (err) {
        logger.warn(
          `[EmailTemplateService] delete remoto fallo: ${(err as Error).message}`
        );
      }
    }

    await tpl.update({ status: "archived" });
  },

  /**
   * Mostrar 1 plantilla.
   */
  async show(companyId: number, id: number): Promise<EmailTemplate> {
    const tpl = await EmailTemplate.findOne({ where: { id, companyId } });
    if (!tpl) throw new AppError("Plantilla no encontrada", 404);
    return tpl;
  },

  /**
   * Duplicar plantilla.
   */
  async duplicate(
    companyId: number,
    userId: number,
    id: number
  ): Promise<EmailTemplate> {
    const original = await this.show(companyId, id);
    const copy = await EmailTemplate.create({
      name: `${original.name} (copia)`,
      subject: original.subject,
      htmlContent: original.htmlContent,
      textContent: original.textContent || "",
      previewText: original.previewText || "",
      type: original.type,
      category: original.category,
      status: "draft",
      tags: original.tags || [],
      companyId,
      createdBy: userId
    } as any);
    return copy;
  },

  /**
   * Sincronizar una plantilla local con el provider activo.
   * Si ya tiene providerTemplateId, hace update; si no, hace create.
   */
  async syncToProvider(tpl: EmailTemplate): Promise<EmailTemplate> {
    try {
      const provider = await EmailMarketingFactory.getProvider(tpl.companyId);
      const data: TemplateData = {
        name: tpl.name,
        subject: tpl.subject,
        htmlContent: tpl.htmlContent,
        textContent: tpl.textContent || "",
        type: (tpl.type === "tx" ? "tx" : "campaign") as "campaign" | "tx",
        previewText: tpl.previewText || ""
      };

      if (tpl.providerTemplateId) {
        // Update existente
        const r = await provider.updateTemplate(tpl.providerTemplateId, data);
        if (!r.success) {
          logger.warn(
            `[EmailTemplateService] sync update fallo: ${r.error}. ` +
            `Reintentando como create.`
          );
          // Si update falla, intentamos crear nueva
          const r2 = await provider.createTemplate(data);
          if (r2.success && r2.data) {
            await tpl.update({
              provider: provider.getProviderName(),
              providerTemplateId: r2.data.providerTemplateId
            });
          }
        }
      } else {
        // Create nuevo
        const r = await provider.createTemplate(data);
        if (r.success && r.data) {
          await tpl.update({
            provider: provider.getProviderName(),
            providerTemplateId: r.data.providerTemplateId
          });
        } else if (!r.success) {
          // Acelle no soporta templates: solo loguear
          logger.warn(
            `[EmailTemplateService] sync create fallo: ${r.error}. ` +
            `La plantilla local queda sin providerTemplateId.`
          );
        }
      }

      await tpl.reload();
      return tpl;
    } catch (err) {
      logger.warn(
        `[EmailTemplateService] syncToProvider exception: ${(err as Error).message}`
      );
      return tpl;
    }
  }
};

export default EmailTemplateService;
