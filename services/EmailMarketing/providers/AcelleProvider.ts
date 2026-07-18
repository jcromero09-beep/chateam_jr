import axios, { AxiosInstance, AxiosError } from "axios";
import logger from "../../../utils/logger";
import {
  EmailMarketingProvider,
  ListData,
  SubscriberData,
  TemplateData,
  CampaignData,
  TestSendData,
  ImportContact,
  ProviderResult,
  ProviderListResult,
  ProviderSubscriberResult,
  ProviderTemplateResult,
  ProviderCampaignResult,
  ImportResult
} from "./EmailMarketingProvider";
import {
  EmailMessage,
  SendEmailResponse,
  BulkEmailMessage,
  BulkSendResponse
} from "./BaseEmailProvider";

/**
 * AcelleProvider — Email Marketing via Acelle Mail API
 *
 * Acelle Mail (https://acellemail.com) es una plataforma SaaS de email marketing
 * que expone una REST API. ChatEAM JR la consume tipicamente apuntando a
 * https://emarketing.ariasofts.com.
 *
 * Configuracion (EmailProviderConfig):
 *   - apiKey: API token de Acelle
 *   - settings.acelleUrl: URL base sin /api/v1, p.ej. "https://emarketing.ariasofts.com"
 *   - verifiedSenderEmail / verifiedSenderName: defaults
 *
 * Acelle expone:
 *   POST /api/v1/lists                      -> crear lista
 *   PATCH /api/v1/lists/{uid}               -> actualizar
 *   DELETE /api/v1/lists/{uid}              -> borrar
 *   POST /api/v1/subscribers                -> crear subscriber (form-encoded)
 *   PATCH /api/v1/subscribers               -> actualizar (form-encoded)
 *   DELETE /api/v1/subscribers              -> borrar
 *   POST /api/v1/campaigns                  -> crear campana
 *   PATCH /api/v1/campaigns/{uid}           -> actualizar
 *   POST /api/v1/campaigns/{uid}/send       -> enviar (segun version)
 *
 * NOTA: Acelle usa `URLSearchParams` en query string. Mantenemos el patron
 * historico para no romper integraciones existentes.
 */
export class AcelleProvider extends EmailMarketingProvider {
  private http: AxiosInstance;
  private baseUrl: string;
  private apiToken: string;
  private fromEmailDefault: string;
  private fromNameDefault: string;

  constructor(apiKey: string, apiSecret?: string, config: Record<string, any> = {}) {
    super(apiKey, apiSecret, config);

    const url = config.acelleUrl || config.url || "";
    if (!url) {
      throw new Error("[Acelle] settings.acelleUrl es requerido");
    }
    if (!apiKey) {
      throw new Error("[Acelle] apiKey es requerido");
    }

    this.baseUrl = url.replace(/\/+$/, "");
    this.apiToken = apiKey;
    this.fromEmailDefault = config.verifiedSenderEmail || config.fromEmail || "noreply@ariasofts.com";
    this.fromNameDefault = config.verifiedSenderName || config.fromName || "Email Marketing";

    const apiBase = this.baseUrl.endsWith("/api/v1")
      ? this.baseUrl
      : `${this.baseUrl}/api/v1`;

    this.http = axios.create({
      baseURL: apiBase,
      timeout: 15000,
      headers: { Accept: "application/json" }
    });

    this.logActivity("Acelle cliente inicializado", { baseUrl: apiBase });
  }

  getProviderName(): string {
    return "acelle";
  }

  // -----------------------------------------------
  // Helpers internos
  // -----------------------------------------------

  private withToken(extra: Record<string, string>): URLSearchParams {
    const p = new URLSearchParams();
    p.append("api_token", this.apiToken);
    Object.entries(extra).forEach(([k, v]) => {
      if (v !== undefined && v !== null) p.append(k, String(v));
    });
    return p;
  }

  // ============================================================================
  // BaseEmailProvider — sendEmail / sendBulkEmails / verifySender / validateConfig
  // ============================================================================

  /**
   * Acelle no tiene endpoint directo de envio transaccional via API publica
   * sin crear una campana. Para `sendEmail` (transaccional puntual) NO es
   * apto: hay que usar otro provider transaccional o crear una mini-campana.
   * Aqui retornamos error explicito para que el caller decida.
   */
  async sendEmail(_message: EmailMessage): Promise<SendEmailResponse> {
    return {
      success: false,
      error:
        "Acelle no soporta envio transaccional directo. Use createCampaign+startCampaign o configure Listmonk para transaccionales."
    };
  }

  async sendBulkEmails(_message: BulkEmailMessage): Promise<BulkSendResponse> {
    return {
      success: false,
      totalRequested: _message.recipients.length,
      totalSent: 0,
      totalFailed: _message.recipients.length,
      results: _message.recipients.map(r => ({
        email: r.email,
        success: false,
        error: "Acelle bulk via sendBulkEmails no soportado. Use createCampaign+startCampaign."
      }))
    };
  }

  async verifySender(_email: string): Promise<boolean> {
    // Acelle no expone verify-sender en API publica
    return true;
  }

  async validateConfig(): Promise<boolean> {
    try {
      // Acelle no expone /me, usamos /lists?per_page=1 como ping
      const params = this.withToken({ per_page: "1" });
      const { status } = await this.http.get(`/lists?${params.toString()}`);
      return status === 200;
    } catch (err) {
      this.logActivity("validateConfig fallo", { error: (err as Error).message }, "error");
      return false;
    }
  }

  // ============================================================================
  // Lists
  // ============================================================================

  async createList(data: ListData): Promise<ProviderResult<ProviderListResult>> {
    try {
      const params = this.withToken({
        name: data.name,
        from_email: data.fromEmail || this.fromEmailDefault,
        from_name: data.fromName || this.fromNameDefault,
        "contact[company]": data.contactCompany || "Empresa",
        "contact[state]": data.contactState || "Estado",
        "contact[address_1]": data.contactAddress1 || "Direccion 1",
        "contact[address_2]": data.contactAddress2 || "",
        "contact[city]": data.contactCity || "Ciudad",
        "contact[zip]": data.contactZip || "00000",
        "contact[phone]": data.contactPhone || "+57 300 000 0000",
        "contact[country_id]": data.contactCountryId || "47",
        "contact[email]": data.contactEmail || "contact@ariasofts.com",
        "contact[url]": data.contactUrl || "",
        subscribe_confirmation: data.subscribeConfirmation ? "1" : "0",
        send_welcome_email: data.sendWelcomeEmail ? "1" : "0",
        unsubscribe_notification: data.unsubscribeNotification ? "1" : "0"
      });

      const { data: resp } = await this.http.post(`/lists?${params.toString()}`, {});
      if (!resp?.list_uid) {
        return { success: false, error: `Respuesta invalida: ${JSON.stringify(resp)}` };
      }

      this.logActivity("createList OK", { providerListId: resp.list_uid });
      return this.ok({ providerListId: resp.list_uid as string });
    } catch (err) {
      return this.fail(err, "createList");
    }
  }

  async updateList(
    providerListId: string,
    data: Partial<ListData>
  ): Promise<ProviderResult> {
    try {
      const fields: Record<string, string> = {};
      if (data.name) fields.name = data.name;
      if (data.fromEmail) fields.from_email = data.fromEmail;
      if (data.fromName) fields.from_name = data.fromName;
      const params = this.withToken(fields);

      await this.http.patch(`/lists/${providerListId}?${params.toString()}`, {});
      return this.ok();
    } catch (err) {
      return this.fail(err, "updateList");
    }
  }

  async deleteList(providerListId: string): Promise<ProviderResult> {
    try {
      const params = this.withToken({});
      await this.http.delete(`/lists/${providerListId}?${params.toString()}`);
      return this.ok();
    } catch (err) {
      return this.fail(err, "deleteList");
    }
  }

  // ============================================================================
  // Subscribers
  // ============================================================================

  async createSubscriber(
    providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult<ProviderSubscriberResult>> {
    try {
      if (!this.isValidEmail(data.email)) {
        return { success: false, error: `Email invalido: ${data.email}` };
      }
      const { firstName, lastName } = this.splitName(data.name);
      const params = this.withToken({
        list_uid: providerListId,
        EMAIL: data.email,
        status: "subscribed",
        ...(data.firstName || firstName ? { FIRST_NAME: data.firstName || firstName } : {}),
        ...(data.lastName || lastName ? { LAST_NAME: data.lastName || lastName } : {})
      });

      const { data: resp } = await this.http.post(`/subscribers?${params.toString()}`, {});
      const subscriberId = resp?.subscriber?.uid || resp?.uid || data.email;
      return this.ok({
        providerSubscriberId: String(subscriberId),
        status: "subscribed"
      });
    } catch (err) {
      return this.fail(err, "createSubscriber");
    }
  }

  async updateSubscriber(
    providerListId: string,
    data: SubscriberData
  ): Promise<ProviderResult> {
    try {
      const { firstName, lastName } = this.splitName(data.name);
      const params = this.withToken({
        list_uid: providerListId,
        EMAIL: data.email,
        ...(data.firstName || firstName ? { FIRST_NAME: data.firstName || firstName } : {}),
        ...(data.lastName || lastName ? { LAST_NAME: data.lastName || lastName } : {})
      });
      await this.http.patch(`/subscribers?${params.toString()}`, {});
      return this.ok();
    } catch (err) {
      return this.fail(err, "updateSubscriber");
    }
  }

  async deleteSubscriber(
    providerListId: string,
    email: string
  ): Promise<ProviderResult> {
    try {
      const url = `/subscribers?api_token=${encodeURIComponent(this.apiToken)}&list_uid=${encodeURIComponent(providerListId)}&EMAIL=${encodeURIComponent(email)}`;
      await this.http.delete(url);
      return this.ok();
    } catch (err) {
      return this.fail(err, "deleteSubscriber");
    }
  }

  async importSubscribers(
    providerListId: string,
    contacts: ImportContact[]
  ): Promise<ProviderResult<ImportResult>> {
    const total = contacts.length;
    const errors: ImportResult["errors"] = [];
    let imported = 0;

    for (const c of contacts) {
      if (!this.isValidEmail(c.email)) {
        errors.push({ email: c.email || "(vacio)", error: "Email invalido" });
        continue;
      }
      const r = await this.createSubscriber(providerListId, {
        email: c.email,
        name: c.name,
        firstName: c.firstName,
        lastName: c.lastName
      });
      if (r.success) {
        imported++;
      } else {
        errors.push({ email: c.email, error: r.error || "Error desconocido" });
      }
    }

    return this.ok({
      totalRequested: total,
      totalImported: imported,
      totalFailed: errors.length,
      errors
    });
  }

  // ============================================================================
  // Templates
  // ============================================================================

  async createTemplate(
    _data: TemplateData
  ): Promise<ProviderResult<ProviderTemplateResult>> {
    return {
      success: false,
      error:
        "Acelle no expone API publica de templates. Cree la plantilla en el panel de Acelle y use el contenido HTML directo en la campana."
    };
  }

  async updateTemplate(
    _providerTemplateId: string,
    _data: Partial<TemplateData>
  ): Promise<ProviderResult> {
    return {
      success: false,
      error: "Acelle no expone API publica de templates."
    };
  }

  async deleteTemplate(_providerTemplateId: string): Promise<ProviderResult> {
    return {
      success: false,
      error: "Acelle no expone API publica de templates."
    };
  }

  // ============================================================================
  // Campaigns
  // ============================================================================

  async createCampaign(
    data: CampaignData
  ): Promise<ProviderResult<ProviderCampaignResult>> {
    try {
      if (!data.providerListIds || data.providerListIds.length === 0) {
        return { success: false, error: "providerListIds vacio" };
      }
      const params = this.withToken({
        name: data.name,
        subject: data.subject,
        from_email: data.fromEmail,
        from_name: data.fromName,
        ...(data.replyTo ? { reply_to: data.replyTo } : {}),
        list_uid: data.providerListIds[0], // Acelle: una campana = una lista principal
        html: data.htmlContent,
        ...(data.textContent ? { plain: data.textContent } : {}),
        track_open: data.trackOpens === false ? "0" : "1",
        track_click: data.trackClicks === false ? "0" : "1",
        ...(data.sendAt
          ? { run_at: data.sendAt.toISOString().slice(0, 19).replace("T", " ") }
          : {})
      });

      const { data: resp } = await this.http.post(`/campaigns?${params.toString()}`, {});
      const uid = resp?.campaign_uid || resp?.uid || resp?.campaign?.uid;
      if (!uid) {
        return { success: false, error: `Respuesta invalida: ${JSON.stringify(resp)}` };
      }
      return this.ok({ providerCampaignId: String(uid), status: "draft" });
    } catch (err) {
      return this.fail(err, "createCampaign");
    }
  }

  async scheduleCampaign(
    providerCampaignId: string,
    sendAt: Date
  ): Promise<ProviderResult> {
    try {
      const params = this.withToken({
        run_at: sendAt.toISOString().slice(0, 19).replace("T", " ")
      });
      await this.http.patch(`/campaigns/${providerCampaignId}?${params.toString()}`, {});
      return this.ok();
    } catch (err) {
      return this.fail(err, "scheduleCampaign");
    }
  }

  async startCampaign(providerCampaignId: string): Promise<ProviderResult> {
    try {
      const params = this.withToken({});
      // Endpoint historico de Acelle para iniciar envio
      await this.http.post(`/campaigns/${providerCampaignId}/send?${params.toString()}`, {});
      return this.ok();
    } catch (err) {
      return this.fail(err, "startCampaign");
    }
  }

  async cancelCampaign(providerCampaignId: string): Promise<ProviderResult> {
    try {
      const params = this.withToken({ status: "paused" });
      await this.http.patch(`/campaigns/${providerCampaignId}?${params.toString()}`, {});
      return this.ok();
    } catch (err) {
      return this.fail(err, "cancelCampaign");
    }
  }

  // ============================================================================
  // Test send
  // ============================================================================

  async sendTest(_data: TestSendData): Promise<ProviderResult<SendEmailResponse>> {
    return {
      success: false,
      error:
        "Envio de prueba directo no soportado en Acelle. Use el panel de Acelle para enviar test desde la campana."
    };
  }
}

export default AcelleProvider;
