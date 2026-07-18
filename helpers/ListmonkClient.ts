import axios, { AxiosInstance, AxiosError } from "axios";
import logger from "../utils/logger";

/**
 * ListmonkClient — Cliente HTTP reusable para Listmonk
 *
 * Centraliza:
 *   - Configuracion (URL, token, timeout) desde .env
 *   - Autenticacion HTTP token (Authorization: token user:secret)
 *   - Helpers de uso frecuente (ensureSubscriber, sendTransactional, sendCampaign)
 *   - Logging consistente
 *
 * Uso:
 *   import { listmonkClient } from "../helpers/ListmonkClient";
 *   if (listmonkClient.isEnabled()) { await listmonkClient.sendTransactional(...) }
 *
 * Si LISTMONK_ENABLED !== "true", isEnabled() retorna false y los metodos
 * de envio tiran un error explicito para que el caller haga fallback.
 */

export interface ListmonkTxPayload {
  to: string;
  toName?: string;
  subject: string;
  html: string;
  templateId?: number;
  fromEmail?: string;
  headers?: Array<Record<string, string>>;
  data?: Record<string, any>;
}

export interface ListmonkSubscriber {
  id: number;
  uuid: string;
  email: string;
  name: string;
  status: string;
}

export interface ListmonkSendResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

class ListmonkClient {
  private http: AxiosInstance | null = null;
  private url: string;
  private apiUser: string;
  private apiToken: string;
  private fromEmail: string;
  private fromName: string;
  private passthroughTemplateId: number;
  private transactionalListId: number;
  private timeoutMs: number;
  private enabled: boolean;

  constructor() {
    this.url = (process.env.LISTMONK_URL || "").replace(/\/+$/, "");
    this.apiUser = process.env.LISTMONK_API_USER || "";
    this.apiToken = process.env.LISTMONK_API_TOKEN || "";
    this.fromEmail = process.env.LISTMONK_FROM_EMAIL || process.env.MAIL_FROM || "";
    this.fromName = process.env.LISTMONK_FROM_NAME || process.env.MAIL_FROM_NAME || "";
    this.passthroughTemplateId = parseInt(
      process.env.LISTMONK_PASSTHROUGH_TEMPLATE_ID || "0",
      10
    );
    this.transactionalListId = parseInt(
      process.env.LISTMONK_TRANSACTIONAL_LIST_ID || "0",
      10
    );
    this.timeoutMs = parseInt(process.env.LISTMONK_TIMEOUT_MS || "10000", 10);
    this.enabled =
      process.env.LISTMONK_ENABLED === "true" &&
      !!this.url &&
      !!this.apiUser &&
      !!this.apiToken;

    if (this.enabled) {
      this.http = axios.create({
        baseURL: this.url,
        timeout: this.timeoutMs,
        headers: {
          Authorization: `token ${this.apiUser}:${this.apiToken}`,
          "Content-Type": "application/json"
        }
      });
    }
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  private assertEnabled(): void {
    if (!this.enabled || !this.http) {
      throw new Error("Listmonk no está habilitado (LISTMONK_ENABLED=false o config incompleta)");
    }
  }

  /**
   * Verificar que Listmonk está vivo y responde.
   */
  async healthCheck(): Promise<boolean> {
    if (!this.enabled || !this.http) return false;
    try {
      await this.http.get("/api/config");
      return true;
    } catch (err) {
      logger.warn(`[Listmonk] healthCheck fallido: ${(err as Error).message}`);
      return false;
    }
  }

  /**
   * Crear o garantizar subscriber (idempotente).
   * Si ya existe (409), lo busca por email y retorna el existente.
   */
  async ensureSubscriber(
    email: string,
    name?: string,
    listIds?: number[]
  ): Promise<ListmonkSubscriber> {
    this.assertEnabled();
    const targetLists = listIds && listIds.length > 0
      ? listIds
      : (this.transactionalListId > 0 ? [this.transactionalListId] : []);

    try {
      const { data } = await this.http!.post("/api/subscribers", {
        email,
        name: name || email.split("@")[0],
        status: "enabled",
        lists: targetLists,
        preconfirm_subscriptions: true
      });
      return data.data as ListmonkSubscriber;
    } catch (err) {
      const ax = err as AxiosError<any>;
      // Si el subscriber ya existe (409 conflict), buscarlo y retornar
      if (ax.response?.status === 409) {
        const existing = await this.findSubscriberByEmail(email);
        if (existing) return existing;
      }
      throw new Error(
        `[Listmonk] ensureSubscriber falló: ${ax.response?.data?.message || ax.message}`
      );
    }
  }

  /**
   * Buscar subscriber por email exacto.
   */
  async findSubscriberByEmail(email: string): Promise<ListmonkSubscriber | null> {
    this.assertEnabled();
    try {
      const safe = email.replace(/'/g, "''");
      const { data } = await this.http!.get("/api/subscribers", {
        params: { query: `subscribers.email = '${safe}'`, per_page: 1 }
      });
      const list = data?.data?.results || [];
      return list.length > 0 ? (list[0] as ListmonkSubscriber) : null;
    } catch (err) {
      logger.warn(`[Listmonk] findSubscriberByEmail error: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Enviar correo transaccional via /api/tx.
   * Requiere que el subscriber exista. Si no existe, lo crea con ensureSubscriber.
   */
  async sendTransactional(payload: ListmonkTxPayload): Promise<ListmonkSendResult> {
    this.assertEnabled();
    const tplId = payload.templateId || this.passthroughTemplateId;
    if (!tplId) {
      return { success: false, error: "LISTMONK_PASSTHROUGH_TEMPLATE_ID no configurado" };
    }

    try {
      // Asegurar subscriber existe (Listmonk lo requiere para /api/tx)
      await this.ensureSubscriber(payload.to, payload.toName);

      const fromEmailHeader = payload.fromEmail
        || `${this.fromName} <${this.fromEmail}>`;

      const body = {
        subscriber_email: payload.to,
        template_id: tplId,
        from_email: fromEmailHeader,
        headers: payload.headers || [{ "X-ChatEAM-Source": "transactional" }],
        content_type: "html",
        data: {
          subject: payload.subject,
          html: payload.html,
          ...(payload.data || {})
        }
      };

      await this.http!.post("/api/tx", body);
      logger.info(`[Listmonk] tx enviado a ${payload.to} | subject="${payload.subject}"`);
      return { success: true };
    } catch (err) {
      const ax = err as AxiosError<any>;
      const msg = ax.response?.data?.message || ax.message;
      logger.warn(`[Listmonk] sendTransactional fallo: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Crear y arrancar una campaña (envío masivo).
   * Retorna el ID de la campaña.
   */
  async sendCampaign(opts: {
    name: string;
    subject: string;
    html: string;
    listIds: number[];
    fromEmail?: string;
    templateId?: number;
  }): Promise<{ success: boolean; campaignId?: number; error?: string }> {
    this.assertEnabled();
    try {
      const fromEmailHeader = opts.fromEmail
        || `${this.fromName} <${this.fromEmail}>`;

      const created = await this.http!.post("/api/campaigns", {
        name: opts.name,
        subject: opts.subject,
        from_email: fromEmailHeader,
        type: "regular",
        content_type: "html",
        body: opts.html,
        lists: opts.listIds,
        template_id: opts.templateId || undefined
      });

      const campaignId = created.data?.data?.id;
      if (!campaignId) {
        return { success: false, error: "No se pudo crear la campaña" };
      }

      // Arrancar la campaña
      await this.http!.put(`/api/campaigns/${campaignId}/status`, { status: "running" });
      logger.info(`[Listmonk] campaña ${campaignId} ('${opts.name}') iniciada → ${opts.listIds.length} lista(s)`);
      return { success: true, campaignId };
    } catch (err) {
      const ax = err as AxiosError<any>;
      const msg = ax.response?.data?.message || ax.message;
      logger.warn(`[Listmonk] sendCampaign fallo: ${msg}`);
      return { success: false, error: msg };
    }
  }

  /**
   * Obtener analytics de una campaña (views, clicks, bounces).
   * Usado por jobs/ListmonkAnalyticsSync.ts (Fase C).
   */
  async getCampaignAnalytics(
    campaignIds: number[],
    type: "views" | "clicks" | "bounces" | "links",
    fromIso?: string,
    toIso?: string
  ): Promise<any[]> {
    this.assertEnabled();
    try {
      const params: Record<string, any> = { id: campaignIds };
      if (fromIso) params.from = fromIso;
      if (toIso) params.to = toIso;
      const { data } = await this.http!.get(`/api/campaigns/analytics/${type}`, { params });
      return data?.data || [];
    } catch (err) {
      const ax = err as AxiosError<any>;
      logger.warn(`[Listmonk] getCampaignAnalytics(${type}) fallo: ${ax.message}`);
      return [];
    }
  }
}

// Singleton
export const listmonkClient = new ListmonkClient();
export default listmonkClient;
